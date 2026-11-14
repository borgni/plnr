/* Экран 1 — планы на день (по бумажному эскизу):
   большая дата + день недели; если дел немного — высокие карточки в ряд,
   если много — карточки «сжимаются» в стопку, выбранная раскрывается справа. */
window.P = window.P || {};

(() => {
  const S = { date: P.todayKey(), selected: null, hidden: new Set(), dir: 0 };
  P.dayState = S;
  let root, ro;

  const CARD_MIN = 220, GAP = 18;

  function visibleTasks() {
    return P.store.on(S.date).filter((t) => !S.hidden.has(t.category)).sort(P.byDoneThenTime);
  }

  /* ---------- Шапка ---------- */
  function headHTML() {
    const all = P.store.on(S.date);
    const done = all.filter((t) => t.done).length;
    const pct = all.length ? done / all.length : 0;
    const R = 21, C = 2 * Math.PI * R;
    const rel = P.relLabel(S.date);
    const isToday = S.date === P.todayKey();
    const counts = Object.fromEntries(P.filterCats().map((id) => [id, all.filter((t) => t.category === id).length]));

    return `
    <div class="day-head">
      <div class="date-block">
        <button class="big-date" data-act="pick" title="Выбрать дату">${P.fmtNumeric(S.date)}</button>
        <div class="date-side">
          <button class="weekday" data-act="pick">${P.weekday(S.date)}</button>
          <div class="date-meta">
            ${rel ? `<span class="rel-pill ${isToday ? 'is-today' : ''}">${rel}</span>` : ''}
            <span class="muted">${P.fmtLongYear(S.date)}</span>
          </div>
        </div>
      </div>

      <div class="head-right">
        <div class="summary glass shine" title="Сколько дел выполнено за день">
          <svg class="ring" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="${R}" class="ring-bg"/>
            <circle cx="26" cy="26" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
          </svg>
          <div class="summary-text">
            <b>${done} из ${all.length}</b>
            <span>${all.length ? (done === all.length ? 'всё сделано' : 'выполнено') : 'дел нет'}</span>
          </div>
        </div>
        <div class="day-nav glass">
          <button class="icon-btn" data-act="prev" title="Предыдущий день (←)">${P.icon('chevron-left')}</button>
          <button class="nav-today ${isToday ? 'dim' : ''}" data-act="today" title="Вернуться к сегодня (T)">Сегодня</button>
          <button class="icon-btn" data-act="next" title="Следующий день (→)">${P.icon('chevron-right')}</button>
        </div>
        <button class="btn primary" data-act="add" title="Новое дело на этот день (Ctrl+N)">${P.icon('plus')}Дело</button>
      </div>
    </div>

    <div class="cat-filter">
      ${P.filterCats().map((id) => {
        const c = P.catOf(id);
        return `<button class="cat-chip ${S.hidden.has(id) ? 'off' : ''}" data-filter="${id}" style="--c:${c.color}" title="${S.hidden.has(id) ? 'Показать' : 'Скрыть'} тему «${P.esc(c.name)}»">
          ${P.icon(c.icon)}<span>${P.esc(c.name)}</span><em>${counts[id]}</em></button>`;
      }).join('')}
    </div>`;
  }

  /* ---------- Карточки ---------- */
  function chip(t) {
    const c = P.catOf(t.category);
    return `<button class="cat-badge" data-act="cat" style="--c:${c.color}" title="Сменить тему">${P.icon(c.icon)}${P.esc(c.name)}</button>`;
  }
  function check(t) {
    return `<button class="check ${t.done ? 'on' : ''} ${t.done && P.isJustToggled(t.id) ? 'pop' : ''}" data-act="toggle" title="${t.done ? 'Вернуть в работу' : 'Отметить выполненным'}">${P.icon('check')}</button>`;
  }
  function actions(t) {
    return `<div class="card-actions">
      <button class="icon-btn" data-act="edit" title="Изменить">${P.icon('pencil')}</button>
      <button class="icon-btn" data-act="tomorrow" title="Перенести на следующий день">${P.icon('arrow-right')}</button>
      <button class="icon-btn danger" data-act="delete" title="Удалить">${P.icon('trash-2')}</button>
    </div>`;
  }

  function rowCard(t, i) {
    const c = P.catOf(t.category);
    return `<article class="tcard glass shine ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${c.color}; --i:${i}">
      <div class="tcard-glow"></div>
      <div class="tcard-top">${chip(t)}${check(t)}</div>
      <div class="tcard-time">${P.icon('clock')}${P.timeRange(t)}</div>
      <h3 class="tcard-title">${P.esc(t.title)}</h3>
      ${P.projTag(t)}
      ${t.note ? `<p class="tcard-note">${P.esc(t.note)}</p>` : '<div class="tcard-spacer"></div>'}
      <div class="tcard-foot">
        ${t.seriesId ? `<span class="muted small">${P.icon('repeat')}повтор</span>` : '<span></span>'}
        ${actions(t)}
      </div>
    </article>`;
  }

  function stackCard(t, i, sel) {
    const c = P.catOf(t.category);
    return `<article class="scard glass ${t.done ? 'done' : ''} ${sel ? 'sel' : ''}" data-id="${t.id}" data-act="select" style="--c:${c.color}; z-index:${i + 1}">
      <div class="scard-row">
        ${check(t)}
        <span class="scard-title">${P.esc(t.title)}</span>
        <span class="scard-time">${t.start ? t.start : 'весь день'}</span>
      </div>
      <div class="scard-more">
        ${chip(t)}
        <span class="muted">${P.timeRange(t)}</span>
        ${P.projTag(t, 'sm')}
      </div>
      ${t.note ? `<p class="scard-note">${P.esc(t.note)}</p>` : ''}
    </article>`;
  }

  function detailHTML(t) {
    if (!t) return '';
    const c = P.catOf(t.category);
    return `<article class="detail glass shine ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${c.color}">
      <div class="tcard-glow"></div>
      <div class="tcard-top">${chip(t)}${check(t)}</div>
      <div class="detail-time">${P.icon('clock')}${P.timeRange(t)}</div>
      <h2 class="detail-title">${P.esc(t.title)}</h2>
      ${P.projTag(t)}
      ${t.note ? `<p class="detail-note">${P.esc(t.note)}</p>` : `<button class="ghost-note" data-act="edit">${P.icon('pencil')}Добавить заметку</button>`}
      <div class="detail-actions">
        <button class="btn ${t.done ? 'ghost' : 'primary'}" data-act="toggle">${P.icon(t.done ? 'rotate-ccw' : 'check')}${t.done ? 'Вернуть' : 'Готово'}</button>
        <button class="btn ghost" data-act="edit">${P.icon('pencil')}Изменить</button>
        <button class="btn ghost" data-act="tomorrow">${P.icon('arrow-right')}На завтра</button>
        <button class="btn ghost danger" data-act="delete">${P.icon('trash-2')}</button>
      </div>
    </article>`;
  }

  function emptyHTML() {
    const total = P.store.countOn(S.date);
    return `<div class="empty glass shine">
      <div class="empty-ico">${P.icon('sparkles')}</div>
      <h3>${total ? 'Все дела скрыты фильтром' : 'Свободный день'}</h3>
      <p>${total ? 'Включите темы выше, чтобы увидеть дела.' : 'На этот день пока ничего не запланировано.'}</p>
      ${total ? '' : `<button class="btn primary" data-act="add">${P.icon('plus')}Добавить дело</button>`}
    </div>`;
  }

  /* ---------- Раскладка: ряд или стопка ---------- */
  function renderBoard() {
    const board = root.querySelector('.board');
    if (!board) return;
    const tasks = visibleTasks();
    const width = board.clientWidth;

    if (!tasks.length) {
      board.dataset.mode = 'empty';
      board.innerHTML = emptyHTML();
      return;
    }

    // телефон: простой вертикальный список (невыполненные сверху по времени, выполненные внизу)
    if (P.isMobile()) {
      board.dataset.mode = 'list';
      board.innerHTML = `<div class="mlist">${tasks.map(rowCard).join('')}
        <button class="add-card" data-act="add">${P.icon('plus')}<span>Добавить дело</span></button></div>`;
      return;
    }

    const fits = tasks.length * CARD_MIN + (tasks.length - 1) * GAP <= width;
    if (fits) {
      board.dataset.mode = 'row';
      const addFits = (tasks.length + 1) * CARD_MIN + tasks.length * GAP <= width && tasks.length < 4;
      board.innerHTML = `<div class="row">${tasks.map(rowCard).join('')}
        ${addFits ? `<button class="add-card" data-act="add">${P.icon('plus')}<span>Добавить дело</span></button>` : ''}</div>`;
      return;
    }

    // Много дел — стопка
    board.dataset.mode = 'stack';
    if (!tasks.find((t) => t.id === S.selected)) {
      S.selected = (tasks.find((t) => !t.done) || tasks[0]).id;
    }
    const sel = tasks.findIndex((t) => t.id === S.selected);
    board.innerHTML = `
      <div class="stack-col">
        <div class="stack-head"><span>${tasks.length} ${P.plural(tasks.length, 'дело', 'дела', 'дел')}</span><span class="muted">нажмите — выбрать, ещё раз — открыть</span></div>
        <div class="stack-scroll"><div class="stack">${tasks.map((t, i) => stackCard(t, i, i === sel)).join('')}</div></div>
      </div>
      <div class="detail-col">${detailHTML(tasks[sel])}</div>`;
    layoutStack();
  }

  function layoutStack() {
    const scroll = root.querySelector('.stack-scroll');
    const stack = root.querySelector('.stack');
    if (!scroll || !stack) return;
    const cards = [...stack.children];
    const n = cards.length;
    const H = scroll.clientHeight - 20; // без внутренних отступов
    const sel = Math.max(0, cards.findIndex((c) => c.classList.contains('sel')));
    // естественная высота раскрытой карточки (по содержимому)
    const natural = [...cards[sel].children].reduce((a, c) => a + c.offsetHeight + parseFloat(getComputedStyle(c).marginTop || 0), 0) + 18;
    const CH = Math.min(Math.max(natural, 104), 230);
    const LAST = 50; // последняя карточка ничем не накрыта — ей хватает одной строки
    const lastSel = sel === n - 1;
    // «сжатие»: чем больше дел, тем меньше видно у каждой карточки.
    // Если места мало, выбранная не раскрывается в стопке (она и так видна справа целиком).
    let expand = true;
    let peek = n === 1 ? 0 : (H - (lastSel ? CH : CH + 10 + LAST)) / Math.max(1, lastSel ? n - 1 : n - 2);
    if (n > 1 && peek < 44) { expand = false; peek = (H - LAST) / (n - 1); }
    peek = n === 1 ? 0 : Math.max(40, Math.min(78, peek));
    cards.forEach((c) => c.classList.toggle('open', expand && c.classList.contains('sel')));
    const tops = [];
    let y = 0;
    cards.forEach((c, i) => { tops.push(y); y += expand && i === sel ? CH + 10 : peek; });
    const bottom = tops[n - 1] + (expand && sel === n - 1 ? CH : LAST);
    cards.forEach((c, i) => {
      const open = expand && i === sel;
      c.style.top = tops[i] + 'px';
      // карточка не должна торчать ниже последней
      c.style.height = (open ? CH : i === n - 1 ? LAST : Math.min(Math.max(CH, 120), bottom - tops[i])) + 'px';
    });
    const last = cards[n - 1];
    const total = parseFloat(last.style.top) + parseFloat(last.style.height);
    stack.style.height = total + 'px';
    // прокрутить к выбранной, если стопка не помещается
    const selTop = parseFloat(cards[sel].style.top);
    if (selTop < scroll.scrollTop || selTop + parseFloat(cards[sel].style.height) > scroll.scrollTop + H + 20) scroll.scrollTo({ top: selTop - 20, behavior: 'smooth' });
  }

  function selectInStack(id) {
    S.selected = id;
    const stack = root.querySelector('.stack');
    stack.querySelectorAll('.scard').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    layoutStack();
    const t = P.store.get(id);
    const col = root.querySelector('.detail-col');
    col.innerHTML = detailHTML(t);
    col.firstElementChild?.classList.add('pop-in');
  }

  /* ---------- Отрисовка экрана ---------- */
  function render(anim = false) {
    // запоминаем, где были карточки, чтобы плавно переставить их (выполненные уезжают вправо/вниз)
    const mobile = P.isMobile();
    const before = anim || mobile ? null : snapshot();
    // прокрутку списка и полосы тем сохраняем — иначе после любого нажатия всё прыгает в начало
    const oldBoard = root.querySelector('.board');
    const keepTop = !anim || anim === 'filter' ? (oldBoard ? oldBoard.scrollTop : 0) : 0;
    const keepLeft = root.querySelector('.cat-filter')?.scrollLeft || 0;
    const cls = anim === true && !mobile ? 'enter ' + (S.dir > 0 ? 'from-right' : S.dir < 0 ? 'from-left' : '') : '';
    root.innerHTML = `${headHTML()}<div class="board ${cls}"></div>`;
    S.dir = 0;
    renderBoard();
    const board = root.querySelector('.board');
    if (keepTop) board.scrollTop = keepTop;
    const cf = root.querySelector('.cat-filter');
    if (cf && keepLeft) cf.scrollLeft = keepLeft;
    // на телефоне карточки появляются сразу и не двигаются — никаких подёргиваний
    if (mobile) return;
    if (before) flip(before, mobile);
    else if (anim === 'filter') appear(mobile);
  }

  function snapshot() {
    const m = new Map();
    root.querySelectorAll('.board [data-id].tcard, .board .scard, .board .add-card').forEach((el) => m.set(el.dataset.id || 'add', el.getBoundingClientRect()));
    return m;
  }
  // на телефоне — только сдвиг и лёгкое масштабирование, без прозрачности (стекло не мерцает)
  function flip(before, mobile) {
    const dur = mobile ? 420 : 600;
    root.querySelectorAll('.board [data-id].tcard, .board .scard, .board .add-card').forEach((el) => {
      const a = before.get(el.dataset.id || 'add');
      if (!a) {
        el.animate(mobile
          ? [{ transform: 'scale(.97) translateY(6px)' }, { transform: 'none' }]
          : [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .85, .25, 1)' });
        return;
      }
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.2, .85, .25, 1)' });
    });
  }
  // после смены фильтра карточки мягко «встают на место»
  function appear(mobile) {
    root.querySelectorAll('.board [data-id].tcard, .board .add-card').forEach((el, i) => {
      el.animate(mobile
        ? [{ transform: 'translateY(8px) scale(.985)' }, { transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: Math.min(i, 6) * 25, easing: 'cubic-bezier(.2, .85, .25, 1)', fill: 'backwards' });
    });
  }

  function go(k, dir) {
    S.dir = dir ?? Math.sign(P.diffDays(S.date, k));
    S.date = k;
    S.selected = null;
    render(true);
  }
  P.openDay = (k) => {
    S.dir = Math.sign(P.diffDays(S.date, k));
    S.date = k;
    S.selected = null;
    P.show('day');
  };

  function onClick(e) {
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      const id = filter.dataset.filter;
      S.hidden.has(id) ? S.hidden.delete(id) : S.hidden.add(id);
      render('filter');
      return;
    }
    const actEl = e.target.closest('[data-act]');
    if (!actEl) {
      // нажатие на любое место карточки открывает дело
      const c = e.target.closest('.tcard, .detail');
      if (c) P.openTaskModal({ task: P.store.get(c.dataset.id) });
      return;
    }
    const act = actEl.dataset.act;
    const card = e.target.closest('[data-id]');
    const id = card?.dataset.id;

    switch (act) {
      case 'pick': P.datePicker(actEl, S.date, (k) => go(k)); break;
      case 'prev': go(P.addDays(S.date, -1), -1); break;
      case 'next': go(P.addDays(S.date, 1), 1); break;
      case 'today': go(P.todayKey()); break;
      case 'add': P.openTaskModal({ date: S.date }); break;
      case 'toggle': e.stopPropagation(); P.toggleTask(id, e); break;
      case 'edit': P.openTaskModal({ task: P.store.get(id) }); break;
      case 'tomorrow': P.moveTask(id, P.addDays(P.store.get(id).date, 1)); break;
      case 'delete': P.deleteTask(id); break;
      case 'cat': e.stopPropagation(); P.categoryMenu(actEl, P.store.get(id).category, (c) => P.store.update(id, { category: c })); break;
      case 'select': if (id !== S.selected) selectInStack(id); else P.openTaskModal({ task: P.store.get(id) }); break;
    }
  }

  P.screens = P.screens || {};
  P.screens.day = {
    mount(el) {
      P.onSwipe(el, (d) => { if (P.isMobile() && !P.isModalOpen()) go(P.addDays(S.date, d), d); });
      root = el;
      root.addEventListener('click', onClick);
      root.addEventListener('dblclick', (e) => {
        const c = e.target.closest('.scard');
        if (c) P.openTaskModal({ task: P.store.get(c.dataset.id) });
      });
      let roW = 0;
      ro = new ResizeObserver(P.debounce(() => {
        if (!root.classList.contains('active')) return;
        const w = root.clientWidth;
        // на телефоне список не зависит от высоты: клавиатура и панели не должны его перерисовывать
        if (P.isMobile() && w === roW) return;
        roW = w;
        const b = root.querySelector('.board'), top = b ? b.scrollTop : 0;
        renderBoard();
        const nb = root.querySelector('.board'); if (nb && top) nb.scrollTop = top;
      }, 60));
      ro.observe(root);
    },
    render,
    onKey(e) {
      if (e.key === 'ArrowLeft') { go(P.addDays(S.date, -1), -1); return true; }
      if (e.key === 'ArrowRight') { go(P.addDays(S.date, 1), 1); return true; }
      if (e.code === 'KeyT') { go(P.todayKey()); return true; }
      return false;
    },
  };
})();
