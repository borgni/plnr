/* Синхронизация ноутбук ↔ телефон через Supabase.
   Все дела аккаунта лежат одной записью в таблице plnr_state. Перед отправкой
   данные с устройства и из облака сливаются по каждому делу отдельно: побеждает
   более свежая правка, удаления тоже переносятся. Без интернета всё работает
   как раньше, а при появлении связи изменения досылаются сами. */
window.P = window.P || {};

(() => {
  const CFG = window.PLNR_CONFIG || {};
  const URL_ = (CFG.supabaseUrl || '').replace(/\/+$/, '');
  const KEY = CFG.supabaseKey || '';
  const AUTH_KEY = 'plnr-auth';
  const TOMBSTONE_DAYS = 120;

  const S = {
    session: null,       // { access_token, refresh_token, expires_at, user: { id, email } }
    status: 'off',       // off | idle | syncing | ok | offline | error
    lastSync: 0,
    lastError: '',
    running: null,
    again: false,
  };
  const listeners = new Set();
  const setStatus = (st, err = '') => { S.status = st; S.lastError = err; listeners.forEach((f) => { try { f(); } catch {} }); };

  P.sync = {
    configured: () => !!(URL_ && KEY),
    state: () => S,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* ---------- Слияние ---------- */
  function mergeList(localList, remoteList, deleted) {
    const m = new Map();
    for (const o of remoteList || []) m.set(o.id, o);
    for (const o of localList || []) {
      const r = m.get(o.id);
      if (!r || (o.updatedAt || 0) >= (r.updatedAt || 0)) m.set(o.id, o);
    }
    // удалённое на любом устройстве — убираем, если после удаления его не меняли
    return [...m.values()].filter((o) => !(deleted[o.id] && deleted[o.id] >= (o.updatedAt || 0)));
  }

  P.sync.merge = (local, remote) => {
    if (!remote || !Array.isArray(remote.tasks)) return structuredClone(local);
    const deleted = { ...(remote.deleted || {}) };
    for (const [id, ts] of Object.entries(local.deleted || {})) deleted[id] = Math.max(ts, deleted[id] || 0);
    const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
    for (const id of Object.keys(deleted)) if (deleted[id] < cutoff) delete deleted[id];
    // настройки сливаем по каждой отдельно (темы дел, цвет, проекты)
    const tsOf = (d, k) => {
      const m = d.settingsTs;
      if (m && typeof m === 'object' && Object.keys(m).length) return +m[k] || 0;
      return +d.settingsAt || 0; // данные от старой версии без отдельных меток
    };
    const settings = {}, settingsTs = {};
    const ls = local.settings || {}, rs = remote.settings || {};
    for (const k of new Set([...Object.keys(ls), ...Object.keys(rs)])) {
      const lt = tsOf(local, k), rt = tsOf(remote, k);
      // при равенстве — облако, чтобы все устройства пришли к одному
      const useLocal = !(k in rs) || ((k in ls) && lt > rt);
      settings[k] = structuredClone(useLocal ? ls[k] : rs[k]);
      const t = Math.max(lt, rt);
      if (t > 0) settingsTs[k] = t;
    }
    return {
      version: 1,
      tasks: mergeList(local.tasks, remote.tasks, deleted),
      projects: mergeList(local.projects, remote.projects, deleted),
      deleted,
      settings,
      settingsTs,
      settingsAt: Math.max(local.settingsAt || 0, remote.settingsAt || 0),
    };
  };

  // сравнение без учёта порядка
  const canon = (d) => JSON.stringify({
    t: [...(d.tasks || [])].sort((a, b) => (a.id < b.id ? -1 : 1)),
    p: [...(d.projects || [])].sort((a, b) => (a.id < b.id ? -1 : 1)),
    d: Object.keys(d.deleted || {}).sort().map((k) => [k, d.deleted[k]]),
    s: Object.keys(d.settings || {}).sort().map((k) => [k, d.settings[k]]),
    st: Object.keys(d.settingsTs || {}).sort().map((k) => [k, d.settingsTs[k]]),
    sa: d.settingsAt || 0,
  });

  /* ---------- Сеть ---------- */
  async function http(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    const h = { apikey: KEY, 'Content-Type': 'application/json', ...headers };
    if (auth && S.session) h.Authorization = 'Bearer ' + S.session.access_token;
    let res;
    try {
      res = await fetch(URL_ + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      const err = new Error('offline'); err.offline = true; throw err;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const err = new Error((json && (json.msg || json.message || json.error_description || json.error)) || ('HTTP ' + res.status));
      err.status = res.status; throw err;
    }
    return json;
  }

  const saveSession = () => { try { S.session ? localStorage.setItem(AUTH_KEY, JSON.stringify(S.session)) : localStorage.removeItem(AUTH_KEY); } catch {} };
  const fromAuth = (j) => ({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user.id, email: j.user.email },
  });

  async function ensureToken() {
    if (!S.session) throw new Error('not signed in');
    if (S.session.expires_at - 60000 > Date.now()) return;
    const j = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: S.session.refresh_token } });
    S.session = fromAuth(j); saveSession();
  }

  const ruError = (e) => {
    const m = String(e.message || e);
    if (e.offline) return 'Нет связи с интернетом';
    if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
    if (/already registered|already exists/i.test(m)) return 'Такой аккаунт уже есть — нажмите «Войти»';
    if (/Password should be at least/i.test(m)) return 'Пароль должен быть не короче 6 символов';
    if (/valid email|invalid format/i.test(m)) return 'Похоже, почта введена с ошибкой';
    if (e.confirm) return 'Аккаунт создан. Откройте письмо от Supabase, нажмите ссылку подтверждения, затем вернитесь сюда и нажмите «Войти»';
    if (/Email not confirmed/i.test(m)) return 'Почта ещё не подтверждена — нажмите ссылку в письме от Supabase и попробуйте снова';
    if (/rate limit|too many/i.test(m)) return 'Слишком много попыток — подождите минуту';
    return m;
  };
  P.sync.ruError = ruError;

  P.sync.signIn = async (email, password, create = false) => {
    const path = create ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const j = await http(path, { method: 'POST', auth: false, body: { email, password } });
    if (!j || !j.access_token) {
      // включено подтверждение почты: аккаунт создан, вход — после ссылки из письма
      const err = new Error('confirm-email'); err.confirm = true; throw err;
    }
    S.session = fromAuth(j); saveSession();
    setStatus('idle');
    await P.sync.now();
  };

  P.sync.signOut = async () => {
    try { await http('/auth/v1/logout', { method: 'POST' }); } catch {}
    S.session = null; saveSession();
    setStatus('off');
  };

  /* ---------- Сам обмен ---------- */
  async function syncOnce() {
    await ensureToken();
    const uid = S.session.user.id;
    for (let attempt = 0; attempt < 4; attempt++) {
      await P.store.flush();
      const local = structuredClone(P.store.data);
      const rows = await http(`/rest/v1/plnr_state?select=data,rev&user_id=eq.${uid}`);
      const row = rows && rows[0];
      const merged = P.sync.merge(local, row ? row.data : null);
      const mergedC = canon(merged);
      // в облако — если там не то же самое
      if (!row || canon(row.data || {}) !== mergedC) {
        if (!row) {
          try {
            await http('/rest/v1/plnr_state', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { user_id: uid, data: merged, rev: 1, updated_at: new Date().toISOString() } });
          } catch (e) { if (e.status === 409) continue; throw e; } // запись уже создало другое устройство — повторим
        } else {
          const upd = await http(`/rest/v1/plnr_state?user_id=eq.${uid}&rev=eq.${row.rev}`, {
            method: 'PATCH', headers: { Prefer: 'return=representation' },
            body: { data: merged, rev: row.rev + 1, updated_at: new Date().toISOString() },
          });
          if (!upd || !upd.length) continue; // кто-то успел записать раньше — сливаем ещё раз
        }
      }
      // на устройство — если пока мы ждали ответа, здесь ничего не поменяли
      if (canon(P.store.data) !== canon(local)) { S.again = true; return; }
      if (canon(local) !== mergedC) {
        P.store.applySynced(merged);
        P.applySettings && P.applySettings();
        P.refreshDock && P.refreshDock();
      }
      return;
    }
    throw new Error('Не удалось договориться с облаком, попробую позже');
  }

  P.sync.now = async () => {
    if (!P.sync.configured() || !S.session) return;
    if (S.running) { S.again = true; return S.running; }
    setStatus('syncing');
    S.running = (async () => {
      try {
        do { S.again = false; await syncOnce(); } while (S.again);
        S.lastSync = Date.now();
        setStatus('ok');
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          // вход устарел — пробуем обновить, иначе просим войти заново
          try { S.session.expires_at = 0; await ensureToken(); S.running = null; return P.sync.now(); } catch { S.session = null; saveSession(); setStatus('off', 'Войдите снова'); return; }
        }
        setStatus(e.offline ? 'offline' : 'error', ruError(e));
      } finally { S.running = null; }
    })();
    return S.running;
  };

  /* ---------- Когда синхронизироваться ---------- */
  let debounce = null, wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    // после каждого изменения — через пару секунд
    P.store.subscribe((reason) => {
      if (reason === 'sync' || !S.session) return;
      clearTimeout(debounce); debounce = setTimeout(() => P.sync.now(), 2000);
    });
    setInterval(() => { if (!document.hidden) P.sync.now(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) P.sync.now(); });
    window.addEventListener('focus', () => P.sync.now());
    window.addEventListener('online', () => P.sync.now());
  }

  P.sync.start = () => {
    if (!P.sync.configured()) return;
    try { S.session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { S.session = null; }
    if (!S.session || !S.session.refresh_token) { S.session = null; setStatus('off'); return; }
    setStatus('idle');
    wire();
    P.sync.now();
  };

  const signInRaw = P.sync.signIn;
  P.sync.signIn = async (...a) => { await signInRaw(...a); wire(); };
})();
