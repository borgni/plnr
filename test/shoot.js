// Тестовый запуск: открывает приложение с примерными данными и делает скриншоты экранов.
// Запуск: xvfb-run -s "-screen 0 1600x1000x24" npx electron --no-sandbox test/shoot.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OUT = path.join(__dirname, process.env.OUT || 'shots');
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plannner-'));
process.env.PLANNNER_DATA_DIR = dataDir;

const key = (d) => d.toISOString().slice(0, 10);
const today = new Date(); today.setHours(12);
const day = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return key(d); };
let i = 0;
const T = (date, title, category, start = '', end = '', note = '', done = false, seriesId = null) =>
  ({ id: 't' + (i++), title, category, date, start, end, note, done, seriesId, createdAt: i });

const tasks = [
  T(day(0), 'Пара: Трудовое право', 'study', '09:30', '10:50', 'Ауд. 412, взять кодекс и конспект по трудовому договору', true),
  T(day(0), 'ДЗ по информатике', 'study', '', '', 'Задачи 3–7 из методички, сдать в LMS до 23:59'),
  T(day(0), 'Смена на работе', 'work', '14:00', '18:00', 'Подготовить справку для руководителя'),
  T(day(0), 'Созвон по проекту', 'project', '19:00', '19:45', 'Обсудить раздел 1 отчёта и вычитку'),
  T(day(0), 'Тренировка', 'personal', '20:30', '', ''),
  // завтра — много дел, чтобы проверить стопку
  T(day(1), 'Пара: FinTech law', 'study', '09:30', '10:50', 'Семинар, доклад про регулирование криптовалют'),
  T(day(1), 'Пара: Гражданское право', 'study', '11:10', '12:30'),
  T(day(1), 'Учебный офис — справка', 'study', '13:00', '', 'Окно 3, паспорт и студенческий'),
  T(day(1), 'Отчёт для руководителя', 'work', '14:00', '16:00'),
  T(day(1), 'Тестовое задание — правки', 'work', '16:30', '', 'Проверить ссылки на 152-ФЗ'),
  T(day(1), 'Встреча команды проекта', 'project', '18:00', '19:00', 'Распределить разделы законопроекта'),
  T(day(1), 'Ветеринар', 'personal', '19:30', '', 'Плановый осмотр, взять паспорт животного'),
  T(day(1), 'Купить корм', 'personal', '', '', ''),
  T(day(-2), 'Эссе по ИС и ИИ', 'study', '', '', '', false),
  T(day(3), 'Дедлайн аналитического отчёта', 'project', '23:00', ''),
  T(day(5), 'Выходные с девушкой', 'personal', '', ''),
  T(day(-5), 'Контрольная', 'study', '10:00', '', '', true),
];
for (let w = 0; w < 6; w++) tasks.push(T(day(w * 7 - 7 + 5), 'Спорт: бассейн', 'personal', '08:00', '09:00', '', w < 1, 'swim'));
fs.writeFileSync(path.join(dataDir, 'plannner-data.json'), JSON.stringify({ version: 1, tasks, settings: { animatedBg: true, showDoneOnDay: true } }));

