/* Форма дела: используется и на странице «Дела», и в окне редактирования */
window.P = window.P || {};

(() => {
  const REPEATS = [
    { id: 'none', label: 'Не повторять' },
    { id: 'daily', label: 'Каждый день' },
    { id: 'weekdays', label: 'По будням' },
    { id: 'weekly', label: 'Каждую неделю' },
  ];

  /* Время «ЧЧ:ММ» в 24-часовом формате, независимо от языка Windows */
  P.normTime = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    let h, m;
    if (d.length <= 2) { h = +d; m = 0; }
    else if (d.length === 3) { h = +d.slice(0, 1); m = +d.slice(1); }
    else { h = +d.slice(0, 2); m = +d.slice(2, 4); }
    if (h > 23) h = 23;
    if (m > 59) m = 59;
    return `${P.pad(h)}:${P.pad(m)}`;
  };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (n) => `${P.pad(Math.floor(n / 60) % 24)}:${P.pad(n % 60)}`;

  /* Выбор времени «барабаном»: часы 00–23 и минуты 00–59, любое время с точностью до минуты */
  const ROW = 36; // высота строки барабана
  const durText = (m) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ' ' + (m % 60) + ' мин' : ''}`);

  P.timeField = (input, getStart) => {
    let pop = null, api = null;

    const open = () => {
      const start = getStart ? P.normTime(getStart()) : '';
      let cur = P.normTime(input.value);
      if (!cur) cur = start ? fromMin((toMin(start) + 60) % 1440) : '09:00';
      let [h, m] = cur.split(':').map(Number);

      const col = (n, sel, key) => `<div class="tp-col" data-k="${key}"><div class="tp-pad"></div>${
        Array.from({ length: n }, (_, i) => `<div class="tp-item ${i === sel ? 'on' : ''}" data-v="${i}">${P.pad(i)}</div>`).join('')
      }<div class="tp-pad"></div></div>`;

      const quick = start
        ? [[30, '+30 мин'], [60, '+1 ч'], [90, '+1,5 ч'], [120, '+2 ч']].map(([d, l]) => `<button type="button" class="chip-btn" data-add="${d}">${l}</button>`).join('')
        : ['08:00', '09:00', '12:00', '18:00'].map((t) => `<button type="button" class="chip-btn" data-set="${t}">${t}</button>`).join('') + `<button type="button" class="chip-btn" data-set="now">Сейчас</button>`;

      const box = P.h(`<div class="tp">
        <div class="tp-wheels">
          <div class="tp-band"></div>
          ${col(24, h, 'h')}<div class="tp-sep">:</div>${col(60, m, 'm')}
        </div>
        ${start ? '<div class="tp-dur"></div>' : ''}
        <div class="tp-quick">${quick}</div>
      </div>`);
      pop = P.popover(input, box, { className: 'pop-time' });
      const cols = { h: box.querySelector('[data-k=h]'), m: box.querySelector('[data-k=m]') };

      const apply = (fromWheel) => {
        input.value = `${P.pad(h)}:${P.pad(m)}`;
        for (const k of ['h', 'm']) {
          const v = k === 'h' ? h : m;
          const prev = cols[k].querySelector('.on'); if (prev) prev.classList.remove('on');
          cols[k].children[v + 1].classList.add('on');
          if (!fromWheel) glide(cols[k], v * ROW);
        }
        const d = box.querySelector('.tp-dur');
        if (d) d.textContent = `длительность ${durText(((h * 60 + m) - toMin(start) + 1440) % 1440 || 1440)}`;
      };
      // плавное «доезжание» барабана: каждый кадр сокращаем расстояние до цели
      function glide(el, target) {
        el._target = target;
        el._prog = true;
        if (el._raf) return;
        let last = performance.now();
        const step = (now) => {
          if (!el.isConnected) { el._raf = 0; el._prog = false; return; } // окно закрыто
          const dt = Math.min(64, now - last); last = now;
          const diff = el._target - el.scrollTop;
          if (Math.abs(diff) < 0.6) { el.scrollTop = el._target; el._raf = 0; el._prog = false; return; }
          // одинаково быстро и плавно при любой частоте кадров (~120 мс на одно значение)
          el.scrollTop += diff * (1 - Math.pow(0.6, dt / 16.7));
          el._raf = requestAnimationFrame(step);
        };
        el._raf = requestAnimationFrame(step);
      }
      cols.h.scrollTop = h * ROW; cols.m.scrollTop = m * ROW;
      apply(true);

      // колёсико и тачпад: одно значение за щелчок, плавно
      for (const k of ['h', 'm']) {
        const el = cols[k], max = k === 'h' ? 23 : 59;
        let acc = 0, settle, last = 0, speed = 1;
        el.addEventListener('wheel', (e) => {
          e.preventDefault();
          let steps;
          if (e.deltaMode === 1 || Math.abs(e.deltaY) >= 50) {
            // мышь: щелчок = 1 значение, при быстром вращении шаг растёт до 5
            const now = performance.now();
            speed = now - last < 110 ? Math.min(speed + 1, k === 'm' ? 5 : 3) : 1;
            last = now;
            steps = Math.sign(e.deltaY) * speed;
            acc = 0;
          } else {
            // тачпад: плавно, примерно одно значение на 18 пикселей жеста
            acc += e.deltaY; steps = Math.trunc(acc / 18); acc -= steps * 18;
          }
          if (!steps) return;
          const v = Math.min(max, Math.max(0, (k === 'h' ? h : m) + steps));
          if (k === 'h') h = v; else m = v;
          apply(false);
        }, { passive: false });
        // прокрутка перетаскиванием полосы/жестом — подхватываем, где остановились
        el.addEventListener('scroll', () => {
          if (el._prog) return;
          clearTimeout(settle);
          settle = setTimeout(() => {
            const v = Math.min(max, Math.max(0, Math.round(el.scrollTop / ROW)));
            if (k === 'h') h = v; else m = v;
            apply(false);
          }, 110);
        }, { passive: true });
        el.addEventListener('click', (e) => {
          const it = e.target.closest('[data-v]');
          if (!it) return;
          if (k === 'h') h = +it.dataset.v; else m = +it.dataset.v;
          apply(false);
        });
      }
      box.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add]');
        const set = e.target.closest('[data-set]');
        if (add) { const n = (toMin(start) + +add.dataset.add) % 1440; h = Math.floor(n / 60); m = n % 60; apply(false); }
        if (set) {
          if (set.dataset.set === 'now') { const d = new Date(); h = d.getHours(); m = d.getMinutes(); }
          else [h, m] = set.dataset.set.split(':').map(Number);
          apply(false);
        }
      });
      box.addEventListener('pointerdown', (e) => e.preventDefault()); // фокус остаётся в поле времени
      api = { sync(v) { const t = P.normTime(v); if (!t) return; [h, m] = t.split(':').map(Number); apply(false); } };
    };

    const close = () => { if (pop) { pop.close(); pop = null; api = null; } };
    input.addEventListener('focus', () => { setTimeout(() => input.select()); if (!pop) open(); });
    input.addEventListener('click', () => { if (!pop) open(); });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const inPop = pop && pop.el.contains(document.activeElement);
        if (!inPop && document.activeElement !== input) { input.value = P.normTime(input.value); close(); }
      }, 150);
    });
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 4);
      input.value = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
      if (d.length === 4 && api) api.sync(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const base = P.normTime(input.value) || (getStart && P.normTime(getStart())) || '09:00';
        const step = e.shiftKey ? 15 : 1;
        input.value = fromMin((toMin(base) + (e.key === 'ArrowUp' ? step : -step) + 1440) % 1440);
        if (api) api.sync(input.value);
      } else if (e.key === 'Enter' && !e.ctrlKey) {
        e.preventDefault();
        input.value = P.normTime(input.value);
        close();
      } else if (e.key === 'Escape' && pop) {
        e.stopPropagation(); close();
      }
    });
  };

  function seriesDates(from, rule, until) {
    const out = [];
    let k = from;
    let guard = 0;
    while (k <= until && guard++ < 800 && out.length < 200) {
      const wd = P.parse(k).getDay();
      if (rule === 'daily' || (rule === 'weekdays' && wd !== 0 && wd !== 6) || (rule === 'weekly' && P.diffDays(from, k) % 7 === 0)) out.push(k);
      k = P.addDays(k, 1);
    }
    return out;
  }

  /**
   * opts: { task?, date?, category?, onDone(tasks, mode), onCancel?, submitLabel? }
   */
  P.TaskForm = (opts = {}) => {
    const editing = !!opts.task;
    const t = opts.task || {};
    const st = {
      title: t.title || '',
      category: t.category || opts.category || P.CAT_IDS[0] || 'study',
      date: t.date || opts.date || P.todayKey(),
      // режим времени: весь день / к конкретному времени / интервал «с–до»
      timeMode: editing ? (!t.start ? 'allday' : t.end ? 'range' : 'time') : 'allday',
      start: t.start || '09:00',
      end: t.end || '',
      note: t.note || '',
      repeat: 'none',
      until: P.addDays(t.date || opts.date || P.todayKey(), 30),
      applySeries: false,
      projectId: t.projectId || opts.projectId || null,
      projectPct: t.projectId ? t.projectPct : 10,
    };
    const inSeries = editing && t.seriesId && P.store.series(t.seriesId).length > 1;
    // поле «Проект» — только если функция включена в настройках
    const showProjects = P.projectsOn && P.projectsOn();

    const el = P.h(`<form class="tform" autocomplete="off" novalidate>
      <label class="f-title">
        <input name="title" maxlength="140" placeholder="Что нужно сделать?" value="${P.esc(st.title)}" />
      </label>

      <div class="f-label">Тема</div>
      <div class="cat-picker">
        ${[...P.CAT_IDS, ...(P.CAT_IDS.includes(st.category) ? [] : [st.category])].map((id) => {
          const c = P.catOf(id);
          return `<button type="button" class="cat-tile shine ${st.category === id ? 'active' : ''}" data-cat="${id}" style="--c:${c.color}">
            <span class="cat-tile-ico">${P.icon(c.icon)}</span><span>${P.esc(c.name)}</span>${c.deleted ? '<em class="cat-del">удалена</em>' : ''}</button>`;
        }).join('')}
      </div>

      <div class="f-label">Дата</div>
      <button type="button" class="field-btn date-field" data-act="date">${P.icon('calendar-days')}<span class="date-text"></span></button>

      <div class="f-label">Время</div>
      <div class="time-row">
        <div class="seg time-mode">
          <button type="button" class="seg-btn ${st.timeMode === 'allday' ? 'on' : ''}" data-tm="allday">Весь день</button>
          <button type="button" class="seg-btn ${st.timeMode === 'time' ? 'on' : ''}" data-tm="time">Ко времени</button>
          <button type="button" class="seg-btn ${st.timeMode === 'range' ? 'on' : ''}" data-tm="range">С — до</button>
        </div>
        <div class="time-inputs ${st.timeMode === 'allday' ? 'hidden' : ''}">
          <input class="time-in" name="start" value="${st.start}" placeholder="09:00" maxlength="5" inputmode="numeric" />
          <span class="dash range-only ${st.timeMode === 'range' ? '' : 'hidden'}">–</span>
          <input class="time-in range-only ${st.timeMode === 'range' ? '' : 'hidden'}" name="end" value="${st.end}" placeholder="конец" maxlength="5" inputmode="numeric" />
        </div>
      </div>

      ${editing ? '' : `
      <div class="f-row">
        <div class="f-col">
          <div class="f-label">Повтор</div>
          <button type="button" class="field-btn" data-act="repeat">${P.icon('repeat')}<span class="rep-text">Не повторять</span>${P.icon('chevron-right', 'caret')}</button>
        </div>
        <div class="f-col until hidden">
          <div class="f-label">До какого дня</div>
          <button type="button" class="field-btn" data-act="until">${P.icon('calendar-days')}<span class="until-text"></span></button>
        </div>
      </div>`}

      ${showProjects ? `
      <div class="f-label">Проект</div>
      <div class="proj-pick-row">
        <button type="button" class="field-btn proj-btn" data-act="project">${P.icon('target')}<span class="proj-text"></span>${P.icon('chevron-right', 'caret')}</button>
        <div class="pct-field ${st.projectId ? '' : 'hidden'}" title="Сколько процентов проекта добавится, когда отметите дело выполненным">
          <button type="button" class="icon-btn sm" data-pct="-5">${P.icon('minus')}</button>
          <span class="pct-plus">+</span><input name="pct" value="${st.projectPct}" maxlength="3" inputmode="numeric" /><span class="pct-sign">%</span>
          <button type="button" class="icon-btn sm" data-pct="5">${P.icon('plus')}</button>
          <span class="pct-hint">к проекту при выполнении</span>
        </div>
      </div>` : ''}

      <div class="f-label note-label">${st.projectId ? 'Что делаю по проекту' : 'Заметка'}</div>
      <textarea name="note" rows="3" placeholder="${st.projectId ? 'Что конкретно делаю по проекту…' : 'Кабинет, ссылка, что взять с собой…'}">${P.esc(st.note)}</textarea>

      ${inSeries ? `<label class="series-check"><input type="checkbox" name="applySeries" /> <span>Применить изменения (кроме даты) ко всем следующим повторам</span></label>` : ''}

      <div class="f-actions">
        ${opts.onCancel ? `<button type="button" class="btn ghost" data-act="cancel">Отмена</button>` : ''}
        <button type="submit" class="btn primary">${P.icon(editing ? 'check' : 'plus')}${P.esc(opts.submitLabel || (editing ? 'Сохранить' : 'Добавить дело'))}</button>
      </div>
    </form>`);

    const $ = (s) => el.querySelector(s);
    P.timeField($('[name=start]'));
    P.timeField($('[name=end]'), () => P.normTime($('[name=start]').value));
    const syncDate = () => { $('.date-text').textContent = P.fmtFriendly(st.date); };
    const syncUntil = () => { if ($('.until-text')) $('.until-text').textContent = P.fmtLongYear(st.until); };
    syncDate(); syncUntil();
    const syncProject = () => {
      if (!showProjects) return;
      const p = st.projectId && P.store.project(st.projectId);
      const txt = $('.proj-text');
      txt.innerHTML = p ? `<i class="pdot" style="--pc:${p.color}"></i>${P.esc(p.name)}` : (P.store.projects().length ? 'Без проекта' : 'Проектов пока нет — создайте во вкладке «Проекты»');
      $('.pct-field').classList.toggle('hidden', !p);
      $('.note-label').textContent = p ? 'Что делаю по проекту' : 'Заметка';
      $('[name=note]').placeholder = p ? 'Что конкретно делаю по проекту…' : 'Кабинет, ссылка, что взять с собой…';
    };
    syncProject();
    if (showProjects) {
      const pin = $('[name=pct]');
      pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 3); if (+pin.value > 100) pin.value = '100'; });
      pin.addEventListener('focus', () => setTimeout(() => pin.select()));
      // колёсико над полем процентов: ±1
      $('.pct-field').addEventListener('wheel', (e) => {
        e.preventDefault();
        pin.value = Math.max(0, Math.min(100, (parseInt(pin.value, 10) || 0) + (e.deltaY < 0 ? 1 : -1)));
      }, { passive: false });
    }

    el.addEventListener('click', (e) => {
      const pb = e.target.closest('[data-pct]');
      if (pb) {
        const inp = $('[name=pct]');
        inp.value = Math.max(0, Math.min(100, (parseInt(inp.value, 10) || 0) + +pb.dataset.pct));
        return;
      }
      const tm = e.target.closest('[data-tm]');
      if (tm) {
        st.timeMode = tm.dataset.tm;
        el.querySelectorAll('[data-tm]').forEach((b) => b.classList.toggle('on', b === tm));
        $('.time-inputs').classList.toggle('hidden', st.timeMode === 'allday');
        el.querySelectorAll('.range-only').forEach((x) => x.classList.toggle('hidden', st.timeMode !== 'range'));
        if (st.timeMode === 'range' && !$('[name=end]').value) $('[name=end]').focus();
        else if (st.timeMode !== 'allday') $('[name=start]').focus();
        return;
      }
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        st.category = cat.dataset.cat;
        el.querySelectorAll('.cat-tile').forEach((b) => b.classList.toggle('active', b === cat));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'date') {
        P.datePicker(e.target.closest('[data-act]'), st.date, (k) => {
          st.date = k; syncDate();
          if (st.until < k) { st.until = P.addDays(k, 30); syncUntil(); }
        });
      } else if (act === 'project') {
        const btn = e.target.closest('[data-act]');
        const list = P.store.projects();
        if (!list.length) { P.toast('Сначала создайте проект во вкладке «Проекты»'); return; }
        const box = P.h(`<div class="menu">
          <button type="button" class="menu-item ${!st.projectId ? 'active' : ''}" data-proj="">Без проекта${!st.projectId ? P.icon('check', 'menu-check') : ''}</button>
          ${list.map((p) => `<button type="button" class="menu-item ${p.id === st.projectId ? 'active' : ''}" data-proj="${p.id}"><i class="pdot" style="--pc:${p.color}"></i>${P.esc(p.name)}<small class="muted">${P.store.projectStats(p.id).pct}%</small>${p.id === st.projectId ? P.icon('check', 'menu-check') : ''}</button>`).join('')}
        </div>`);
        const pop = P.popover(btn, box);
        box.onclick = (ev) => {
          const b = ev.target.closest('[data-proj]');
          if (!b) return;
          st.projectId = b.dataset.proj || null;
          syncProject();
          pop.close();
          if (st.projectId) $('[name=pct]').select();
        };
      } else if (act === 'repeat') {
        const btn = e.target.closest('[data-act]');
        const box = P.h(`<div class="menu">${REPEATS.map((r) => `<button type="button" class="menu-item ${r.id === st.repeat ? 'active' : ''}" data-rep="${r.id}">${r.label}${r.id === st.repeat ? P.icon('check', 'menu-check') : ''}</button>`).join('')}</div>`);
        const pop = P.popover(btn, box);
        box.onclick = (ev) => {
          const r = ev.target.closest('[data-rep]');
          if (!r) return;
          st.repeat = r.dataset.rep;
          $('.rep-text').textContent = REPEATS.find((x) => x.id === st.repeat).label;
          $('.until').classList.toggle('hidden', st.repeat === 'none');
          pop.close();
        };
      } else if (act === 'until') {
        P.datePicker(e.target.closest('[data-act]'), st.until, (k) => { st.until = k < st.date ? st.date : k; syncUntil(); });
      } else if (act === 'cancel') {
        opts.onCancel && opts.onCancel();
      }
    });

    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('[name=title]').value.trim();
      if (!title) {
        const f = $('.f-title'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        $('[name=title]').focus();
        return;
      }
      let start = st.timeMode === 'allday' ? '' : P.normTime($('[name=start]').value);
      let end = st.timeMode === 'range' ? P.normTime($('[name=end]').value) : '';
      if (start && end === start) end = '';
      if (!start) end = '';
      const note = $('[name=note]').value.trim();
      const base = { title, category: st.category, start, end, note };
      if (showProjects) {
        base.projectId = st.projectId && P.store.project(st.projectId) ? st.projectId : null;
        base.projectPct = base.projectId ? Math.max(0, Math.min(100, parseInt($('[name=pct]').value, 10) || 0)) : 0;
      }

      if (editing) {
        const apply = inSeries && $('[name=applySeries]')?.checked;
        P.store.update(t.id, { ...base, date: st.date });
        if (apply) {
          const later = P.store.series(t.seriesId).filter((x) => x.id !== t.id && x.date >= t.date).map((x) => x.id);
          P.store.updateMany(later, () => base);
        }
        opts.onDone && opts.onDone([P.store.get(t.id)], 'edit');
        return;
      }

      let created;
      if (st.repeat !== 'none') {
        const dates = seriesDates(st.date, st.repeat, st.until);
        const seriesId = P.uid();
        created = P.store.add(dates.map((d) => ({ ...base, date: d, seriesId })));
      } else {
        created = P.store.add({ ...base, date: st.date });
      }
      opts.onDone && opts.onDone(created, 'add');
    });

    // Ctrl+Enter — сохранить из любого поля
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.requestSubmit(); }
    });

    el.clearForm = () => {
      $('[name=title]').value = '';
      $('[name=note]').value = '';
      $('[name=title]').focus();
    };
    el.focusTitle = () => setTimeout(() => $('[name=title]').focus(), 60);
    return el;
  };

  /* Открыть окно создания или редактирования */
  P.openTaskModal = ({ task, date, category, projectId } = {}) => {
    let m;
    const form = P.TaskForm({
      task, date, category, projectId,
      onCancel: () => m.close(),
      onDone: (tasks, mode) => {
        m.close();
        if (mode === 'add') {
          const n = tasks.length;
          P.toast(n > 1 ? `Добавлено ${n} ${P.plural(n, 'повтор', 'повтора', 'повторов')}` : `Добавлено на ${P.fmtFriendly(tasks[0].date).toLowerCase()}`);
        } else P.toast('Изменения сохранены');
      },
    });
    let body = form;
    if (task) {
      body = document.createElement('div');
      const bar = P.h(`<div class="sheet-bar"></div>`);
      const paint = () => {
        const t = P.store.get(task.id);
        if (!t) return;
        bar.innerHTML = `
          <button class="done-toggle ${t.done ? 'on' : ''}" data-s="done">
            <span class="dt-box">${P.icon('check')}</span>
            <span>${t.done ? 'Выполнено' : 'Отметить выполненным'}</span>
          </button>
          <button class="btn ghost" data-s="tomorrow" title="Перенести на следующий день">${P.icon('arrow-right')}На завтра</button>
          <button class="btn ghost danger" data-s="delete" title="Удалить">${P.icon('trash-2')}</button>`;
      };
      paint();
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        const t = P.store.get(task.id);
        if (b.dataset.s === 'done') { P.toggleTask(task.id, e); paint(); m.el.querySelector('.modal').classList.toggle('is-done', P.store.get(task.id).done); }
        if (b.dataset.s === 'tomorrow') { m.close(); P.moveTask(task.id, P.addDays(t.date, 1)); }
        if (b.dataset.s === 'delete') { m.close(); P.deleteTask(task.id); }
      });
      body.append(bar, form);
    }
    m = P.modal({ title: task ? 'Дело' : 'Новое дело', body, wide: true });
    if (task && task.done) m.el.querySelector('.modal').classList.add('is-done');
    if (!task) form.focusTitle();
    return m;
  };
})();
