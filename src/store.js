/* Единое хранилище: все экраны читают и меняют одни и те же данные,
   поэтому день, календарь и список дел всегда синхронизированы. */
window.P = window.P || {};

(() => {
  // iPhone: данные в памяти приложения (Preferences), плюс копия в localStorage
  const prefs = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
  const parse = (v) => { try { const d = JSON.parse(v); return d && Array.isArray(d.tasks) ? d : null; } catch { return null; } };
  const api = window.plannerApi || {
    load: async () => {
      let d = null;
      if (prefs()) { try { const r = await prefs().get({ key: 'plnr-data' }); d = parse(r && r.value); } catch {} }
      if (!d) d = parse(localStorage.getItem('plannner'));
      if (!d) d = parse(localStorage.getItem('plannner.bak'));
      return d;
    },
    save: async (d) => {
      const json = JSON.stringify(d);
      try { const prev = localStorage.getItem('plannner'); if (prev) localStorage.setItem('plannner.bak', prev); localStorage.setItem('plannner', json); } catch {}
      if (prefs()) await prefs().set({ key: 'plnr-data', value: json });
      return true;
    },
  };
  P.api = api;

  const DEFAULTS = {
    version: 1,
    tasks: [],
    projects: [],
    deleted: {},      // id → когда удалено (нужно, чтобы удаление дошло до другого устройства)
    settingsAt: 0,    // устаревшее общее время правки настроек (для старых версий)
    settingsTs: {},   // время правки каждой настройки отдельно: cats, theme, projectsEnabled
    settings: { theme: 'ocean', cats: structuredClone(P.DEFAULT_CATS), projectsEnabled: false },
  };

  const listeners = new Set();
  let data = structuredClone(DEFAULTS);
  let saving = Promise.resolve();

  let timer = null;
  function saveNow() {
    clearTimeout(timer); timer = null;
    const snapshot = structuredClone(data);
    saving = saving.then(() => api.save(snapshot)).catch((e) => {
      console.error(e);
      P.toast && P.toast('Не удалось сохранить изменения', { kind: 'error' });
    });
    return saving;
  }
  const persist = () => { clearTimeout(timer); timer = setTimeout(saveNow, 200); };

  // кэш «дата → дела», сбрасывается при любом изменении
  let index = null;
  function getIndex() {
    if (!index) {
      index = new Map();
      for (const t of data.tasks) {
        let a = index.get(t.date);
        if (!a) index.set(t.date, (a = []));
        a.push(t);
      }
      for (const a of index.values()) a.sort(P.byTime);
    }
    return index;
  }

  /* Метки времени для синхронизации: после каждого изменения смотрим, какие дела/проекты
     поменялись, и ставим им updatedAt; исчезнувшие помечаем как удалённые. */
  let sig = new Map();
  const sigOf = (o) => { const { updatedAt, ...rest } = o; return JSON.stringify(rest); };
  function snapshotSig() {
    sig = new Map();
    for (const t of data.tasks) sig.set('t:' + t.id, sigOf(t));
    for (const p of data.projects) sig.set('p:' + p.id, sigOf(p));
    for (const k of Object.keys(data.settings)) sig.set('s:' + k, JSON.stringify(data.settings[k]));
  }
  function stampChanges() {
    const now = Date.now();
    const next = new Map();
    const mark = (prefix, list) => {
      for (const o of list) {
        const k = prefix + o.id, s = sigOf(o);
        if (sig.get(k) !== s) { o.updatedAt = Math.max(now, (o.updatedAt || 0) + 1); delete data.deleted[o.id]; }
        next.set(k, sigOf(o));
      }
    };
    mark('t:', data.tasks);
    mark('p:', data.projects);
    for (const k of sig.keys()) if (!k.startsWith('s:') && !next.has(k)) data.deleted[k.slice(2)] = now;
    // настройки — каждая отдельно, чтобы смена цвета на телефоне не затирала темы дел с ноутбука
    if (!data.settingsTs || typeof data.settingsTs !== 'object') data.settingsTs = {};
    for (const k of Object.keys(data.settings)) {
      const v = JSON.stringify(data.settings[k]);
      if (sig.get('s:' + k) !== v) { data.settingsTs[k] = Math.max(now, (data.settingsTs[k] || 0) + 1); data.settingsAt = now; }
      next.set('s:' + k, v);
    }
    sig = next;
  }

  function emit(reason) {
    if (reason !== 'sync') stampChanges();
    index = null;
    for (const fn of listeners) { try { fn(reason); } catch (e) { console.error(e); } }
    persist();
  }

  const cleanTs = (o) => {
    const r = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (+v > 0) r[k] = +v;
    return r;
  };

  // данные приходят и из облака — пропускаем в интерфейс только ожидаемые форматы
  const safeId = (v, fallback) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : fallback());
  const safeTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
  const safeColor = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);
  P.safeColor = safeColor;
  P.safeId = (v) => safeId(v, () => '');

  // темы: только корректные id, цвет и стикер (список мог прийти из облака)
  function cleanCats(list) {
    const out = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.id))
      .map((c) => ({ ...c, name: String(c.name || 'Тема').slice(0, 60), color: safeColor(c.color, '#94a3b8'), icon: P.ICONS && P.ICONS[c.icon] ? c.icon : 'tag', deleted: !!c.deleted }));
    return out.length ? out : structuredClone(P.DEFAULT_CATS);
  }

  function normalizeTask(t) {
    return {
      id: safeId(t.id, P.uid),
      title: String(t.title || '').trim() || 'Без названия',
      // неизвестную тему не подменяем: она могла просто ещё не доехать с другого устройства
      category: safeId(t.category, () => P.CAT_IDS[0] || 'study'),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : P.todayKey(),
      start: safeTime(t.start),
      end: safeTime(t.start) ? safeTime(t.end) : '',
      note: String(t.note || ''),
      done: !!t.done,
      seriesId: t.seriesId ? safeId(t.seriesId, () => null) : null,
      createdAt: t.createdAt || Date.now(),
      updatedAt: t.updatedAt || t.createdAt || 0,
      // связь с длительным проектом: сколько % проекта даёт выполнение этого дела
      projectId: t.projectId ? safeId(t.projectId, () => null) : null,
      projectPct: t.projectId ? Math.max(0, Math.min(100, Math.round(+t.projectPct || 0))) : 0,
    };
  }

  function normalizeProject(p) {
    return {
      id: safeId(p.id, () => 'p' + P.uid()),
      name: String(p.name || '').trim() || 'Проект',
      color: safeColor(p.color, '#5cc8ff'),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(p.deadline || '') ? p.deadline : '',
      base: Math.max(0, Math.min(100, Math.round(+p.base || 0))), // прогресс, уже сделанный до начала учёта
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || p.createdAt || 0,
    };
  }

  P.store = {
    async init() {
      const raw = await api.load();
      if (raw && Array.isArray(raw.tasks)) {
        data = {
          ...structuredClone(DEFAULTS),
          ...raw,
          settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
        };
        data.settings.cats = cleanCats(data.settings.cats);
        P.rebuildCats(data.settings.cats);
        data.tasks = raw.tasks.map(normalizeTask);
        data.projects = (Array.isArray(raw.projects) ? raw.projects : []).map(normalizeProject);
        if (!data.deleted || typeof data.deleted !== 'object') data.deleted = {};
        data.settingsAt = +data.settingsAt || 0;
        data.settingsTs = cleanTs(raw.settingsTs);
        index = null;
      } else {
        P.rebuildCats(data.settings.cats);
      }
      snapshotSig();
    },
    /* применить данные, пришедшие из облака (без новых меток времени) */
    applySynced(merged) {
      data = {
        ...structuredClone(DEFAULTS),
        ...merged,
        settings: { ...DEFAULTS.settings, ...(merged.settings || {}) },
      };
      data.settings.cats = cleanCats(data.settings.cats);
      P.rebuildCats(data.settings.cats);
      data.tasks = (merged.tasks || []).map(normalizeTask);
      data.projects = (merged.projects || []).map(normalizeProject);
      data.deleted = merged.deleted || {};
      data.settingsAt = +merged.settingsAt || 0;
      data.settingsTs = cleanTs(merged.settingsTs);
      snapshotSig();
      emit('sync');
    },
    flush() { return timer ? saveNow() : saving; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get data() { return data; },
    get settings() { return data.settings; },

    setSetting(k, v) { data.settings[k] = v; emit('settings'); },

    all() { return data.tasks; },
    get(id) { return data.tasks.find((t) => t.id === id); },
    on(dateKey) { const a = getIndex().get(dateKey); return a ? a.slice() : []; },
    countOn(dateKey) { const a = getIndex().get(dateKey); return a ? a.length : 0; },
    series(seriesId) { return seriesId ? data.tasks.filter((t) => t.seriesId === seriesId) : []; },

    add(tasks) {
      const arr = (Array.isArray(tasks) ? tasks : [tasks]).map(normalizeTask);
      data.tasks.push(...arr);
      emit('add');
      return arr;
    },
    update(id, patch) {
      const t = P.store.get(id);
      if (!t) return null;
      Object.assign(t, patch);
      Object.assign(t, normalizeTask(t));
      emit('update');
      return t;
    },
    updateMany(ids, patchFn) {
      const set = new Set(ids);
      for (const t of data.tasks) if (set.has(t.id)) Object.assign(t, normalizeTask({ ...t, ...patchFn(t) }));
      emit('update');
    },
    toggle(id) {
      const t = P.store.get(id);
      if (t) { t.done = !t.done; emit('toggle'); }
      return t;
    },
    remove(ids) {
      const set = new Set(Array.isArray(ids) ? ids : [ids]);
      const removed = data.tasks.filter((t) => set.has(t.id));
      data.tasks = data.tasks.filter((t) => !set.has(t.id));
      emit('remove');
      return removed;
    },
    restore(tasks) {
      data.tasks.push(...tasks.map(normalizeTask));
      emit('restore');
    },
    replaceAll(raw) {
      data = {
        ...structuredClone(DEFAULTS),
        ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
      };
      data.settings.cats = cleanCats(data.settings.cats);
      P.rebuildCats(data.settings.cats);
      data.tasks = (raw.tasks || []).map(normalizeTask);
      data.projects = (Array.isArray(raw.projects) ? raw.projects : []).map(normalizeProject);
      emit('replace');
    },
    /* --- проекты --- */
    projects() { return data.projects; },
    project(id) { return data.projects.find((p) => p.id === id) || null; },
    addProject(p) { const np = normalizeProject(p); data.projects.push(np); emit('projects'); return np; },
    updateProject(id, patch) {
      const p = data.projects.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, normalizeProject({ ...p, ...patch, id }));
      emit('projects');
      return p;
    },
    // удаление проекта: дела остаются, просто без проекта
    removeProject(id) {
      const p = data.projects.find((x) => x.id === id);
      const linked = data.tasks.filter((t) => t.projectId === id).map((t) => ({ id: t.id, pct: t.projectPct }));
      data.projects = data.projects.filter((x) => x.id !== id);
      for (const t of data.tasks) if (t.projectId === id) { t.projectId = null; t.projectPct = 0; }
      emit('projects');
      return { project: p, linked };
    },
    restoreProject({ project, linked }) {
      if (!project) return;
      data.projects.push(normalizeProject(project));
      const m = new Map(linked.map((l) => [l.id, l.pct]));
      for (const t of data.tasks) if (m.has(t.id)) { t.projectId = project.id; t.projectPct = m.get(t.id); }
      emit('projects');
    },
    // прогресс считается сам: начальный % + % всех выполненных дел проекта
    projectStats(id) {
      const p = P.store.project(id);
      const tasks = data.tasks.filter((t) => t.projectId === id);
      const donePct = tasks.reduce((n, t) => n + (t.done ? t.projectPct : 0), 0);
      const planned = tasks.reduce((n, t) => n + (t.done ? 0 : t.projectPct), 0);
      const pct = Math.min(100, (p ? p.base : 0) + donePct);
      return { pct, planned, tasks, done: tasks.filter((t) => t.done).length };
    },

    /* --- темы дел (только из Настроек) --- */
    cats() { return data.settings.cats; },
    saveCats(list) { data.settings.cats = cleanCats(list); P.rebuildCats(data.settings.cats); emit('cats'); },
    countByCat(id) { return data.tasks.reduce((n, t) => n + (t.category === id ? 1 : 0), 0); },
  };
})();
