/* Экран «Календарь»: месяц целиком, дела цветом темы, перетаскивание между днями,
   справа — панель выбранного дня. */
window.P = window.P || {};

(() => {
  const now = new Date();
  const C = { month: new Date(now.getFullYear(), now.getMonth(), 1), selected: P.todayKey(), hidden: new Set(), dir: 0 };
  P.calState = C;
  let root;

  function visible(k) {
    return P.store.on(k).filter((t) => !C.hidden.has(t.category));
  }

  function headHTML() {
    if (P.isMobile()) return mobileHeadHTML();
    const y = C.month.getFullYear(), m = C.month.getMonth();
    const isCur = y === now.getFullYear() && m === now.getMonth();
    return `<div class="cal-head">
      <div class="cal-title">
        <button class="cal-month" data-act="pick" title="Выбрать месяц">${P.MONTHS[m]}</button>
        <span class="cal-year">${y}</span>
      </div>
      <div class="cat-filter inline">
        ${P.filterCats().map((id) => {
          const c = P.catOf(id);
          return `<button class="cat-chip ${C.hidden.has(id) ? 'off' : ''}" data-filter="${id}" style="--c:${c.color}">${P.icon(c.icon)}<span>${P.esc(c.name)}</span></button>`;
        }).join('')}
      </div>
      <div class="day-nav glass">
        <button class="icon-btn" data-act="prev" title="Предыдущий месяц (←)">${P.icon('chevron-left')}</button>
        <button class="nav-today ${isCur ? 'dim' : ''}" data-act="today">Сегодня</button>
        <button class="icon-btn" data-act="next" title="Следующий месяц (→)">${P.icon('chevron-right')}</button>
      </div>
    </div>`;
  }

  /* iPhone: карточка месяца со стрелками и прогрессом за месяц, ниже темы */
  function mobileHeadHTML() {
    const y = C.month.getFullYear(), m = C.month.getMonth();
    const prefix = `${y}-${P.pad(m + 1)}-`;
    const mt = P.store.all().filter((t) => t.date.startsWith(prefix));
    const done = mt.filter((t) => t.done).length;
    const right = `<div class="mhero-btns">
      <button class="icon-btn glass" data-act="prev" aria-label="Предыдущий месяц">${P.icon('chevron-left')}</button>
      <button class="icon-btn glass" data-act="next" aria-label="Следующий месяц">${P.icon('chevron-right')}</button></div>`;
    return `<div class="cal-head">${P.mhero({ label: String(y), big: P.MONTHS[m], right, done, total: mt.length,
      barText: mt.length ? `${done} из ${mt.length} за месяц` : 'дел нет', act: 'pick' })}
      <div class="cat-filter inline">
        ${P.filterCats().map((id) => {
          const c = P.catOf(id);
          return `<button class="cat-chip ${C.hidden.has(id) ? 'off' : ''}" data-filter="${id}" style="--c:${c.color}">${P.icon(c.icon)}<span>${P.esc(c.name)}</span></button>`;
        }).join('')}
      </div></div>`;
  }

  function gridHTML() {
    const y = C.month.getFullYear(), m = C.month.getMonth();
    const first = new Date(y, m, 1);
    const lead = P.mondayIndex(first);
    const daysIn = new Date(y, m + 1, 0).getDate();
    const weeks = Math.ceil((lead + daysIn) / 7);
    const start = new Date(y, m, 1 - lead);
    const today = P.todayKey();

    // сколько дел помещается в ячейку (по реальной высоте ячейки)
    const cellH = C.cellH || (innerHeight - 44 - 126 - 92 - 40) / weeks;
    const maxChips = P.isMobile() ? 3 : Math.max(1, Math.min(6, Math.floor((cellH - 30) / 21)));
    C.lastWeeks = weeks;

    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = P.key(d);
      const list = visible(k);
      const shown = list.slice(0, maxChips);
      const more = list.length - shown.length;
      cells += `<div class="cell ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === C.selected ? 'sel' : ''} ${i % 7 > 4 ? 'wknd' : ''}" data-k="${k}">
        <div class="cell-head">
          <span class="cell-num">${d.getDate()}</span>
          ${more > 0 ? `<span class="cell-more" title="Ещё ${more} — нажмите, чтобы увидеть все">+${more}</span>` : ''}
          <button class="cell-add" data-act="add-on" title="Добавить дело на ${P.fmtLong(k)}">${P.icon('plus')}</button>
        </div>
        <div class="cell-list">
          ${shown.map((t) => `<div class="cchip ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${P.catOf(t.category).color}" title="${P.esc(t.title)} · ${P.timeRange(t)}">
            ${t.done ? P.icon('check', 'cchip-ok') : '<i></i>'}${t.start ? `<b>${t.start}</b>` : ''}<span>${P.esc(t.title)}</span></div>`).join('')}
        </div>
      </div>`;
    }
    return `<div class="cal-grid glass ${C.dir ? (C.dir > 0 ? 'from-right' : 'from-left') : ''}" style="--weeks:${weeks}">
      <div class="cal-wd">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w, i) => `<span class="${i > 4 ? 'wknd' : ''}">${w}</span>`).join('')}</div>
      <div class="cal-cells">${cells}</div>
    </div>`;
  }

  function sideHTML() {
    if (P.isMobile()) return mobileSideHTML();
    const k = C.selected;
    const list = P.store.on(k);
    const done = list.filter((t) => t.done).length;
    const y = C.month.getFullYear(), m = C.month.getMonth();
    const prefix = `${y}-${P.pad(m + 1)}-`;
    const monthTasks = P.store.all().filter((t) => t.date.startsWith(prefix));
    const maxCat = Math.max(1, ...P.filterCats().map((id) => monthTasks.filter((t) => t.category === id).length));

    return `<aside class="cal-side glass">
      <div class="side-day">
        <div class="side-date">
          <span class="side-num">${P.parse(k).getDate()}</span>
          <div>
            <div class="side-wd">${P.weekday(k)}</div>
            <div class="muted">${P.relLabel(k) ? P.relLabel(k) + ', ' : ''}${P.fmtLongYear(k)}</div>
          </div>
        </div>
        <div class="side-count">${list.length ? `${done}/${list.length}` : ''}</div>
      </div>

      <div class="side-list" data-k="${k}">
        ${list.length ? list.map((t) => `
          <div class="side-item ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${P.catOf(t.category).color}">
            <button class="check sm ${t.done ? 'on' : ''}" data-act="toggle">${P.icon('check')}</button>
            <div class="side-item-text" data-act="edit">
              <span class="side-item-title">${P.esc(t.title)}</span>
              <span class="side-item-meta"><i></i>${P.esc(P.catOf(t.category).name)} · ${P.timeRange(t)}${P.projTag(t, 'inline')}</span>
            </div>
            <button class="icon-btn sm danger" data-act="delete" title="Удалить">${P.icon('trash-2')}</button>
          </div>`).join('') : `<div class="side-empty">${P.icon('sparkles')}<span>${P.isMobile() ? 'Нет дел на этот день.' : 'Нет дел. Дважды нажмите на день в календаре, чтобы быстро добавить.'}</span></div>`}
      </div>

      <div class="side-actions">
        <button class="btn primary" data-act="add-sel">${P.icon('plus')}Добавить</button>
        <button class="btn ghost" data-act="open-day">${P.icon('sun')}Открыть день</button>
      </div>

      <div class="side-stats">
        <div class="f-label">${P.MONTHS[m]}: ${monthTasks.length} ${P.plural(monthTasks.length, 'дело', 'дела', 'дел')}</div>
        ${P.filterCats().map((id) => {
          const n = monthTasks.filter((t) => t.category === id).length;
          return `<button class="stat-row" data-goto-cat="${id}" style="--c:${P.catOf(id).color}" title="Показать все дела темы">
            <span>${P.esc(P.catOf(id).name)}</span><span class="bar"><i style="width:${(n / maxCat) * 100}%"></i></span><b>${n}</b></button>`;
        }).join('')}
      </div>
    </aside>`;
  }

  /* iPhone: выбранный день — заголовок и карточки дел в стиле «Сегодня» */
  function mobileSideHTML() {
    const k = C.selected;
    const list = P.store.on(k).sort(P.byDoneThenTime);
    const rel = P.relLabel(k);
    return `<aside class="cal-side mside">
      <button class="mside-head" data-act="open-day"><b>${P.parse(k).getDate()} · ${P.weekday(k).toLowerCase()}</b><span>${rel ? rel.toLowerCase() + ' · ' : ''}удерживайте день — новое дело</span></button>
      <div class="side-list" data-k="${k}">
        ${list.length ? list.map((t) => {
          const c = P.catOf(t.category);
          const tr = P.timeRange(t);
          return `<div class="side-item mcard glass ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${c.color}">
            <i class="mcard-bar"></i>
            <div class="mcard-body" data-act="edit"><span class="mcard-title">${P.esc(t.title)}</span><span class="mcard-meta">${P.esc(c.name)} · ${tr.charAt(0).toLowerCase() + tr.slice(1)}</span></div>
            <button class="check ${t.done ? 'on' : ''}" data-act="toggle">${P.icon('check')}</button>
          </div>`;
        }).join('') : `<button class="mside-empty" data-act="add-sel">${P.icon('plus')}Нет дел — нажмите, чтобы добавить</button>`}
      </div>
    </aside>`;
  }

  function render() {
    const dir = C.dir;
    const top = root.scrollTop;
    root.innerHTML = `${headHTML()}<div class="cal-body">${gridHTML()}${sideHTML()}</div>`;
    // если реальная высота ячеек отличается от оценки — перерисовать сетку точно
    const cell = root.querySelector('.cell');
    if (cell) {
      const h = cell.clientHeight;
      const old = C.cellH;
      C.cellH = h;
      if (!old || Math.floor((old - 30) / 21) !== Math.floor((h - 30) / 21)) {
        C.dir = 0;
        const grid = root.querySelector('.cal-grid');
        const fresh = P.h(gridHTML());
        if (dir) fresh.classList.add(dir > 0 ? 'from-right' : 'from-left');
        grid.replaceWith(fresh);
      }
    }
    C.dir = 0;
    if (top) root.scrollTop = top;
  }

  function renderSide() {
    const side = root.querySelector('.cal-side');
    if (side) side.outerHTML = sideHTML();
  }

  function shiftMonth(n) {
    C.month = new Date(C.month.getFullYear(), C.month.getMonth() + n, 1);
    C.dir = n;
    render();
  }

  function select(k) {
    C.selected = k;
    root.querySelectorAll('.cell').forEach((c) => c.classList.toggle('sel', c.dataset.k === k));
    renderSide();
  }

  P.openCalendarAt = (k) => {
    const d = P.parse(k);
    C.month = new Date(d.getFullYear(), d.getMonth(), 1);
    C.selected = k;
    P.show('calendar');
  };

  function onClick(e) {
    if (suppressClick) return; // клик после перетаскивания не считаем
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      const id = filter.dataset.filter;
      C.hidden.has(id) ? C.hidden.delete(id) : C.hidden.add(id);
      render(); return;
    }
    const gc = e.target.closest('[data-goto-cat]');
    if (gc) { P.openTasksFiltered(gc.dataset.gotoCat); return; }

    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;

    if (act === 'prev') return shiftMonth(-1);
    if (act === 'next') return shiftMonth(1);
    if (act === 'today') {
      const n = new Date();
      C.dir = Math.sign((n.getFullYear() - C.month.getFullYear()) * 12 + n.getMonth() - C.month.getMonth());
      C.month = new Date(n.getFullYear(), n.getMonth(), 1);
      C.selected = P.todayKey();
      return render();
    }
    if (act === 'pick') {
      return P.datePicker(actEl, C.selected, (k) => { const d = P.parse(k); C.month = new Date(d.getFullYear(), d.getMonth(), 1); C.selected = k; render(); });
    }
    if (act === 'add-on') { const k = e.target.closest('.cell').dataset.k; select(k); return P.openTaskModal({ date: k }); }
    if (act === 'add-sel') return P.openTaskModal({ date: C.selected });
    if (act === 'open-day') return P.openDay(C.selected);
    if (act === 'toggle') return P.toggleTask(id, e);
    if (act === 'edit') return P.openTaskModal({ task: P.store.get(id) });
    if (act === 'delete') return P.deleteTask(id);
    const sideItem = e.target.closest('.side-item');
    if (sideItem) return P.openTaskModal({ task: P.store.get(sideItem.dataset.id) });

    const chipEl = e.target.closest('.cchip');
    // на телефоне нажатие на день только выбирает его — дела открываются из списка ниже
    if (chipEl && !P.isMobile()) { select(chipEl.closest('.cell').dataset.k); return P.openTaskModal({ task: P.store.get(chipEl.dataset.id) }); }
    const more = e.target.closest('.cell-more');
    if (more) return select(more.closest('.cell').dataset.k);
    const cell = e.target.closest('.cell');
    if (cell) {
      if (cell.classList.contains('out')) {
        const d = P.parse(cell.dataset.k);
        C.dir = d < C.month ? -1 : 1;
        C.month = new Date(d.getFullYear(), d.getMonth(), 1);
        C.selected = cell.dataset.k;
        return render();
      }
      select(cell.dataset.k);
    }
  }

  /* ---------- Перетаскивание дел между днями (мышью) ----------
     Своя реализация на событиях указателя: работает надёжно и показывает «летящую» карточку. */
  let drag = null;          // { id, el, x0, y0, ghost, over }
  let suppressClick = false;

  function onPointerDown(e) {
    if (e.button !== 0 || e.pointerType === 'touch') return; // пальцем — прокрутка и нажатие, без перетаскивания
    const it = e.target.closest('.cchip, .side-item');
    if (!it || e.target.closest('button')) return;
    drag = { id: it.dataset.id, el: it, x0: e.clientX, y0: e.clientY, ghost: null, over: null };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function startDrag(e) {
    const t = P.store.get(drag.id);
    if (!t) return;
    const c = P.catOf(t.category);
    drag.ghost = P.h(`<div class="drag-ghost" style="--c:${c.color}"><span class="dg-ico">${P.icon(c.icon)}</span><span class="dg-title">${P.esc(t.title)}</span>${t.start ? `<b>${t.start}</b>` : ''}</div>`);
    document.body.appendChild(drag.ghost);
    drag.el.classList.add('dragging');
    root.classList.add('is-dragging');
    moveGhost(e);
  }

  function moveGhost(e) {
    drag.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px) rotate(-2deg)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cell = under && under.closest('.cell');
    if (cell !== drag.over) {
      if (drag.over) drag.over.classList.remove('drop');
      drag.over = cell;
      if (cell) cell.classList.add('drop');
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; // просто клик
      startDrag(e);
      if (!drag.ghost) return;
    }
    e.preventDefault();
    moveGhost(e);
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.ghost) return; // это был клик — обработает onClick
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    d.ghost.classList.add('drop-out');
    setTimeout(() => d.ghost.remove(), 220);
    d.el.classList.remove('dragging');
    root.classList.remove('is-dragging');
    if (d.over) d.over.classList.remove('drop');
    const cell = d.over;
    if (!cell) return;
    const k = cell.dataset.k;
    C.selected = k;
    const t = P.store.get(d.id);
    if (!t || t.date === k) { render(); return; }
    const dm = P.parse(k);
    if (dm.getMonth() !== C.month.getMonth() || dm.getFullYear() !== C.month.getFullYear()) C.month = new Date(dm.getFullYear(), dm.getMonth(), 1);
    P.moveTask(d.id, k); // перерисовка придёт сама после изменения данных
  }

  P.screens = P.screens || {};
  P.screens.calendar = {
    mount(el) {
      P.onSwipe(el, (d) => { if (P.isMobile() && !P.isModalOpen()) shiftMonth(d); });
      root = el;
      root.addEventListener('click', onClick);
      // долгое нажатие на день — новое дело на этот день; на деле справа — меню
      P.onLongPress(root, '.cell[data-k]', (cell) => { select(cell.dataset.k); P.openTaskModal({ date: cell.dataset.k }); });
      P.onLongPress(root, '.side-item[data-id]', (el) => P.taskMenu(el, el.dataset.id));
      root.addEventListener('dblclick', (e) => {
        if (P.isMobile()) return;
        const cell = e.target.closest('.cell');
        if (cell && !e.target.closest('.cchip, [data-act]')) P.openTaskModal({ date: cell.dataset.k });
      });
      root.addEventListener('pointerdown', onPointerDown);
      root.addEventListener('dragstart', (e) => e.preventDefault()); // отключаем системное перетаскивание
      root.addEventListener('wheel', (e) => {
        if (!e.target.closest('.cal-grid') || P.isModalOpen()) return;
        if (Math.abs(e.deltaY) < 30) return;
        e.preventDefault();
        if (!root._wheelLock) { root._wheelLock = true; shiftMonth(e.deltaY > 0 ? 1 : -1); setTimeout(() => root._wheelLock = false, 420); }
      }, { passive: false });
      window.addEventListener('resize', P.debounce(() => { C.cellH = 0; if (root.classList.contains('active')) render(); }, 120));
    },
    render,
    onKey(e) {
      if (e.key === 'ArrowLeft') { shiftMonth(-1); return true; }
      if (e.key === 'ArrowRight') { shiftMonth(1); return true; }
      if (e.code === 'KeyT') { root.querySelector('[data-act=today]').click(); return true; }
      return false;
    },
  };
})();
