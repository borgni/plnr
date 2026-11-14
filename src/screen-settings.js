/* Экран «Настройки» */
window.P = window.P || {};

(() => {
  let root;

  const groups = () => {
    const m = new Map();
    for (const [id, t] of Object.entries(P.THEMES)) { if (!m.has(t.group)) m.set(t.group, []); m.get(t.group).push(id); }
    return [...m.entries()];
  };
  const sw = (on, act) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" role="switch" aria-checked="${on}"><i></i></button>`;

  function syncHTML() {
    if (!P.sync || !P.sync.configured()) return '';
    const st = P.sync.state();
    if (!st.session) {
      return `<section class="set-card glass sync-card">
        <h3>${P.icon('rotate-ccw')}Синхронизация <span class="h3-note">ноутбук ↔ телефон</span></h3>
        <p class="sync-lead">Войдите одним и тем же аккаунтом на компьютере и на iPhone — дела будут одинаковыми на обоих. Ваши текущие дела при входе не пропадут, а добавятся в облако.</p>
        <form class="sync-form" autocomplete="on">
          <input name="email" type="email" placeholder="Почта" autocomplete="username" required />
          <input name="password" type="password" placeholder="Пароль (от 6 символов)" autocomplete="current-password" required minlength="6" />
          <div class="sync-btns">
            <button type="submit" class="btn primary" data-sync="in">Войти</button>
            <button type="button" class="btn ghost" data-sync="up">Создать аккаунт</button>
          </div>
          ${st.lastError ? `<div class="sync-err">${P.esc(st.lastError)}</div>` : ''}
        </form>
      </section>`;
    }
    const labels = { idle: 'Подключено', syncing: 'Синхронизация…', ok: 'Синхронизировано', offline: 'Нет интернета — изменения отправятся позже', error: 'Ошибка синхронизации' };
    // фоновая синхронизация раз в минуту не должна мигать надписью
    const status = st.status === 'syncing' && st.lastSync ? 'ok' : st.status;
    const time = st.lastSync ? new Date(st.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<section class="set-card glass sync-card">
      <h3>${P.icon('rotate-ccw')}Синхронизация <span class="h3-note">ноутбук ↔ телефон</span></h3>
      <div class="set-row"><div><b>${P.esc(st.session.user.email)}</b>
        <span class="sync-status ${status}"><i></i>${labels[status] || ''}${status === 'ok' && time ? ' в ' + time : ''}${status === 'error' && st.lastError ? ': ' + P.esc(st.lastError) : ''}</span></div>
        <div class="sync-btns">
          <button class="btn ghost" data-sync="now">${P.icon('rotate-ccw')}Сейчас</button>
          <button class="btn ghost danger" data-sync="out">Выйти</button>
        </div>
      </div>
    </section>`;
  }

  function catsHTML() {
    const list = P.store.cats();
    const active = list.filter((c) => !c.deleted);
    const deleted = list.filter((c) => c.deleted);
    return `<div class="cat-list">
      ${active.map((c) => {
        const n = P.store.countByCat(c.id);
        return `<div class="cat-row" data-cid="${c.id}" style="--c:${c.color}">
          <button class="cat-stk" data-cact="sticker" title="Выбрать стикер">${P.icon(c.icon)}</button>
          <input class="cat-name" value="${P.esc(c.name)}" maxlength="20" spellcheck="false" />
          <button class="cat-color" data-cact="color" title="Выбрать цвет"><i></i></button>
          <span class="cat-count">${n} ${P.plural(n, 'дело', 'дела', 'дел')}</span>
          <button class="icon-btn sm danger" data-cact="delete" title="Удалить тему" ${active.length <= 1 ? 'disabled' : ''}>${P.icon('trash-2')}</button>
        </div>`;
      }).join('')}
    </div>
    <div class="cat-foot">
      <button class="btn ghost" data-cact="add" ${active.length >= P.MAX_CATS ? 'disabled' : ''}>${P.icon('plus')}Новая тема</button>
      ${deleted.length ? `<div class="cat-deleted"><span class="muted">Удалённые:</span>
        ${deleted.map((c) => `<button class="chip-btn" data-cact="restore" data-cid="${c.id}" style="--c:${c.color}" title="Вернуть тему">${P.icon(c.icon)}${P.esc(c.name)}${P.icon('rotate-ccw')}</button>`).join('')}
      </div>` : ''}
    </div>`;
  }

  function updateCat(id, patch) {
    const list = P.store.cats().map((c) => (c.id === id ? { ...c, ...patch } : c));
    P.store.saveCats(list);
  }

  async function onCatAction(act, id, anchor) {
    const list = P.store.cats();
    const c = list.find((x) => x.id === id);
    if (act === 'sticker') {
      const box = P.h(`<div class="stk-grid">${P.STICKERS.map((st) => `<button class="stk ${st === c.icon ? 'on' : ''}" data-st="${st}" style="--c:${c.color}" title="${st === 'poop' ? 'Какашка' : ''}">${P.icon(st)}</button>`).join('')}</div>`);
      const pop = P.popover(anchor, box);
      box.onclick = (e) => { const b = e.target.closest('[data-st]'); if (b) { updateCat(id, { icon: b.dataset.st }); pop.close(); render(); } };
    } else if (act === 'color') {
      const box = P.h(`<div class="clr-grid">${P.CAT_COLORS.map((col) => `<button class="clr ${col === c.color ? 'on' : ''}" data-col="${col}" style="--c:${col}"></button>`).join('')}</div>`);
      const pop = P.popover(anchor, box);
      box.onclick = (e) => { const b = e.target.closest('[data-col]'); if (b) { updateCat(id, { color: b.dataset.col }); pop.close(); render(); } };
    } else if (act === 'delete') {
      const n = P.store.countByCat(id);
      const ok = await P.confirm({
        title: `Удалить тему «${c.name}»?`,
        text: n ? `У ${n} ${P.plural(n, 'дела', 'дел', 'дел')} эта тема останется, но выбрать её для новых дел будет нельзя. Вернуть тему можно здесь же, в настройках.` : 'Дел с этой темой нет.',
        buttons: [{ label: 'Отмена', value: false }, { label: 'Удалить', value: true, kind: 'danger' }],
      });
      if (!ok) return;
      // если дел с темой нет — убираем совсем, иначе прячем (у старых дел тема сохранится)
      P.store.saveCats(n ? list.map((x) => (x.id === id ? { ...x, deleted: true } : x)) : list.filter((x) => x.id !== id));
      render();
      P.toast(`Тема «${c.name}» удалена`);
    } else if (act === 'restore') {
      if (list.filter((x) => !x.deleted).length >= P.MAX_CATS) return P.toast(`Можно не больше ${P.MAX_CATS} тем`, { kind: 'error' });
      updateCat(id, { deleted: false });
      render();
    } else if (act === 'add') {
      const usedIcons = new Set(list.map((x) => x.icon));
      const usedColors = new Set(list.filter((x) => !x.deleted).map((x) => x.color));
      const nc = {
        id: 'c' + P.uid(),
        name: 'Новая тема',
        icon: P.STICKERS.find((st) => !usedIcons.has(st)) || 'tag',
        color: P.CAT_COLORS.find((col) => !usedColors.has(col)) || P.CAT_COLORS[0],
      };
      P.store.saveCats([...list, nc]);
      render();
      const inp = root.querySelector(`.cat-row[data-cid="${nc.id}"] .cat-name`);
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  function render() {
    // сохраняем прокрутку, чтобы после изменений экран оставался на том же месте
    const prevTop = root.querySelector('.settings')?.scrollTop || 0;
    draw();
    const sc = root.querySelector('.settings');
    if (sc) sc.scrollTop = prevTop;
  }

  function draw() {
    const s = P.store.settings;
    const total = P.store.all().length;
    const done = P.store.all().filter((t) => t.done).length;
    root.innerHTML = `<div class="settings">
      <div class="set-hero glass shine">
        <img src="logo.svg" alt="" class="set-logo" />
        <div>
          <h1 class="brand-word">PLNR</h1>
          <p class="muted">Ваш день, календарь и дела в одном месте. Всего дел: ${total}, выполнено: ${done}.</p>
        </div>
      </div>

      <div class="set-grid">
        <section class="set-card glass theme-card">
          <h3>${P.icon('sparkles')}Цвет интерфейса</h3>
          <div class="theme-groups">
            ${groups().map(([g, ids]) => `<div class="theme-group">
              <div class="f-label">${g}</div>
              <div class="theme-row">
                ${ids.map((id) => {
                  const t = P.THEMES[id];
                  const on = (s.theme || 'ocean') === id;
                  return `<button class="swatch ${on ? 'on' : ''}" data-theme-pick="${id}" title="${t.name}">
                    <span class="sw-prev" style="background: radial-gradient(120% 90% at 15% 0%, ${t.g1}, transparent 60%), linear-gradient(160deg, ${t.bg1}, ${t.bg3});">
                      <i style="background:${t.blobs[1]}"></i><i style="background:${t.blobs[2]}"></i>
                      <b style="background: linear-gradient(180deg, ${t.l}, ${t.d})"></b>
                      ${on ? `<em>${P.icon('check')}</em>` : ''}
                    </span>
                    <span class="sw-name">${t.name}</span>
                  </button>`;
                }).join('')}
              </div>
            </div>`).join('')}
          </div>
        </section>

        <section class="set-card glass cats-card">
          <h3>${P.icon('tag')}Темы дел <span class="h3-note">меняйте название, цвет и стикер, удаляйте и добавляйте новые</span></h3>
          ${catsHTML()}
        </section>

        ${syncHTML()}

        <section class="set-card glass proj-set">
          <h3>${P.icon('target')}Проекты</h3>
          <div class="set-row"><div><b>Включить проекты</b><span>Добавляет на нижнюю панель вкладку «Проекты»: долгие цели с дедлайном и шкалой выполнения. В делах появится выбор проекта и процент, который даст выполнение дела.</span></div>${sw(!!s.projectsEnabled, 'projects')}</div>
        </section>

        <section class="set-card glass">
          <h3>${P.icon('power')}Система</h3>
          <div class="set-row"><div><b>Папка с данными</b><span>Дела хранятся у вас на компьютере, без интернета. Там же каждый день сохраняется запасная копия (папка backups).</span></div><button class="btn ghost" data-act="folder">Открыть</button></div>
        </section>

        <section class="set-card glass">
          <h3>${P.icon('layers')}Данные</h3>
          <div class="set-row"><div><b>Очистить выполненные</b><span>Удалить все дела, отмеченные как сделанные (${done}).</span></div><button class="btn ghost danger" data-act="clear-done" ${done ? '' : 'disabled'}>${P.icon('trash-2')}Очистить</button></div>
        </section>

        <section class="set-card glass">
          <h3>${P.icon('list-checks')}Горячие клавиши</h3>
          <div class="keys">
            <span><kbd>1</kbd>–<kbd>4</kbd></span><span>Переключить экран (5 — проекты, если включены)</span>
            <span><kbd>Ctrl</kbd> + <kbd>N</kbd></span><span>Новое дело</span>
            <span><kbd>←</kbd> <kbd>→</kbd></span><span>Предыдущий / следующий день или месяц</span>
            <span><kbd>T</kbd></span><span>Вернуться к сегодня</span>
            <span><kbd>/</kbd> или <kbd>Ctrl</kbd> + <kbd>F</kbd></span><span>Поиск на странице «Дела»</span>
            <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span><span>Сохранить дело в форме</span>
            <span><kbd>Esc</kbd></span><span>Закрыть окно</span>
          </div>
        </section>
      </div>
    </div>`;
  }

  async function onClick(e) {
    const sb = e.target.closest('[data-sync]');
    if (sb) {
      e.preventDefault();
      const kind = sb.dataset.sync;
      if (kind === 'now') return P.sync.now();
      if (kind === 'out') {
        const ok = await P.confirm({ title: 'Выйти из аккаунта?', text: 'Дела останутся на этом устройстве, но перестанут синхронизироваться.', buttons: [{ label: 'Отмена', value: false }, { label: 'Выйти', value: true, kind: 'danger' }] });
        if (ok) { await P.sync.signOut(); render(); }
        return;
      }
      const f = root.querySelector('.sync-form');
      const email = f.email.value.trim(), password = f.password.value;
      if (!email || password.length < 6) { P.toast('Введите почту и пароль от 6 символов', { kind: 'error' }); return; }
      sb.disabled = true;
      try {
        await P.sync.signIn(email, password, kind === 'up');
        P.toast(kind === 'up' ? 'Аккаунт создан, синхронизация включена' : 'Вы вошли — дела синхронизируются');
      } catch (err) {
        P.sync.state().lastError = P.sync.ruError(err);
        if (err.confirm) P.toast('Письмо для подтверждения отправлено на ' + email, { ms: 7000 });
      }
      render();
      return;
    }
    const ca = e.target.closest('[data-cact]');
    if (ca) {
      const id = ca.dataset.cid || ca.closest('[data-cid]')?.dataset.cid;
      return onCatAction(ca.dataset.cact, id, ca);
    }
    const th = e.target.closest(".swatch[data-theme-pick]");
    if (th) {
      P.store.setSetting("theme", th.dataset.themePick);
      P.applySettings();
      render();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const api = P.api;
    if (act === 'projects') {
      const on = !P.store.settings.projectsEnabled;
      P.store.setSetting('projectsEnabled', on);
      P.refreshDock();
      render();
      P.toast(on ? 'Проекты включены — новая вкладка на нижней панели' : 'Проекты выключены. Данные проектов сохранены');
      return;
    }
    if (act === 'folder') {
      if (!api.openDataFolder) return P.toast('Доступно только в установленном приложении', { kind: 'error' });
      await P.store.flush();
      const err = await api.openDataFolder();
      if (err) P.toast('Не удалось открыть папку: ' + err, { kind: 'error' });
    } else if (act === 'clear-done') {
      const ids = P.store.all().filter((t) => t.done).map((t) => t.id);
      const ok = await P.confirm({
        title: 'Очистить выполненные?',
        text: `Будет удалено ${ids.length} ${P.plural(ids.length, 'дело', 'дела', 'дел')}.`,
        buttons: [{ label: 'Отмена', value: false }, { label: 'Удалить', value: true, kind: 'danger' }],
      });
      if (ok) { const removed = P.store.remove(ids); P.toast(`Удалено: ${removed.length}`, { action: 'Отменить', onAction: () => P.store.restore(removed) }); }
    }
  }

  P.screens = P.screens || {};
  P.screens.settings = {
    async mount(el) {
      root = el;
      root.addEventListener('click', onClick);
      root.addEventListener('submit', (e) => { if (e.target.closest('.sync-form')) { e.preventDefault(); root.querySelector('[data-sync=in]').click(); } });
      // статус синхронизации меняется часто — обновляем только её карточку и только если текст другой
      let lastSync = '';
      if (P.sync) P.sync.onChange(() => {
        const card = root.querySelector('.sync-card');
        if (!card || root.querySelector('.sync-form input:focus')) return;
        const html = syncHTML();
        if (html === lastSync) return;
        lastSync = html;
        const tpl = document.createElement('template');
        tpl.innerHTML = html.trim();
        card.replaceWith(tpl.content);
      });
      // переименование темы — сохраняем по Enter или при уходе из поля
      root.addEventListener('change', (e) => {
        const inp = e.target.closest('.cat-name');
        if (!inp) return;
        const id = inp.closest('[data-cid]').dataset.cid;
        const name = inp.value.trim();
        if (!name) { inp.value = P.catOf(id).name; return; }
        updateCat(id, { name });
      });
      root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.cat-name')) e.target.blur(); });
    },
    render,
  };
})();
