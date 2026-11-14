/* Общие элементы интерфейса: окна, всплывающие меню, уведомления, мини-календарь */
window.P = window.P || {};

(() => {
  const layer = () => document.getElementById('layer');

  /* ---------- Уведомления внизу (с кнопкой «Отменить») ---------- */
  P.toast = (text, { action, onAction, kind = 'info', ms = 4200 } = {}) => {
    const box = document.getElementById('toasts');
    const el = P.h(`<div class="toast glass ${kind}">
      <span class="toast-ico">${P.icon(kind === 'error' ? 'x' : 'circle-check')}</span>
      <span class="toast-text">${P.esc(text)}</span>
      ${action ? `<button class="toast-btn">${P.icon('rotate-ccw')}${P.esc(action)}</button>` : ''}
    </div>`);
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    const timer = setTimeout(close, ms);
    if (action) el.querySelector('.toast-btn').onclick = () => { clearTimeout(timer); onAction && onAction(); close(); };
    while (box.children.length > 3) box.firstElementChild.remove();
  };

  /* ---------- Модальное окно ---------- */
  P.modal = ({ title, body, wide = false, onClose } = {}) => {
    const el = P.h(`<div class="modal-wrap">
      <div class="modal-backdrop"></div>
      <div class="modal glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${P.esc(title || '')}</h2>
          <button class="icon-btn glass-btn" data-close title="Закрыть (Esc)">${P.icon('x')}</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>`);
    const bodyEl = el.querySelector('.modal-body');
    if (body instanceof Node) bodyEl.appendChild(body); else if (body) bodyEl.innerHTML = body;
    layer().appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      el.classList.remove('in');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => el.remove(), 260);
      onClose && onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.popover')) { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey, true);
    el.querySelector('.modal-backdrop').onclick = close;
    el.querySelector('[data-close]').onclick = close;
    return { el, body: bodyEl, close };
  };

  P.isModalOpen = () => !!document.querySelector('.modal-wrap');

  /* ---------- Подтверждение с вариантами ---------- */
  P.confirm = ({ title, text, buttons }) => new Promise((resolve) => {
    const body = P.h(`<div class="confirm">
      <p>${P.esc(text || '')}</p>
      <div class="confirm-actions">
        ${buttons.map((b, i) => `<button class="btn ${b.kind || ''}" data-i="${i}">${P.esc(b.label)}</button>`).join('')}
      </div>
    </div>`);
    let value = null;
    const m = P.modal({ title, body, onClose: () => resolve(value) });
    body.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { value = buttons[+b.dataset.i].value; m.close(); });
    body.querySelector('.btn.primary, .btn.danger')?.focus();
  });

  /* ---------- Всплывающее меню рядом с элементом ---------- */
  let currentPop = null;
  P.closePopover = () => { if (currentPop) { currentPop.close(); currentPop = null; } };

  P.popover = (anchor, content, { align = 'start', className = '' } = {}) => {
    P.closePopover();
    const el = P.h(`<div class="popover glass ${className}"></div>`);
    if (content instanceof Node) el.appendChild(content); else el.innerHTML = content;
    layer().appendChild(el);

    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = el.offsetWidth, ph = el.offsetHeight;
      let x = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
      let y = r.bottom + 10;
      if (y + ph > innerHeight - 12) y = Math.max(12, r.top - ph - 10);
      x = Math.min(Math.max(12, x), innerWidth - pw - 12);
      el.style.left = x + 'px'; el.style.top = y + 'px';
    };
    place();
    requestAnimationFrame(() => el.classList.add('in'));

    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) api.close(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); api.close(); } };
    setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('keydown', onKey, true);
    });
    window.addEventListener('resize', place);

    const api = {
      el, place,
      close() {
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', place);
        el.classList.remove('in');
        setTimeout(() => el.remove(), 180);
        if (currentPop === api) currentPop = null;
      },
    };
    currentPop = api;
    return api;
  };

  /* ---------- Меню выбора темы (категории) ---------- */
  P.categoryMenu = (anchor, current, onPick) => {
    const box = P.h(`<div class="menu">
      ${[...P.CAT_IDS, ...(P.CAT_IDS.includes(current) ? [] : [current])].map((id) => {
        const c = P.catOf(id);
        return `<button class="menu-item ${id === current ? 'active' : ''}" data-cat="${id}" style="--c:${c.color}">
          <span class="cat-dot">${P.icon(c.icon)}</span>${P.esc(c.name)}${c.deleted ? ' <small class="muted">(удалена)</small>' : ''}${id === current ? P.icon('check', 'menu-check') : ''}
        </button>`;
      }).join('')}
    </div>`);
    const pop = P.popover(anchor, box);
    box.onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) { if (b.dataset.cat !== current) onPick(b.dataset.cat); pop.close(); }
    };
    return pop;
  };

  /* ---------- Мини-календарь для выбора даты ---------- */
  P.datePicker = (anchor, valueKey, onPick, { align = 'start' } = {}) => {
    let view = P.parse(valueKey || P.todayKey());
    view.setDate(1);
    const box = P.h(`<div class="minical"></div>`);
    const render = () => {
      const y = view.getFullYear(), m = view.getMonth();
      const first = new Date(y, m, 1);
      const start = new Date(y, m, 1 - P.mondayIndex(first));
      const today = P.todayKey();
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const k = P.key(d);
        const n = P.store.countOn(k);
        cells += `<button class="mc-day ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === valueKey ? 'sel' : ''} ${i % 7 > 4 ? 'wknd' : ''}" data-k="${k}">
          ${d.getDate()}${n ? `<i class="mc-dot"></i>` : ''}</button>`;
      }
      box.innerHTML = `
        <div class="mc-head">
          <button class="icon-btn" data-nav="-1">${P.icon('chevron-left')}</button>
          <span>${P.MONTHS[m]} ${y}</span>
          <button class="icon-btn" data-nav="1">${P.icon('chevron-right')}</button>
        </div>
        <div class="mc-wd">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="mc-grid">${cells}</div>
        <div class="mc-foot">
          <button class="chip-btn" data-q="0">Сегодня</button>
          <button class="chip-btn" data-q="1">Завтра</button>
          <button class="chip-btn" data-q="7">Через неделю</button>
        </div>`;
    };
    render();
    const pop = P.popover(anchor, box, { align, className: 'pop-cal' });
    box.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { view.setMonth(view.getMonth() + +nav.dataset.nav); render(); pop.place(); return; }
      const d = e.target.closest('[data-k]');
      if (d) { onPick(d.dataset.k); pop.close(); return; }
      const q = e.target.closest('[data-q]');
      if (q) { onPick(P.addDays(P.todayKey(), +q.dataset.q)); pop.close(); }
    });
    box.addEventListener('wheel', (e) => { e.preventDefault(); view.setMonth(view.getMonth() + (e.deltaY > 0 ? 1 : -1)); render(); }, { passive: false });
    return pop;
  };

  /* ---------- Блик «жидкого стекла», который следует за курсором ---------- */
  let shineEvt = null;
  document.addEventListener('pointermove', (e) => {
    if (!shineEvt) requestAnimationFrame(() => {
      const ev = shineEvt; shineEvt = null;
      const el = ev.target.closest && ev.target.closest('.shine');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    shineEvt = e;
  }, { passive: true });

  /* ---------- Удаление с возможностью отмены ---------- */
  P.deleteTask = async (id) => {
    const t = P.store.get(id);
    if (!t) return;
    let ids = [id];
    if (t.seriesId && P.store.series(t.seriesId).length > 1) {
      const later = P.store.series(t.seriesId).filter((x) => x.date >= t.date);
      const choice = await P.confirm({
        title: 'Удалить повторяющееся дело',
        text: `«${t.title}» повторяется. Что удалить?`,
        buttons: [
          { label: 'Отмена', value: null },
          { label: 'Только это', value: 'one', kind: 'ghost' },
          { label: `Это и следующие (${later.length})`, value: 'later', kind: 'danger' },
        ],
      });
      if (!choice) return;
      if (choice === 'later') ids = later.map((x) => x.id);
    }
    const removed = P.store.remove(ids);
    P.toast(removed.length > 1 ? `Удалено дел: ${removed.length}` : 'Дело удалено', {
      action: 'Отменить', onAction: () => P.store.restore(removed),
    });
  };

  /* Отметка «выполнено» с маленьким салютом из галочки */
  let justToggled = { id: null, at: 0 };
  P.isJustToggled = (id) => justToggled.id === id && Date.now() - justToggled.at < 600;
  P.toggleTask = (id, evt) => {
    const t = P.store.get(id);
    if (!t) return;
    const willBeDone = !t.done;
    let x = innerWidth / 2, y = innerHeight / 2;
    const src = evt && evt.target && evt.target.closest('.check, .done-toggle');
    if (src) { const r = src.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    justToggled = { id, at: Date.now() };
    P.store.toggle(id);
    if (willBeDone) P.burst(x, y);
  };

  P.burst = (x, y) => {
    const box = document.createElement('div');
    box.className = 'burst';
    box.style.left = x + 'px'; box.style.top = y + 'px';
    const colors = ['var(--done)', '#ffffff', 'var(--acc-soft)', 'var(--done)'];
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('i');
      const a = (Math.PI * 2 * i) / 14 + Math.random() * .3;
      const dist = 34 + Math.random() * 26;
      d.style.setProperty('--dx', Math.cos(a) * dist + 'px');
      d.style.setProperty('--dy', Math.sin(a) * dist + 'px');
      d.style.background = colors[i % colors.length];
      box.appendChild(d);
    }
    const ring = document.createElement('b');
    box.appendChild(ring);
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 800);
  };

  P.moveTask = (id, dateKey) => {
    const t = P.store.get(id);
    if (!t || t.date === dateKey) return;
    const prev = t.date;
    P.store.update(id, { date: dateKey });
    P.toast(`Перенесено на ${P.fmtFriendly(dateKey).toLowerCase()}`, {
      action: 'Отменить', onAction: () => P.store.update(id, { date: prev }),
    });
  };
})();
