// Сквозная проверка синхронизации: два «устройства» + тестовое облако, повторяющее Supabase.
// Запуск: xvfb-run -a npx electron --no-sandbox test/sync-e2e.js
const { app, BrowserWindow, ipcMain, session, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MOCK = 'https://mock.supabase.co';
const users = new Map();   // email → {id, password}
const tokens = new Map();  // token → userId
const rows = new Map();    // userId → {data, rev}
let online = true;
let tokenN = 0;
const issue = (u) => { const t = 'tok' + (++tokenN); tokens.set(t, u.id); return { access_token: t, refresh_token: 'r' + t, expires_in: 3600, user: { id: u.id, email: u.email } }; };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function mockSupabase(req) {
  if (!online) throw new Error('net::ERR_INTERNET_DISCONNECTED');
  const u = new URL(req.url);
  const body = req.method === 'GET' ? null : await req.text().then((t) => (t ? JSON.parse(t) : null));
  if (u.pathname === '/auth/v1/signup') {
    if (users.has(body.email)) return json({ msg: 'User already registered' }, 422);
    const usr = { id: 'u' + (users.size + 1), email: body.email, password: body.password };
    users.set(body.email, usr); return json(issue(usr));
  }
  if (u.pathname === '/auth/v1/token') {
    if (u.searchParams.get('grant_type') === 'password') {
      const usr = users.get(body.email);
      if (!usr || usr.password !== body.password) return json({ error_description: 'Invalid login credentials' }, 400);
      return json(issue(usr));
    }
    const uid = tokens.get(String(body.refresh_token).slice(1));
    const usr = [...users.values()].find((x) => x.id === uid);
    return usr ? json(issue(usr)) : json({ error: 'bad refresh' }, 400);
  }
  if (u.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
  const uid = tokens.get((req.headers.get('authorization') || '').replace('Bearer ', ''));
  if (!uid) return json({ message: 'JWT invalid' }, 401);
  if (u.pathname === '/rest/v1/plnr_state') {
    const want = (u.searchParams.get('user_id') || '').replace('eq.', '');
    if (req.method === 'GET') { const r = rows.get(uid); return json(r && want === uid ? [{ data: r.data, rev: r.rev }] : []); }
    if (req.method === 'POST') { if (rows.has(uid)) return json({ message: 'duplicate key' }, 409); rows.set(uid, { data: body.data, rev: body.rev }); return new Response(null, { status: 201 }); }
    if (req.method === 'PATCH') {
      const rev = +(u.searchParams.get('rev') || '').replace('eq.', '');
      const r = rows.get(uid);
      if (!r || r.rev !== rev) return json([]);
      rows.set(uid, { data: body.data, rev: body.rev }); return json([{ rev: body.rev }]);
    }
  }
  return json({ message: 'not found' }, 404);
}

const key = (d) => d.toISOString().slice(0, 10);
const today = key(new Date());
const dirs = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  for (const name of ['laptop', 'phone']) {
    dirs[name] = fs.mkdtempSync(path.join(os.tmpdir(), 'plnr-sync-' + name + '-'));
  }
  fs.writeFileSync(path.join(dirs.laptop, 'plannner-data.json'), JSON.stringify({ version: 1, tasks: [
    { id: 'L1', title: 'Пара: Трудовое право', category: 'study', date: today, start: '09:30', createdAt: 1 },
    { id: 'L2', title: 'Смена на работе', category: 'work', date: today, start: '14:00', createdAt: 2 },
    { id: 'L3', title: 'Купить корм', category: 'personal', date: today, createdAt: 3 },
  ], settings: {} }));
  fs.writeFileSync(path.join(dirs.phone, 'plannner-data.json'), JSON.stringify({ version: 1, tasks: [
    { id: 'P1', title: 'Записано на телефоне', category: 'study', date: today, createdAt: 4 },
  ], settings: {} }));

  const wins = {};
  const senderDir = new Map();
  ipcMain.handle('store:load', (e) => { try { return JSON.parse(fs.readFileSync(path.join(senderDir.get(e.sender.id), 'plannner-data.json'), 'utf8')); } catch { return null; } });
  ipcMain.handle('store:save', (e, d) => { fs.writeFileSync(path.join(senderDir.get(e.sender.id), 'plannner-data.json'), JSON.stringify(d, null, 2)); return true; });

  for (const name of ['laptop', 'phone']) {
    const ses = session.fromPartition('persist:' + name + Date.now());
    ses.protocol.handle('https', (req) => (req.url.startsWith(MOCK) ? mockSupabase(req) : net.fetch(req, { bypassCustomProtocolHandlers: true })));
    ses.protocol.handle('file', (req) => {
      if (req.url.endsWith('/src/config.js')) return new Response(`window.PLNR_CONFIG = { supabaseUrl: '${MOCK}', supabaseKey: 'test-key' };`, { headers: { 'Content-Type': 'text/javascript' } });
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
    const w = new BrowserWindow({ width: 1320, height: 840, show: true, webPreferences: { session: ses, preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true } });
    senderDir.set(w.webContents.id, dirs[name]);
    w.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) console.log(`[${name} console]`, e.message); });
    await w.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    wins[name] = w;
  }
  await sleep(1500);
  const J = (name, js) => wins[name].webContents.executeJavaScript(js).catch((e) => 'ERR ' + e.message);
  const titles = async (name) => JSON.parse(await J(name, `JSON.stringify(P.store.all().map(t=>t.title).sort())`));
  const syncNow = (name) => J(name, `P.sync.now().then(()=>P.sync.state().status)`);
  let ok = 0, fail = 0;
  const check = (n, c, extra = '') => { c ? ok++ : fail++; console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  → ' + extra)); };

  check('раздел синхронизации виден', await J('laptop', `P.sync.configured()`) === true);
  // 1. ноутбук создаёт аккаунт
  await J('laptop', `P.show('settings')`); await sleep(400);
  await J('laptop', `document.querySelector('.sync-form [name=email]').value='me@test.ru'; document.querySelector('.sync-form [name=password]').value='secret12'; document.querySelector('[data-sync=up]').click(); 0`);
  await sleep(1500);
  check('ноутбук: аккаунт создан и выгружен', rows.get('u1') && rows.get('u1').data.tasks.length === 3, JSON.stringify(rows.get('u1')));
  check('ноутбук: статус «синхронизировано»', (await J('laptop', `P.sync.state().status`)) === 'ok');
  await (async () => { const cap = await wins.laptop.webContents.capturePage(); fs.writeFileSync(path.join(__dirname, 'shots-sync-settings.png'), cap.toPNG()); })();
  // 2. неверный пароль на телефоне
  await J('phone', `P.show('settings')`); await sleep(400);
  await J('phone', `document.querySelector('.sync-form [name=email]').value='me@test.ru'; document.querySelector('.sync-form [name=password]').value='wrong!!'; document.querySelector('[data-sync=in]').click(); 0`);
  await sleep(800);
  check('телефон: неверный пароль — понятная ошибка', (await J('phone', `document.querySelector('.sync-err')?.textContent||''`)).includes('Неверная почта'));
  // 3. телефон входит — дела объединяются
  await J('phone', `document.querySelector('.sync-form [name=email]').value='me@test.ru'; document.querySelector('.sync-form [name=password]').value='secret12'; document.querySelector('[data-sync=in]').click(); 0`);
  await sleep(1500);
  const ph = await titles('phone');
  check('телефон получил дела ноутбука и сохранил своё', ph.length === 4 && ph.includes('Записано на телефоне'), JSON.stringify(ph));
  await syncNow('laptop');
  check('ноутбук получил дело с телефона', (await titles('laptop')).includes('Записано на телефоне'));
  // 4. правки с обеих сторон
  await J('laptop', `P.store.toggle('L1'); 0`);
  await J('phone', `P.store.update('L2', {title:'Смена (перенесли на 15:00)', start:'15:00'}); 0`);
  await sleep(300);
  await syncNow('laptop'); await syncNow('phone'); await syncNow('laptop');
  check('выполнение с ноутбука дошло до телефона', (await J('phone', `P.store.get('L1').done`)) === true);
  check('правка с телефона дошла до ноутбука', (await J('laptop', `P.store.get('L2').title`)) === 'Смена (перенесли на 15:00)');
  // 5. удаление на телефоне
  await J('phone', `P.store.remove('L3'); 0`);
  await syncNow('phone'); await syncNow('laptop');
  check('удаление с телефона дошло до ноутбука', !(await titles('laptop')).includes('Купить корм'));
  // 6. одновременно: оба поменяли разные дела не синхронизируясь
  await J('laptop', `P.store.add({id:'L9', title:'Добавлено на ноутбуке офлайн', category:'study', date:'${today}'}); 0`);
  await J('phone', `P.store.add({id:'P9', title:'Добавлено на телефоне офлайн', category:'study', date:'${today}'}); 0`);
  await syncNow('phone'); await syncNow('laptop'); await syncNow('phone');
  const both = [await titles('laptop'), await titles('phone')];
  check('одновременные добавления — оба есть на обоих', both.every((l) => l.includes('Добавлено на ноутбуке офлайн') && l.includes('Добавлено на телефоне офлайн')), JSON.stringify(both));
  check('устройства совпадают', JSON.stringify(both[0]) === JSON.stringify(both[1]));
  // 7. без интернета
  online = false;
  await J('laptop', `P.store.add({id:'L10', title:'Без интернета', category:'study', date:'${today}'}); 0`);
  const st = await syncNow('laptop');
  check('без интернета — статус «нет интернета», дело сохранено локально', st === 'offline' && (await titles('laptop')).includes('Без интернета'), st);
  online = true;
  await syncNow('laptop'); await syncNow('phone');
  check('интернет вернулся — дело дошло до телефона', (await titles('phone')).includes('Без интернета'));
  // 8. настройки (тема) синхронизируются
  await J('laptop', `P.store.setSetting('theme','amethyst'); 0`);
  await syncNow('laptop'); await syncNow('phone');
  check('тема оформления синхронизируется', (await J('phone', `P.store.settings.theme`)) === 'amethyst');
  // 9. данные на диске
  await J('laptop', `P.store.flush()`); await J('phone', `P.store.flush()`); await sleep(300);
  const disk = ['laptop', 'phone'].map((n) => JSON.parse(fs.readFileSync(path.join(dirs[n], 'plannner-data.json'), 'utf8')).tasks.length);
  check('на диске обоих устройств одинаковое число дел', disk[0] === disk[1] && disk[0] === 6, JSON.stringify(disk));
  // 10. автоматическая синхронизация после правки (без ручного вызова)
  await J('phone', `P.store.add({id:'P20', title:'Авто', category:'study', date:'${today}'}); 0`);
  await sleep(3500);
  await syncNow('laptop');
  check('изменение уходит само через пару секунд', (await titles('laptop')).includes('Авто'));
  // 11. выход
  await J('phone', `P.sync.signOut()`); await sleep(300);
  check('выход: дела остались на телефоне', (await titles('phone')).length === 7, JSON.stringify(await titles('phone')));

  console.log(`\nСИНХРОНИЗАЦИЯ: ${ok} из ${ok + fail} проверок прошли`);
  app.exit(fail ? 1 : 0);
});