const W = +(process.env.W || 1320), H = +(process.env.H || 840);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, show: true, backgroundColor: '#071538',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // подключаем обработчики main.js (IPC), не создавая его окно
  require('./ipc-for-test')(dataDir);
  const logs = [];
  win.webContents.on('console-message', (e) => logs.push(`[${e.level}] ${e.message}`));
  await win.loadFile(path.join(process.env.SRC_DIR || path.join(__dirname, '..', 'src'), 'index.html'));
  await sleep(1500);

  const run = (js) => win.webContents.executeJavaScript(js.trim().startsWith("(async") ? js : `${js}; 0`).catch((e) => console.log('RUN-ERR', e.message, js.slice(0, 120)));
  const shot = async (name, wait = 900) => {
    await sleep(wait);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };

  const steps = (process.env.STEPS || 'day,stack,calendar,tasks,modal,settings,picker').split(',');
  for (const s of steps) {
    if (s === 'day') { await run(`P.show('day')`); await shot('1-day'); }
    if (s === 'stack') { await run(`P.openDay(P.addDays(P.todayKey(),1))`); await shot('2-day-stack'); await run(`document.querySelectorAll('.scard')[4].click()`); await shot('2b-day-stack-select'); }
    if (s === 'empty') { await run(`P.openDay(P.addDays(P.todayKey(),2))`); await shot('2c-day-empty'); }
    if (s === 'calendar') { await run(`P.show('calendar')`); await shot('3-calendar'); }
    if (s === 'tasks') { await run(`P.show('tasks')`); await shot('4-tasks'); }
    if (s === 'modal') { await run(`P.show('day'); P.openTaskModal({task: P.store.all()[2]})`); await shot('5-modal'); await run(`document.querySelector('.modal [data-close]').click()`); await sleep(400); }
    if (s === 'settings') { await run(`P.show('settings')`); await shot('6-settings'); }
    if (s === 'picker') { await run(`P.show('day'); setTimeout(()=>document.querySelector('.big-date').click(),300)`); await shot('7-picker', 1200); await run(`P.closePopover()`); }
    if (s === 'time') { await run(`P.openDay(P.todayKey()); P.openTaskModal({date: P.todayKey()}); setTimeout(()=>{ document.querySelector('.modal [data-tm=range]').click(); }, 300)`); await shot('9-time', 1300); await run(`document.querySelector('.modal [name=start]').value='1415'; document.querySelector('.modal [name=end]').focus()`); await shot('9b-time-end', 900); await run(`document.querySelector('.modal [name=title]').value='Тест времени'; document.querySelector('.modal form').requestSubmit()`); await sleep(500); const r = await win.webContents.executeJavaScript(`JSON.stringify(P.store.all().filter(t=>t.title==='Тест времени').map(t=>[t.start,t.end]))`); console.log('TIME', r); }
    if (s === 'repeat') { await run(`P.show('tasks'); setTimeout(()=>{ const f=document.querySelector('.new-form'); f.querySelector('[name=title]').value='Пара: Трудовое право'; f.querySelector('[data-act=repeat]').click(); }, 300)`); await sleep(900); await run(`document.querySelector('[data-rep=weekly]').click()`); await shot('10-repeat', 600); await run(`document.querySelector('.new-form form').requestSubmit()`); await shot('10b-repeat-added', 900); }
    if (s === 'sheet') { await run(`P.show('day'); P.openTaskModal({task: P.store.all()[0]})`); await shot('11-sheet'); await run(`document.querySelector('.modal [data-close]').click()`); await sleep(400); }
    if (s === 'toggle') { await run(`P.show('day'); setTimeout(()=>document.querySelectorAll('.tcard .check')[2].click(), 300)`); await shot('12-toggle', 520); }
    if (s.startsWith('theme:')) { const id = s.slice(6); await run(`P.store.setSetting('theme','${id}'); P.applySettings(); P.show(window.__scr || 'day')`); await shot('13-theme-' + id); }
    if (s.startsWith('scr:')) { await run(`window.__scr='${s.slice(4)}'`); }
    if (s === 'dbg') { await run(`P.show('day')`); await shot('dbg'); console.log('DBG', await win.webContents.executeJavaScript(`(()=>{const m=document.querySelector('.done-mark'); if(!m) return 'none'; const r=m.getBoundingClientRect(); const cs=getComputedStyle(m); const svg=m.querySelector('svg').getBoundingClientRect(); return JSON.stringify({r:[r.x,r.y,r.width,r.height],op:cs.opacity,color:cs.color,svg:[svg.width,svg.height]})})()`)); }
    if (s === 'flip') { await run(`P.openDay(P.todayKey()); setTimeout(()=>document.querySelectorAll('.tcard .check')[0].click(), 900)`); await shot('20-flip-mid', 1100); await shot('21-flip-end', 900); }
    if (s === 'stackdone') { await run(`P.openDay(P.addDays(P.todayKey(),1)); setTimeout(()=>{document.querySelectorAll('.scard .check')[1].click();}, 900)`); await shot('22-stack-done', 2200); }
    if (s === 'cats') { await run(`P.show('settings'); setTimeout(()=>document.querySelector('.cats-card').scrollIntoView(), 200)`); await shot('23-cats', 900); await run(`document.querySelector('.cat-row[data-cid=work] [data-cact=sticker]').click()`); await shot('24-stickers', 600); await run(`P.closePopover()`); }
    if (s === 'delcat') {
      await run(`(async()=>{ const l=P.store.cats().map(c=>c.id==='work'?{...c,deleted:true}:c); P.store.saveCats(l); const n=P.store.cats().concat([{id:'cx',name:'Котик',icon:'cat',color:'#facc15'},{id:'cy',name:'Ой',icon:'poop',color:'#c08457'}]); P.store.saveCats(n); })()`);
      await sleep(300);
      console.log('DELCAT', await win.webContents.executeJavaScript(`JSON.stringify({ids:P.CAT_IDS, workTasks:P.store.all().filter(t=>t.category==='work').length})`));
      await run(`P.show('settings'); setTimeout(()=>document.querySelector('.cats-card').scrollIntoView(), 200)`); await shot('25-cats-after', 900);
      await run(`P.show('day'); P.openTaskModal({date:P.todayKey()})`); await shot('26-form-newcats', 900); await run(`document.querySelector('.modal [data-close]').click()`); await sleep(400);
      await run(`P.openDay(P.todayKey())`); await shot('27-day-delcat', 900);
    }
    if (s === 'night') { await run(`P.show('day'); P.openTaskModal({date:P.todayKey()}); setTimeout(()=>{ document.querySelector('.modal [data-tm=range]').click(); }, 300)`); await shot('30-night-start', 1300);
      await run(`const st=document.querySelector('.modal [name=start]'); document.querySelector('.modal [name=title]').focus(); st.value='23:00'; document.querySelector('.modal [name=end]').focus()`); await shot('31-night-end', 900);
      await run(`const f=document.querySelector('.modal'); document.querySelector('.time-list [data-t="01:00"]').click(); f.querySelector('[name=title]').value='Ночное дело'; f.querySelector('form').requestSubmit()`); await sleep(500);
      console.log('NIGHT', await win.webContents.executeJavaScript(`JSON.stringify(P.store.all().filter(t=>t.title==='Ночное дело').map(t=>[t.start,t.end]))`)); }
    if (s === 'setscroll') { await run(`P.show('settings')`); await sleep(700); await run(`document.querySelector('.settings').scrollTop=420`); await sleep(200);
      await run(`document.querySelector('.cat-row [data-cact=color]').click()`); await sleep(500); await run(`document.querySelector('.clr-grid .clr:nth-child(5)').click()`); await sleep(400);
      console.log('SCROLL', await win.webContents.executeJavaScript(`document.querySelector('.settings').scrollTop`)); await shot('32-settings-scroll', 300); }
    if (s === 'perf') { console.log('PERF', await win.webContents.executeJavaScript(`(async()=>{ const extra=[]; for(let i=0;i<1500;i++){ const d=P.addDays(P.todayKey(), (i%120)-30); extra.push({title:'Задача '+i, category:P.CAT_IDS[i%4], date:d, start: (i%3? P.pad(8+i%12)+':00':'')}); } P.store.add(extra); const t0=performance.now(); P.show('calendar'); const t1=performance.now(); P.show('tasks'); const t2=performance.now(); P.show('day'); const t3=performance.now(); return JSON.stringify({calendar:Math.round(t1-t0), tasks:Math.round(t2-t1), day:Math.round(t3-t2)}); })()`)); }
    if (s === 'wheel') { await run(`P.show('day'); P.openTaskModal({date:P.todayKey()}); setTimeout(()=>{ document.querySelector('.modal [data-tm=range]').click(); }, 300)`); await shot('40-wheel-start', 1300);
      await run(`{ const c=document.querySelector('.tp-col[data-k=m]'); for(let i=0;i<7;i++) c.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})); }`); await sleep(700);
      await run(`{ const c=document.querySelector('.tp-col[data-k=h]'); for(let i=0;i<4;i++) c.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true})); }`); await sleep(700);
      console.log('WHEEL', await win.webContents.executeJavaScript(`document.querySelector('.modal [name=start]').value`));
      console.log('WHEEL-POS', await win.webContents.executeJavaScript(`(()=>{const c=document.querySelectorAll('.tp-col'); return [...c].map(x=>x.scrollTop).join(',')})()`));
      await run(`document.querySelector('.modal [name=end]').focus()`); await sleep(500); await run(`document.querySelector('.tp [data-add="90"]').click()`); await shot('41-wheel-end', 800);
      console.log('WHEEL2', await win.webContents.executeJavaScript(`document.querySelector('.modal [name=start]').value+' '+document.querySelector('.modal [name=end]').value+' '+!!document.querySelector('.tp')`)); }
    if (s === 'qa2') {
      const J = (js) => win.webContents.executeJavaScript(js).catch((e) => { console.log('J-ERR', e.message, js.slice(0, 140)); return null; });
      const key = async (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(350); };
      const active = () => J(`document.querySelector('.screen.active').dataset.screen`);
      win.focus(); win.webContents.focus();
      await run(`window.__keys=[]; document.addEventListener('keydown', e=>window.__keys.push([e.key,e.code, e.target.tagName, !!document.querySelector('.popover.in'), P.isModalOpen()]), true)`);
      await run(`P.openDay(P.todayKey())`); await sleep(900);
      // 1) галочка: поставить и снять
      await run(`document.querySelectorAll('.tcard .check')[0].click()`); await sleep(700);
      const firstId = await J(`P.store.on(P.todayKey()).sort(P.byDoneThenTime).find(t=>t.done && t.title==='ДЗ по информатике')?.id || ''`);
      await run(`document.querySelector('.tcard[data-id="${firstId}"] .check').click()`); await sleep(900);
      const tick = await J(`(()=>{ const c=document.querySelector('.tcard[data-id="${firstId}"] .check'); return JSON.stringify({on:c.classList.contains('on'), tr:getComputedStyle(c.querySelector('.ico')).transform}); })()`);
      console.log('QA tick-after-uncheck', tick);
      await shot('50-uncheck', 100);
      // 2) горячие клавиши
      const res = {};
      await key('2'); res.k2 = await active();
      await key('3'); res.k3 = await active();
      await key('4'); res.k4 = await active();
      await key('1'); res.k1 = await active();
      const d0 = await J(`P.dayState.date`); await key('Right'); res.right = (await J(`P.dayState.date`)) !== d0;
      await key('Left'); res.left = (await J(`P.dayState.date`)) === d0;
      await key('Right'); await key('T'); res.T = (await J(`P.dayState.date === P.todayKey()`));
      await key('N', ['control']); res.ctrlN = await J(`!!document.querySelector('.modal-wrap')`);
      await key('Escape'); await sleep(300); res.esc = await J(`!document.querySelector('.modal-wrap')`);
      await key('/'); res.slash = await J(`document.activeElement && document.activeElement.closest('.search') ? 'search' : (document.activeElement||{}).tagName`);
      await key('Escape'); await key('1');
      await key('F', ['control']); res.ctrlF = await J(`!!(document.activeElement && document.activeElement.closest('.search'))`);
      await J(`document.activeElement.blur()`); await key('2'); await key('Right'); res.calRight = await J(`P.calState.month.getMonth()`); await key('Left');
      // Ctrl+Enter в форме
      await key('1'); await key('N', ['control']); await J(`document.querySelector('.modal [name=title]').value='Клавиши'`); await key('Return', ['control']);
      res.ctrlEnter = await J(`P.store.all().some(t=>t.title==='Клавиши') && !document.querySelector('.modal-wrap .modal-body .tform')`);
      console.log('QA keys', JSON.stringify(res));
      console.log('QA keylog', await J(`JSON.stringify(window.__keys.slice(0,8))`));
      // 3) перетаскивание в календаре мышью
      await key('2'); await sleep(800);
      const geo = JSON.parse(await J(`(()=>{ const chip=document.querySelector('.cell.today .cchip'); const id=chip.dataset.id; const r=chip.getBoundingClientRect(); const target=[...document.querySelectorAll('.cell:not(.out)')].find(c=>c.dataset.k===P.addDays(P.todayKey(),2)) || [...document.querySelectorAll('.cell')].pop(); const t=target.getBoundingClientRect(); return JSON.stringify({id, x:r.left+20, y:r.top+10, tx:t.left+t.width/2, ty:t.top+t.height/2, k:target.dataset.k}); })()`));
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(geo.x), y: Math.round(geo.y) });
      win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(geo.x), y: Math.round(geo.y), button: 'left', clickCount: 1 });
      for (let i = 1; i <= 12; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(geo.x + (geo.tx - geo.x) * i / 12), y: Math.round(geo.y + (geo.ty - geo.y) * i / 12), button: 'left', modifiers: ['leftButtonDown'] }); await sleep(30); }
      await shot('51-drag', 50);
      win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(geo.tx), y: Math.round(geo.ty), button: 'left', clickCount: 1 });
      await sleep(700);
      console.log('QA drag', await J(`JSON.stringify({moved: P.store.get('${geo.id}').date === '${geo.k}', modal: !!document.querySelector('.modal-wrap')})`));
      await shot('52-drag-done', 300);
      // 4) режимы времени
      await J(`P.openTaskModal({date:P.todayKey()}); 0`); await sleep(400);
      await J(`document.querySelector('.modal [data-tm=time]').click(); 0`); await sleep(300); await shot('53-time-mode', 500);
      await J(`document.querySelector('.modal [name=title]').focus(); document.querySelector('.modal [name=start]').value='07:45'; document.querySelector('.modal [name=title]').value='Ко времени'; document.querySelector('.modal form').requestSubmit(); 0`); await sleep(400);
      await J(`P.openTaskModal({date:P.todayKey()}); 0`); await sleep(400);
      await J(`document.querySelector('.modal [data-tm=range]').click(); 0`); await sleep(300); await shot('54-range-mode', 500);
      await J(`document.querySelector('.modal [name=title]').focus(); document.querySelector('.modal [name=start]').value='10:10'; document.querySelector('.modal [name=end]').value='11:25'; document.querySelector('.modal [name=title]').value='Интервал'; document.querySelector('.modal form').requestSubmit(); 0`); await sleep(400);
      console.log('QA timemode', await J(`JSON.stringify(P.store.all().filter(t=>['Ко времени','Интервал'].includes(t.title)).map(t=>[t.title,t.start,t.end]))`));
      const tid = await J(`P.store.all().find(t=>t.title==='Ко времени').id`);
      await J(`P.openTaskModal({task:P.store.get('${tid}')}); 0`); await sleep(400);
      console.log('QA edit-mode', await J(`document.querySelector('.modal [data-tm].on').dataset.tm`)); await J(`document.querySelector('.modal [data-close]').click(); 0`); await sleep(400);
      // 5) очистить выполненные — исчезают везде
      await J(`P.store.all().slice(0,6).forEach(t=>{ if(!t.done) P.store.toggle(t.id); }); 0`); await sleep(200);
      const doneBefore = await J(`P.store.all().filter(t=>t.done).length`);
      await key('4'); await sleep(600);
      console.log('QA pre-clear', await J(`JSON.stringify({scr:document.querySelector('.screen.active').dataset.screen, btn: (document.querySelector('[data-act=clear-done]')||{}).disabled, modal:P.isModalOpen(), ae:document.activeElement.tagName})`));
      await J(`document.querySelector('[data-act=clear-done]').click(); 0`); await sleep(500);
      console.log('QA confirm', await J(`JSON.stringify([...document.querySelectorAll('.modal .btn')].map(b=>b.textContent.trim()))`));
      await J(`[...document.querySelectorAll('.confirm .btn')].find(b=>b.textContent.includes('Удалить')).click(); 0`); await sleep(500);
      const after = {};
      after.store = await J(`P.store.all().filter(t=>t.done).length`);
      await key('1'); await sleep(600); after.day = await J(`document.querySelectorAll('.tcard.done, .scard.done').length`);
      await key('2'); await sleep(600); after.cal = await J(`document.querySelectorAll('.cchip.done, .side-item.done').length`);
      await key('3'); await sleep(600); await J(`if(!document.querySelector('[data-act=show-done]').classList.contains('on')) document.querySelector('[data-act=show-done]').click(); 0`); await sleep(300); after.list = await J(`document.querySelectorAll('.lrow.done').length`);
      after.badge = await J(`document.querySelector('[data-dock=day] .dock-badge').textContent`);
      await J(`P.store.flush()`); await sleep(300);
      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'plannner-data.json'), 'utf8'));
      after.file = saved.tasks.filter((t) => t.done).length;
      console.log('QA clear-done', doneBefore, JSON.stringify(after));
    }
    if (s === 'wdbg') {
      await run(`P.show('day'); P.openTaskModal({date:P.todayKey()}); setTimeout(()=>{ document.querySelector('.modal [data-tm=time]').click(); }, 300)`); await sleep(1300);
      const J = (js) => win.webContents.executeJavaScript(js).catch((e) => 'ERR ' + e.message);
      console.log('W0', await J(`document.querySelector('.modal [name=start]').value + ' ' + document.activeElement.name + ' pop=' + !!document.querySelector('.tp')`));
      await J(`{ const c=document.querySelector('.tp-col[data-k=m]'); c.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})); } 0`);
      console.log('W1', await J(`document.querySelector('.modal [name=start]').value`));
      for (const t of [100, 300, 800]) { await sleep(t); console.log('W@'+t, await J(`document.querySelector('.modal [name=start]').value + ' scroll=' + document.querySelector('.tp-col[data-k=m]').scrollTop + ' ae=' + (document.activeElement.name||document.activeElement.tagName)`)); }
    }
    if (s === 'proj') {
      const J = (js) => win.webContents.executeJavaScript(js).catch((e) => 'ERR ' + e.message);
      const r = {};
      r.dockBefore = await J(`!!document.querySelector('[data-dock=projects]')`);
      await run(`P.openTaskModal({date:P.todayKey()})`); await sleep(400);
      r.formFieldOff = await J(`!!document.querySelector('.modal .proj-btn')`);
      await run(`document.querySelector('.modal [data-close]').click()`); await sleep(400);
      // включаем в настройках
      await run(`P.show('settings')`); await sleep(500);
      await run(`document.querySelector('[data-act=projects]').click()`); await sleep(700);
      r.dockAfter = await J(`!!document.querySelector('[data-dock=projects]')`);
      await run(`document.querySelector('.proj-set').scrollIntoView()`); await shot('60-settings-proj', 600);
      await run(`document.querySelector('[data-dock=projects]').click()`); await shot('61-proj-empty', 900);
      // создаём проект через окно
      await run(`document.querySelector('[data-pact=new]').click()`); await sleep(500);
      await run(`document.querySelector('.pform [name=name]').value='Диплом'; document.querySelector('.pform [name=base]').value='15'; document.querySelector('.pform [data-act=deadline]').click()`); await sleep(500);
      await run(`document.querySelector('.minical [data-k="'+P.addDays(P.todayKey(),40)+'"]')?.click() || document.querySelector('.minical [data-q="7"]').click()`); await sleep(300);
      await shot('62-proj-modal', 400);
      await run(`document.querySelector('.pform').requestSubmit()`); await sleep(500);
      await J(`P.store.addProject({name:'Английский B2', color:'#4ade80', deadline:P.addDays(P.todayKey(),5), base:60}); P.store.addProject({name:'Курсовая', color:'#ffc46b', base:100}); 0`);
      const pid = await J(`P.store.projects()[0].id`);
      // дело с проектом через форму
      await run(`P.openTaskModal({date:P.todayKey()})`); await sleep(500);
      r.formFieldOn = await J(`!!document.querySelector('.modal .proj-btn')`);
      await run(`document.querySelector('.modal [data-act=project]').click()`); await sleep(400);
      await shot('63-proj-menu', 300);
      await run(`document.querySelector('.menu [data-proj="${pid}"]').click()`); await sleep(300);
      await run(`document.querySelector('.modal [name=title]').value='Глава 1: обзор литературы'; document.querySelector('.modal [name=pct]').value='20'; document.querySelector('.modal [name=note]').value='Прочитать 5 статей про агентный ИИ'`);
      await shot('64-task-form-proj', 400);
      await run(`document.querySelector('.modal form').requestSubmit()`); await sleep(500);
      const tid = await J(`P.store.all().find(t=>t.title.startsWith('Глава 1')).id`);
      r.saved = await J(`JSON.stringify((({projectId,projectPct,note})=>({projectId,projectPct,note}))(P.store.get('${tid}')))`);
      r.pctBefore = await J(`P.store.projectStats('${pid}').pct`);
      await J(`P.store.add([{title:'Глава 2: анализ', category:'study', date:P.addDays(P.todayKey(),2), projectId:'${pid}', projectPct:25, note:'Сравнить нормы ЗоЗПП'}, {title:'Встреча с научруком', category:'work', date:P.addDays(P.todayKey(),-1), projectId:'${pid}', projectPct:5, done:true}]); 0`);
      await run(`P.openDay(P.todayKey())`); await sleep(500);
      await run(`document.querySelector('.tcard[data-id="${tid}"] .check, .scard[data-id="${tid}"] .check').click()`); await sleep(700);
      r.pctAfter = await J(`P.store.projectStats('${pid}').pct`);
      await shot('65-day-tag', 300);
      await run(`P.show('projects')`); await shot('66-projects', 1000);
      // выключаем — данные остаются
      await run(`P.show('settings')`); await sleep(400); await run(`document.querySelector('[data-act=projects]').click()`); await sleep(600);
      r.offDock = await J(`!!document.querySelector('[data-dock=projects]')`);
      r.offKeep = await J(`P.store.projects().length + '/' + P.store.get('${tid}').projectId`);
      r.offTag = await J(`(P.openDay(P.todayKey()), !!document.querySelector('.proj-tag'))`);
      await J(`P.store.flush()`); await sleep(300);
      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'plannner-data.json'), 'utf8'));
      r.file = saved.projects.length + ' projects, enabled=' + saved.settings.projectsEnabled;
      console.log('PROJ', JSON.stringify(r));
    }
    if (s === 'syncui') { await run(`P.show('settings')`); await sleep(500); await run(`document.querySelector('.sync-card').scrollIntoView({block:'start'})`); await shot('70-sync-out', 500);
      await run(`localStorage.setItem('plnr-auth', JSON.stringify({access_token:'x',refresh_token:'y',expires_at:Date.now()+3e6,user:{id:'u',email:'student@hse.ru'}})); P.sync.start()`); await sleep(1500); await run(`P.show('settings'); document.querySelector('.sync-card').scrollIntoView({block:'start'})`); await shot('71-sync-in', 600); }
    if (s === 'catmenu') { await run(`P.openDay(P.todayKey()); setTimeout(()=>document.querySelector('.tcard .cat-badge').click(),300)`); await shot('8-catmenu', 1200); await run(`P.closePopover()`); }
  }
  // проверка логики
  const check = await run(`(async () => {
    const r = {};
    const n0 = P.store.all().length;
    const [t] = P.store.add({ title: 'Проверка', category: 'work', date: P.todayKey() });
    r.added = P.store.all().length === n0 + 1;
    P.show('calendar'); r.calHas = !!document.querySelector('.cchip[data-id="'+t.id+'"]');
    P.show('tasks'); r.listHas = !!document.querySelector('.lrow[data-id="'+t.id+'"]');
    P.show('day'); r.dayHas = !!document.querySelector('[data-id="'+t.id+'"]');
    P.store.toggle(t.id); r.toggled = P.store.get(t.id).done;
    P.store.remove(t.id);
    await P.store.flush();
    r.count = P.store.all().length;
    return r;
  })()`);
  await sleep(400);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'plannner-data.json'), 'utf8'));
  console.log('CHECK', JSON.stringify(check), 'savedTasks', saved.tasks.length);
  console.log('LOGS\n' + logs.join('\n'));
  app.quit();
});
