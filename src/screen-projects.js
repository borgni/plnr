/* Экран «Проекты» (включается в Настройках): длительные проекты с дедлайном и шкалой выполнения.
   Прогресс считается сам: начальный % + % каждого выполненного дела, привязанного к проекту. */
window.P = window.P || {};

(() => {
  let root;

  function deadlineInfo(p) {
    if (!p.deadline) return { text: 'Без дедлайна', tone: '' };
    const left = P.diffDays(P.todayKey(), p.deadline);
    const when = `до ${P.fmtLongYear(p.deadline)}`;
    if (left < 0) return { text: `${when} · просрочено на ${-left} ${P.plural(-left, 'день', 'дня', 'дней')}`, tone: 'over' };
    if (left === 0) return { text: `${when} · сегодня`, tone: 'soon' };
    return { text: `${when} · осталось ${left} ${P.plural(left, 'день', 'дня', 'дней')}`, tone: left <= 7 ? 'soon' : '' };
  }

  function cardHTML(p, i) {
    const st = P.store.projectStats(p.id);
    const dl = deadlineInfo(p);
    const complete = st.pct >= 100;
    const upcoming = st.tasks.filter((t) => !t.done).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : P.byTime(a, b)));
    const recentDone = st.tasks.filter((t) => t.done).sort((a, b) => (a.date > b.date ? -1 : 1));
    const show = [...upcoming.slice(0, 4), ...recentDone.slice(0, Math.max(0, 5 - Math.min(4, upcoming.length)))];
    const forecast = Math.min(100, st.pct + st.planned);
    return `<article class="pcard glass shine ${complete ? 'complete' : ''}" data-pid="${p.id}" style="--pc:${p.color}; --i:${i}">
      <div class="pcard-glow"></div>
      <div class="pcard-head">
        <span class="pcard-ico">${P.icon(complete ? 'check' : 'target')}</span>
        <div class="pcard-title">
          <h3>${P.esc(p.name)}</h3>
          <span class="pcard-dl ${dl.tone}">${P.icon('flag')}${dl.text}</span>
        </div>
        <button class="icon-btn sm" data-pact="edit" title="Изменить проект">${P.icon('pencil')}</button>
        <button class="icon-btn sm danger" data-pact="delete" title="Удалить проект">${P.icon('trash-2')}</button>
      </div>

      <div class="pbar-wrap">
        <div class="pbar">
          <i class="pbar-plan" style="width:${forecast}%"></i>
          <i class="pbar-fill" style="width:${st.pct}%"></i>
        </div>
        <div class="pbar-num"><b>${st.pct}%</b>${complete ? '<span class="pdone">Завершён</span>' : ''}</div>
      </div>
      <div class="pcard-meta">
        <span>Выполнено дел: ${st.done} из ${st.tasks.length}</span>
        ${st.planned && !complete ? `<span class="muted">· запланировано ещё +${st.planned}%</span>` : ''}
      </div>

      <div class="ptasks">
        ${show.length ? show.map((t) => `
          <div class="ptask ${t.done ? 'done' : ''}" data-id="${t.id}">
            <button class="check sm ${t.done ? 'on' : ''}" data-pact="toggle">${P.icon('check')}</button>
            <span class="ptask-title">${P.esc(t.title)}${t.note ? `<small>${P.esc(t.note)}</small>` : ''}</span>
            <span class="ptask-date">${P.fmtFriendly(t.date)}</span>
            <span class="ptask-pct">+${t.projectPct}%</span>
          </div>`).join('') : `<div class="ptasks-empty">Пока нет дел по проекту. Добавьте дело и выберите в нём этот проект.</div>`}
        ${st.tasks.length > show.length ? `<div class="ptasks-more muted">и ещё ${st.tasks.length - show.length}</div>` : ''}
      </div>

      <button class="btn ghost padd" data-pact="add-task">${P.icon('plus')}Дело по проекту</button>
    </article>`;
  }

  function render() {
    const list = P.store.projects();
    const prevTop = root.querySelector('.projects-scroll')?.scrollTop || 0;
    root.innerHTML = `<div class="proj-head">
        <div>
          <h1 class="proj-h1">Проекты</h1>
          <span class="muted">Длительные цели: прогресс растёт, когда вы выполняете дела по проекту</span>
        </div>
        <button class="btn primary" data-pact="new">${P.icon('plus')}Новый проект</button>
      </div>
      <div class="projects-scroll">
        ${list.length ? `<div class="pgrid">${list.map(cardHTML).join('')}</div>` : `
        <div class="empty glass shine">
          <div class="empty-ico">${P.icon('target')}</div>
          <h3>Проектов пока нет</h3>
          <p>Добавьте то, чем будете заниматься долго: диплом, курсовую, учёбу языка. Потом выбирайте проект в делах — и шкала будет расти сама.</p>
          <button class="btn primary" data-pact="new">${P.icon('plus')}Новый проект</button>
        </div>`}
      </div>`;
    const sc = root.querySelector('.projects-scroll');
    if (sc) sc.scrollTop = prevTop;
  }

  /* Окно создания / изменения проекта */
  P.openProjectModal = (proj) => {
    const used = new Set(P.store.projects().map((p) => p.color));
    const st = {
      name: proj ? proj.name : '',
      color: proj ? proj.color : (P.CAT_COLORS.find((c) => !used.has(c)) || P.CAT_COLORS[0]),
      deadline: proj ? proj.deadline : '',
      base: proj ? proj.base : 0,
    };
    const body = P.h(`<form class="tform pform" autocomplete="off" novalidate>
      <label class="f-title"><input name="name" maxlength="60" placeholder="Название проекта, например «Диплом»" value="${P.esc(st.name)}" /></label>
      <div class="f-label">Цвет</div>
      <div class="clr-grid inline">${P.CAT_COLORS.map((c) => `<button type="button" class="clr ${c === st.color ? 'on' : ''}" data-col="${c}" style="--c:${c}"></button>`).join('')}</div>
      <div class="f-row">
        <div class="f-col">
          <div class="f-label">Дедлайн</div>
          <div class="dl-row">
            <button type="button" class="field-btn" data-act="deadline">${P.icon('flag')}<span class="dl-text"></span></button>
            <button type="button" class="icon-btn sm dl-clear" data-act="clear-dl" title="Без дедлайна">${P.icon('x')}</button>
          </div>
        </div>
        <div class="f-col">
          <div class="f-label">Уже сделано</div>
          <div class="pct-field">
            <button type="button" class="icon-btn sm" data-pct="-5">${P.icon('minus')}</button>
            <input name="base" value="${st.base}" maxlength="3" inputmode="numeric" /><span class="pct-sign">%</span>
            <button type="button" class="icon-btn sm" data-pct="5">${P.icon('plus')}</button>
          </div>
        </div>
      </div>
      <p class="pform-hint">Прогресс проекта = «уже сделано» + проценты всех выполненных дел по проекту. Процент для дела задаётся в самом деле.</p>
      <div class="f-actions">
        <button type="button" class="btn ghost" data-act="cancel">Отмена</button>
        <button type="submit" class="btn primary">${P.icon(proj ? 'check' : 'plus')}${proj ? 'Сохранить' : 'Создать проект'}</button>
      </div>
    </form>`);
    const m = P.modal({ title: proj ? 'Проект' : 'Новый проект', body });
    const $ = (q) => body.querySelector(q);
    const syncDl = () => {
      $('.dl-text').textContent = st.deadline ? P.fmtFriendly(st.deadline) : 'Без дедлайна';
      $('.dl-clear').classList.toggle('hidden', !st.deadline);
    };
    syncDl();
    const baseIn = $('[name=base]');
    baseIn.addEventListener('input', () => { baseIn.value = baseIn.value.replace(/\D/g, '').slice(0, 3); if (+baseIn.value > 100) baseIn.value = '100'; });
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-col]');
      if (c) { st.color = c.dataset.col; body.querySelectorAll('.clr').forEach((x) => x.classList.toggle('on', x === c)); return; }
      const pb = e.target.closest('[data-pct]');
      if (pb) { baseIn.value = Math.max(0, Math.min(100, (parseInt(baseIn.value, 10) || 0) + +pb.dataset.pct)); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'deadline') P.datePicker(e.target.closest('[data-act]'), st.deadline || P.addDays(P.todayKey(), 30), (k) => { st.deadline = k; syncDl(); });
      if (act === 'clear-dl') { st.deadline = ''; syncDl(); }
      if (act === 'cancel') m.close();
    });
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('[name=name]').value.trim();
      if (!name) { const f = $('.f-title'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); $('[name=name]').focus(); return; }
      const data = { name, color: st.color, deadline: st.deadline, base: parseInt(baseIn.value, 10) || 0 };
      if (proj) { P.store.updateProject(proj.id, data); P.toast('Проект сохранён'); }
      else { P.store.addProject(data); P.toast(`Проект «${name}» создан`); }
      m.close();
    });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); body.requestSubmit(); } });
    setTimeout(() => $('[name=name]').focus(), 60);
  };

  async function onClick(e) {
    const actEl = e.target.closest('[data-pact]');
    const card = e.target.closest('[data-pid]');
    const pid = card?.dataset.pid;
    const tid = e.target.closest('[data-id]')?.dataset.id;
    if (!actEl) {
      if (tid) return P.openTaskModal({ task: P.store.get(tid) });
      return;
    }
    const act = actEl.dataset.pact;
    if (act === 'new') return P.openProjectModal();
    if (act === 'edit') return P.openProjectModal(P.store.project(pid));
    if (act === 'add-task') return P.openTaskModal({ date: P.todayKey(), projectId: pid });
    if (act === 'toggle') return P.toggleTask(tid, e);
    if (act === 'delete') {
      const p = P.store.project(pid);
      const n = P.store.projectStats(pid).tasks.length;
      const ok = await P.confirm({
        title: `Удалить проект «${p.name}»?`,
        text: n ? `Дела (${n}) останутся на своих местах, просто без проекта.` : 'Дел по этому проекту нет.',
        buttons: [{ label: 'Отмена', value: false }, { label: 'Удалить', value: true, kind: 'danger' }],
      });
      if (!ok) return;
      const removed = P.store.removeProject(pid);
      P.toast('Проект удалён', { action: 'Отменить', onAction: () => P.store.restoreProject(removed) });
    }
  }

  P.screens = P.screens || {};
  P.screens.projects = {
    mount(el) { root = el; root.addEventListener('click', onClick); },
    render,
  };
})();
