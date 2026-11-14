/* Запуск приложения: док, переключение экранов, горячие клавиши */
window.P = window.P || {};

(async () => {
  const ALL_DOCK = [
    { id: 'day', label: 'Сегодня', icon: 'sun' },
    { id: 'calendar', label: 'Календарь', icon: 'calendar-days' },
    { id: 'tasks', label: 'Дела', icon: 'list-checks' },
    { id: 'projects', label: 'Проекты', icon: 'target', optional: true },
    { id: 'add', label: 'Новое дело', icon: 'plus', action: true },
    { id: 'settings', label: 'Настройки', icon: 'settings' },
  ];
  let ORDER = [];
  let active = null;

  // телефон или компьютер: на iPhone и в узком окне — мобильная раскладка
  const mq = matchMedia('(max-width: 700px)');
  const setMobile = () => document.body.classList.toggle('mobile', P.isNative() || mq.matches);
  setMobile();
  if (P.isNative()) {
    document.body.classList.add('native');
    // клавиатура iPhone: тёмная, без серой панели «стрелки/Готово» над ней — как в обычных приложениях
    const kb = window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if (kb) {
      const quiet = (f) => { try { const r = f(); if (r && r.catch) r.catch(() => {}); } catch {} };
      quiet(() => kb.setAccessoryBarVisible({ isVisible: false }));
      quiet(() => kb.setStyle({ style: 'DARK' }));
      try {
        kb.addListener('keyboardWillShow', () => document.body.classList.add('kb-open'));
        kb.addListener('keyboardWillHide', () => document.body.classList.remove('kb-open'));
      } catch {}
    }
  }
  mq.addEventListener('change', () => { setMobile(); if (P.refreshDock) P.refreshDock(); if (active) P.show(active); });

  await P.store.init();

  P.projectsOn = () => !!P.store.settings.projectsEnabled;

  const dock = document.getElementById('dock');
  // док собирается заново, когда в настройках включают или выключают «Проекты»
  let dockKey = '';
  function renderDock() {
    // на iPhone «+» в панели не нужен: новое дело — нажатием на карточку дня
    const items = ALL_DOCK.filter((d) => (!d.optional || P.projectsOn()) && !(d.action && document.body.classList.contains('mobile')));
    const key = items.map((d) => d.id).join();
    if (key === dockKey) return; // состав не изменился — док не пересобираем
    dockKey = key;
    ORDER = items.filter((d) => !d.action).map((d) => d.id);
    dock.innerHTML = `<div class="dock-bubble"></div>` + items.map((d) => `
      <button class="dock-btn ${d.action ? 'dock-add' : ''} ${d.optional ? 'dock-new' : ''}" data-dock="${d.id}" aria-label="${d.label}">
        ${P.icon(d.icon)}<span class="dock-tip">${d.label}</span><span class="dock-badge"></span>
      </button>`).join('');
    dock.querySelectorAll('[data-dock]').forEach((b) => b.classList.toggle('active', b.dataset.dock === active));
    if (active) { updateBadges(); requestAnimationFrame(moveBubble); }
  }
  P.refreshDock = () => {
    renderDock();
    if (active === 'projects' && !P.projectsOn()) P.show('day');
  };

  function moveBubble() {
    const btn = dock.querySelector(`[data-dock="${active}"]`);
    const bub = dock.querySelector('.dock-bubble');
    if (!btn) return;
    // в горизонтальном положении iPhone панель стоит столбиком — пузырь едет вниз-вверх
    if (getComputedStyle(dock).flexDirection === 'column') {
      bub.style.width = '';
      bub.style.height = btn.offsetHeight + 'px';
      bub.style.transform = `translateY(${btn.offsetTop}px)`;
    } else {
      bub.style.height = '';
      bub.style.width = btn.offsetWidth + 'px';
      bub.style.transform = `translateX(${btn.offsetLeft}px)`;
    }
  }

  function updateBadges() {
    if (!dock.querySelector('[data-dock=day]')) return;
    const today = P.todayKey();
    const left = P.store.on(today).filter((t) => !t.done).length;
    const overdue = P.store.all().filter((t) => !t.done && t.date < today).length;
    const set = (id, n, warn) => {
      const b = dock.querySelector(`[data-dock="${id}"] .dock-badge`);
      b.textContent = n > 99 ? '99+' : n || '';
      b.classList.toggle('show', n > 0);
      b.classList.toggle('warn', !!warn);
    };
    set('day', left);
    set('tasks', overdue, true);
  }

  P.show = (name) => {
    if (!P.screens[name]) return;
    if (name === 'projects' && !P.projectsOn()) name = 'day';
    P.closePopover();
    const prev = active;
    active = name;
    document.querySelectorAll('.screen').forEach((s) => {
      const on = s.dataset.screen === name;
      s.classList.toggle('active', on);
      if (on && prev && prev !== name && !document.body.classList.contains('mobile')) {
        s.classList.remove('slide-l', 'slide-r');
        void s.offsetWidth;
        s.classList.add(ORDER.indexOf(name) > ORDER.indexOf(prev) ? 'slide-r' : 'slide-l');
      }
    });
    dock.querySelectorAll('[data-dock]').forEach((b) => b.classList.toggle('active', b.dataset.dock === name));
    const scr = P.screens[name];
    name === 'day' ? scr.render(true) : scr.render();
    moveBubble();
  };

  let shownTheme = null;
  P.applySettings = () => {
    const id = P.store.settings.theme || 'ocean';
    if (id === shownTheme) return; // без лишней перекраски при каждой синхронизации
    shownTheme = id;
    P.applyTheme(id);
  };

  // Новое дело с учётом того, какой день сейчас открыт
  function quickAdd() {
    const date = active === 'day' ? P.dayState.date : active === 'calendar' ? P.calState.selected : P.todayKey();
    P.openTaskModal({ date });
  }

  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dock]');
    if (!b) return;
    if (b.dataset.dock === 'add') return quickAdd();
    P.show(b.dataset.dock);
  });

  // Долгое нажатие на кнопки нижней панели — быстрые команды
  const scrollToCard = (sel) => setTimeout(() => document.querySelector('#screen-settings ' + sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  const dockCommands = (id) => {
    const today = P.todayKey();
    const day = (n) => P.addDays(today, n);
    switch (id) {
      case 'day': return [
        { icon: 'sun', label: 'Сегодня', run: () => P.openDay(today) },
        { icon: 'arrow-right', label: 'Завтра', run: () => P.openDay(day(1)) },
        { icon: 'rotate-ccw', label: 'Вчера', run: () => P.openDay(day(-1)) },
        { icon: 'calendar-days', label: 'Выбрать дату…', run: (a) => P.datePicker(a, P.dayState.date, (k) => P.openDay(k), { align: 'center' }) },
      ];
      case 'calendar': return [
        { icon: 'calendar-days', label: 'Этот месяц', run: () => P.openCalendarAt(today) },
        { icon: 'arrow-right', label: 'Следующий месяц', run: () => { const d = P.parse(today); d.setDate(1); d.setMonth(d.getMonth() + 1); P.openCalendarAt(P.key(d)); } },
        { icon: 'calendar-plus', label: 'Дело на выбранный день', run: () => P.openTaskModal({ date: P.calState.selected }) },
      ];
      case 'tasks': return [
        { icon: 'search', label: 'Поиск по делам', run: () => P.focusSearch() },
        { icon: 'layers', label: 'Все дела', run: () => P.openTasksFiltered('all') },
        ...P.CAT_IDS.slice(0, 4).map((c) => ({ icon: P.catOf(c).icon, label: P.catOf(c).name, run: () => P.openTasksFiltered(c) })),
      ];
      case 'projects': return [
        { icon: 'plus', label: 'Новый проект', run: () => { P.show('projects'); P.openProjectModal(); } },
        { icon: 'target', label: 'Все проекты', run: () => P.show('projects') },
      ];
      case 'add': return [
        { icon: 'sun', label: 'Дело на сегодня', run: () => P.openTaskModal({ date: today }) },
        { icon: 'arrow-right', label: 'Дело на завтра', run: () => P.openTaskModal({ date: day(1) }) },
        { icon: 'calendar-days', label: 'Дело на другой день…', run: (a) => P.datePicker(a, day(2), (k) => P.openTaskModal({ date: k }), { align: 'center' }) },
        P.projectsOn() ? { icon: 'target', label: 'Новый проект', run: () => { P.show('projects'); P.openProjectModal(); } } : null,
      ];
      case 'settings': {
        const st = P.sync && P.sync.state();
        return [
          st && st.session ? { icon: 'rotate-ccw', label: 'Синхронизировать сейчас', run: () => { P.sync.now(); P.toast('Синхронизация…'); } } : null,
          { icon: 'palette', label: 'Цвет оформления', run: () => { P.show('settings'); scrollToCard('.theme-card'); } },
          { icon: 'tag', label: 'Темы дел', run: () => { P.show('settings'); scrollToCard('.cats-card'); } },
        ];
      }
    }
    return [];
  };
  P.onLongPress(dock, '[data-dock]', (btn) => P.actionMenu(btn, dockCommands(btn.dataset.dock)), { delay: 380 });

  renderDock();
  // Монтируем экраны (экран проектов — всегда, а показывается только если функция включена)
  for (const id of ['day', 'calendar', 'tasks', 'projects', 'settings']) await P.screens[id].mount(document.getElementById('screen-' + id));

  // Синхронизация: любое изменение данных перерисовывает открытый экран
  P.store.subscribe((reason) => {
    updateBadges();
    if (reason === 'settings') return;
    const scr = P.screens[active];
    if (!scr) return;
    if (scr.onStoreChange) scr.onStoreChange(); else scr.render();
  });

  // Горячие клавиши — по физическим клавишам (e.code), поэтому работают и в русской раскладке
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && e.code === 'KeyN') {
      e.preventDefault(); if (!P.isModalOpen()) quickAdd(); return;
    }
    if (ctrl && !e.altKey && e.code === 'KeyF') {
      e.preventDefault(); if (!P.isModalOpen()) P.focusSearch(); return;
    }
    if (typing || P.isModalOpen() || document.querySelector('.popover.in') || ctrl || e.altKey) return;
    const digit = /^(Digit|Numpad)([1-5])$/.exec(e.code);
    if (digit) { const id = ORDER[+digit[2] - 1]; if (id) P.show(id); e.preventDefault(); return; }
    if (e.code === 'Slash' || e.key === '/' || e.code === 'NumpadDivide') { e.preventDefault(); P.focusSearch(); return; }
    const scr = P.screens[active];
    if (scr && scr.onKey && scr.onKey(e)) e.preventDefault();
  });

  // Часы в заголовке и смена дня в полночь
  const clock = document.getElementById('tbClock');
  let lastDay = P.todayKey();
  const tick = () => {
    const d = new Date();
    clock.textContent = `${P.WEEKDAYS[d.getDay()]}, ${d.getDate()} ${P.MONTHS_GEN[d.getMonth()]} · ${P.pad(d.getHours())}:${P.pad(d.getMinutes())}`;
    const k = P.todayKey();
    if (k !== lastDay) {
      if (P.dayState.date === lastDay) P.dayState.date = k;
      lastDay = k;
      updateBadges();
      P.show(active);
    }
  };
  tick();
  setInterval(tick, 15000);

  // Экономим ресурсы, когда окно свёрнуто
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('paused', document.hidden);
    if (document.hidden) P.store.flush();
  });
  window.addEventListener('beforeunload', () => { P.store.flush(); });
  if (P.api.onFlush) P.api.onFlush(async () => { try { await P.store.flush(); } catch {} P.api.flushed(); });
  window.addEventListener('resize', P.debounce(moveBubble, 80));

  P.applySettings();
  if (P.sync) P.sync.start();

  // Виджет iPhone: план на ближайшие дни кладём в общую с виджетом папку
  if (P.isNative()) P.widgetState = { status: 'unknown' };
  if (P.isNative()) {
    // вызов плагина виджета: любым из путей, которые есть в мосте Capacitor
    const saveWidget = (json) => {
      const C = window.Capacitor;
      const pl = C.Plugins && C.Plugins.PlnrWidget;
      if (pl && typeof pl.save === 'function') return pl.save({ json });
      if (typeof C.nativePromise === 'function') return C.nativePromise('PlnrWidget', 'save', { json });
      if (typeof C.registerPlugin === 'function') return C.registerPlugin('PlnrWidget').save({ json });
      return Promise.reject(new Error('в мосте Capacitor нет способа вызвать плагин'));
    };
    let last = '';
    const push = () => {
      const th = P.THEMES[P.store.settings.theme] || P.THEMES.ocean;
      const days = {};
      for (let i = -1; i <= 7; i++) {
        const k = P.addDays(P.todayKey(), i);
        days[k] = P.store.on(k).sort(P.byTime).map((t) => ({ t: t.title, time: P.timeRange(t), c: P.catOf(t.category).color, d: !!t.done }));
      }
      const json = JSON.stringify({ theme: { bg0: th.bg0, bg1: th.bg1, acc: th.acc, soft: th.soft }, days });
      if (json === last && P.widgetState.status === 'ok') return;
      last = json;
      let call;
      try { call = Promise.resolve(saveWidget(json)); } catch (e) { call = Promise.reject(e); }
      call.then((r) => {
        const st = r && r.ok ? 'ok' : 'nogroup';
        const changed = st !== P.widgetState.status;
        P.widgetState = { status: st, ...(r || {}) };
        if (changed) P.screens.settings.refreshWidget();
      }).catch((e) => { P.widgetState = { status: 'noplugin', err: String(e && e.message || e) }; P.screens.settings.refreshWidget(); });
    };
    P.store.subscribe(P.debounce(push, 700));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) push(); });
    push();
  }
  updateBadges();
  P.show('day');
  requestAnimationFrame(() => document.body.classList.add('ready'));
})();
