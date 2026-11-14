/* Экран «Дела»: слева — создание дела, справа — все дела по группам с поиском и фильтром тем */
window.P = window.P || {};

(() => {
  const T = { q: '', cat: 'all', showDone: false, expanded: new Set() };
  const LIMIT = 40; // сколько строк группы показывать сразу — остальное по кнопке
  let root, form;
  const extras = new Map(); // id → сколько повторов скрыто

  function groups() {
    const today = P.todayKey();
    const tomorrow = P.addDays(today, 1);
    const weekEnd = P.addDays(today, 7);
    const q = T.q.trim().toLowerCase();
    const list = P.store.all()
      .filter((t) => T.cat === 'all' || t.category === T.cat)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : P.byTime(a, b)));

    const g = {
      overdue: { key: 'overdue', title: 'Просрочено', items: [], tone: 'warn' },
      today: { key: 'today', title: 'Сегодня', items: [] },
      tomorrow: { key: 'tomorrow', title: 'Завтра', items: [] },
      week: { key: 'week', title: 'Ближайшая неделя', items: [] },
      later: { key: 'later', title: 'Позже', items: [] },
      past: { key: 'past', title: 'Выполнено раньше', items: [], tone: 'dim' },
    };
    for (const t of list) {
      if (t.date < today) { if (!t.done) g.overdue.items.push(t); else if (T.showDone) g.past.items.push(t); continue; }
      if (t.done && !T.showDone) continue;
      if (t.date === today) g.today.items.push(t);
      else if (t.date === tomorrow) g.tomorrow.items.push(t);
      else if (t.date <= weekEnd) g.week.items.push(t);
      else g.later.items.push(t);
    }
    g.past.items.reverse();
    // повторяющиеся дела в дальних группах показываем один раз: «ещё N повторов»
    extras.clear();
    for (const key of ['week', 'later']) {
      const first = new Map();
      g[key].items = g[key].items.filter((t) => {
        if (!t.seriesId) return true;
        const f = first.get(t.seriesId);
        if (f) { extras.set(f.id, (extras.get(f.id) || 0) + 1); return false; }
        first.set(t.seriesId, t);
        return true;
      });
    }
    return Object.values(g).filter((x) => x.items.length);
  }

  function rowHTML(t, tone) {
    const c = P.catOf(t.category);
    const overdue = tone === 'warn';
    return `<div class="lrow ${t.done ? 'done' : ''}" data-id="${t.id}" style="--c:${c.color}">
      <button class="check sm ${t.done ? 'on' : ''}" data-act="toggle">${P.icon('check')}</button>
      <div class="lrow-main" data-act="edit">
        <span class="lrow-title">${P.esc(t.title)}</span>
        <span class="lrow-meta ${overdue ? 'warn' : ''}">
          <span class="link" data-act="goto-day" title="Открыть этот день">${P.fmtFriendly(t.date)}</span> · ${P.timeRange(t)}
          ${P.projTag(t, 'inline')}
          ${t.seriesId ? ` · ${P.icon('repeat')}${extras.get(t.id) ? `и ещё ${extras.get(t.id)}` : 'повтор'}` : ''}
          ${t.note ? ` · <span class="lrow-note">${P.esc(t.note)}</span>` : ''}
        </span>
      </div>
      ${overdue ? `<button class="chip-btn" data-act="to-today" title="Перенести на сегодня">${P.icon('arrow-right')}На сегодня</button>` : ''}
      <button class="cat-badge" data-act="cat" style="--c:${c.color}">${P.icon(c.icon)}${P.esc(c.name)}</button>
      <div class="lrow-actions">
        <button class="icon-btn sm" data-act="edit" title="Изменить">${P.icon('pencil')}</button>
        <button class="icon-btn sm danger" data-act="delete" title="Удалить">${P.icon('trash-2')}</button>
      </div>
    </div>`;
  }

  function listHTML() {
    const gs = groups();
    if (!gs.length) {
      return `<div class="list-empty">${P.icon('sparkles')}<b>${T.q ? 'Ничего не найдено' : 'Пока пусто'}</b>
        <span>${T.q ? 'Попробуйте другой запрос.' : 'Добавьте первое дело в форме слева.'}</span></div>`;
    }
    return gs.map((g) => {
      const all = T.expanded.has(g.key);
      const shown = all ? g.items : g.items.slice(0, LIMIT);
      const rest = g.items.length - shown.length;
      return `<section class="lgroup ${g.tone || ''}">
        <h4>${g.title}<em>${g.items.length}</em></h4>
        ${shown.map((t) => rowHTML(t, g.tone)).join('')}
        ${rest > 0 ? `<button class="more-btn" data-more="${g.key}">Показать ещё ${rest}</button>` : ''}
      </section>`;
    }).join('');
  }

  function countsHTML() {
    const all = P.store.all().filter((t) => !t.done && t.date >= P.todayKey());
    return `<button class="seg-btn ${T.cat === 'all' ? 'on' : ''}" data-cat-f="all">Все<em>${all.length}</em></button>` +
      P.filterCats().map((id) => `<button class="seg-btn ${T.cat === id ? 'on' : ''}" data-cat-f="${id}" style="--c:${P.catOf(id).color}"><i class="dot"></i>${P.esc(P.catOf(id).name)}<em>${all.filter((t) => t.category === id).length}</em></button>`).join('');
  }

  function render() {
    if (!root.querySelector('.tasks-layout')) {
      root.innerHTML = `<div class="tasks-layout">
        <div class="new-card glass">
          <div class="new-head">
            <div class="new-ico">${P.icon('calendar-plus')}</div>
            <div><h2>Новое дело</h2><span class="muted">Появится в дне и в календаре сразу</span></div>
          </div>
          <div class="new-form"></div>
        </div>
        <div class="list-card glass">
          <div class="list-head">
            <h2>Все дела</h2>
            <label class="search">${P.icon('search')}<input placeholder="Поиск по делам и заметкам" value="${P.esc(T.q)}" /></label>
            <button class="toggle-pill ${T.showDone ? 'on' : ''}" data-act="show-done">${P.icon(T.showDone ? 'eye' : 'eye-off')}Выполненные</button>
          </div>
          <div class="seg list-filter"></div>
          <div class="list-scroll"></div>
        </div>
      </div>`;
      mountForm();
      root.querySelector('.search input').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur(); });
      root.querySelector('.search input').addEventListener('input', P.debounce((e) => { T.q = e.target.value; T.expanded.clear(); renderList(); }, 120));
    }
    renderList();
  }

  function mountForm(prefill = {}) {
    const box = root.querySelector('.new-form');
    form = P.TaskForm({
      ...prefill,
      onDone: (tasks) => {
        const n = tasks.length;
        P.toast(n > 1 ? `Добавлено ${n} ${P.plural(n, 'повтор', 'повтора', 'повторов')}` : `«${tasks[0].title}» — ${P.fmtFriendly(tasks[0].date).toLowerCase()}`, {
          action: 'Отменить', onAction: () => P.store.remove(tasks.map((t) => t.id)),
        });
        form.clearForm();
        // подсветить новое дело в списке
        setTimeout(() => {
          const r = root.querySelector(`.lrow[data-id="${tasks[0].id}"]`);
          if (r) { r.classList.add('flash'); r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        }, 50);
      },
    });
    box.innerHTML = '';
    box.appendChild(form);
  }

  function renderList() {
    if (T.cat !== 'all' && !P.filterCats().includes(T.cat)) T.cat = 'all';
    root.querySelector('.list-filter').innerHTML = countsHTML();
    const sc = root.querySelector('.list-scroll');
    const top = sc.scrollTop;
    sc.innerHTML = listHTML();
    sc.scrollTop = top;
    const sd = root.querySelector('[data-act=show-done]');
    sd.classList.toggle('on', T.showDone);
    sd.innerHTML = `${P.icon(T.showDone ? 'eye' : 'eye-off')}Выполненные`;
  }

  // поиск: открыть «Дела» и поставить курсор в строку поиска
  P.focusSearch = () => {
    if (!root.classList.contains('active')) P.show('tasks');
    const inp = root.querySelector('.search input');
    if (inp) { inp.focus(); inp.select(); }
  };
  P.openTasksFiltered = (cat) => { T.cat = cat; P.show('tasks'); };
  P.focusNewTask = (date) => {
    P.show('tasks');
    mountForm({ date: date || P.todayKey() });
    form.focusTitle();
  };

  function onClick(e) {
    const more = e.target.closest('[data-more]');
    if (more) { T.expanded.add(more.dataset.more); renderList(); return; }
    const cf = e.target.closest('[data-cat-f]');
    if (cf) { T.cat = cf.dataset.catF; T.expanded.clear(); renderList(); return; }
    const actEl = e.target.closest('[data-act]');
    if (e.target.closest('.new-form')) return;
    if (!actEl) {
      const row = e.target.closest('.lrow');
      if (row) P.openTaskModal({ task: P.store.get(row.dataset.id) });
      return;
    }
    const id = e.target.closest('[data-id]')?.dataset.id;
    switch (actEl.dataset.act) {
      case 'show-done': T.showDone = !T.showDone; renderList(); break;
      case 'toggle': P.toggleTask(id, e); break;
      case 'edit': P.openTaskModal({ task: P.store.get(id) }); break;
      case 'delete': P.deleteTask(id); break;
      case 'to-today': P.moveTask(id, P.todayKey()); break;
      case 'goto-day': e.stopPropagation(); P.openDay(P.store.get(id).date); break;
      case 'cat': P.categoryMenu(actEl, P.store.get(id).category, (c) => P.store.update(id, { category: c })); break;
    }
  }

  P.screens = P.screens || {};
  P.screens.tasks = {
    mount(el) {
      root = el; root.addEventListener('click', onClick, false);
      P.onLongPress(root, '.lrow[data-id]', (row) => P.taskMenu(row, row.dataset.id));
    },
    render,
    onStoreChange() { if (root.querySelector('.tasks-layout')) renderList(); else render(); },
    onKey() { return false; },
  };
})();
