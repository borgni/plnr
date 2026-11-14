/* Долгое нажатие и контекстные меню (как в Telegram): дела, нижняя панель, календарь.
   На компьютере то же меню открывается правой кнопкой мыши. */
window.P = window.P || {};

(() => {
  // лёгкий виброотклик на iPhone
  P.haptic = (style = 'LIGHT') => {
    const h = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (!h) return;
    try { const r = h.impact({ style }); if (r && r.catch) r.catch(() => {}); } catch {}
  };

  /* onLongPress(root, '.selector', (el, point) => ...) */
  // после удержания гасим только «щелчок отпускания» по самому удержанному элементу —
  // следующее нажатие (например, пункт меню) срабатывает с первого раза
  let suppressEl = null, suppressUntil = 0;
  document.addEventListener('click', (e) => {
    if (suppressEl && Date.now() < suppressUntil && suppressEl.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
    suppressEl = null;
  }, true);

  P.onLongPress = (root, selector, fn, { delay = 430 } = {}) => {
    let timer = null, el = null, x0 = 0, y0 = 0;
    const cancel = () => {
      clearTimeout(timer); timer = null;
      if (el) el.classList.remove('lp-press');
      el = null;
    };
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // мышью — правая кнопка
      const t = e.target.closest(selector);
      if (!t || !root.contains(t) || e.target.closest('input, textarea')) return;
      cancel();
      el = t; x0 = e.clientX; y0 = e.clientY;
      el.classList.add('lp-press');
      timer = setTimeout(() => {
        const target = el;
        cancel();
        suppressEl = target; suppressUntil = Date.now() + 1500;
        P.haptic('MEDIUM');
        target.classList.add('lp-pop');
        setTimeout(() => target.classList.remove('lp-pop'), 360);
        fn(target, { x: x0, y: y0 });
      }, delay);
    });
    root.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 9) cancel(); });
    root.addEventListener('pointerup', cancel);
    root.addEventListener('pointercancel', cancel);
    root.addEventListener('scroll', cancel, true);
    root.addEventListener('contextmenu', (e) => {
      const t = e.target.closest(selector);
      if (!t || !root.contains(t)) return;
      e.preventDefault();
      if (e.pointerType === 'touch' || P.isMobile()) return; // на телефоне сработает долгое нажатие
      fn(t, { x: e.clientX, y: e.clientY });
    });
  };

  /* Меню действий рядом с элементом.
     items: [{ icon, label, run, danger, hint, sep }] */
  P.actionMenu = (anchor, items, { title = '' } = {}) => {
    const box = P.h(`<div class="menu ctx-menu">
      ${title ? `<div class="ctx-title">${P.esc(title)}</div>` : ''}
      ${items.filter(Boolean).map((it, i) => it.sep ? '<div class="ctx-sep"></div>' : `
        <button class="menu-item ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}">
          <span class="ctx-ico">${P.icon(it.icon || 'sparkles')}</span><span class="ctx-label">${P.esc(it.label)}</span>${it.hint ? `<small class="ctx-hint">${P.esc(it.hint)}</small>` : ''}
        </button>`).join('')}
    </div>`);
    const list = items.filter(Boolean);
    const pop = P.popover(anchor, box, { align: 'center', className: 'ctx-pop' });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const it = list[+b.dataset.i];
      P.haptic('LIGHT');
      // часть команд открывает своё всплывающее окно у того же элемента — сначала закрываем меню
      pop.close();
      setTimeout(() => it.run && it.run(anchor), 60);
    });
    return pop;
  };

  /* Меню дела: изменить, выполнить, перенести, сменить тему, удалить */
  P.taskMenu = (anchor, id) => {
    const t = P.store.get(id);
    if (!t) return;
    const tomorrow = P.addDays(t.date, 1);
    P.actionMenu(anchor, [
      { icon: 'pencil', label: 'Изменить', run: () => P.openTaskModal({ task: P.store.get(id) }) },
      { icon: t.done ? 'rotate-ccw' : 'check', label: t.done ? 'Вернуть в работу' : 'Выполнено', run: () => P.toggleTask(id) },
      { sep: true },
      { icon: 'arrow-right', label: 'На следующий день', hint: P.fmtFriendly ? P.fmtFriendly(tomorrow) : '', run: () => P.moveTask(id, tomorrow) },
      { icon: 'calendar-days', label: 'Другой день…', run: (a) => P.datePicker(a, t.date, (k) => P.moveTask(id, k), { align: 'center' }) },
      { icon: P.catOf(t.category).icon, label: 'Тема: ' + P.catOf(t.category).name, run: (a) => P.categoryMenu(a, t.category, (c) => P.store.update(id, { category: c })) },
      { sep: true },
      { icon: 'trash-2', label: 'Удалить', danger: true, run: () => P.deleteTask(id) },
    ], { title: t.title });
  };
})();
