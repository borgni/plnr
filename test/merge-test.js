// Проверка слияния данных ноутбук ↔ телефон без сети
global.window = {}; global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.document = { hidden: false, addEventListener() {} };
global.structuredClone = structuredClone;
window.PLNR_CONFIG = { supabaseUrl: 'x', supabaseKey: 'y' };
global.P = window.P = {};
require('../src/sync.js');
const M = P.sync.merge;
const N0 = Date.now() - 86400000; const T = (id, title, upd, extra = {}) => ({ id, title, updatedAt: N0 + upd, done: false, ...extra });
let ok = 0, fail = 0;
const check = (name, cond) => { cond ? ok++ : fail++; console.log((cond ? '✓ ' : '✗ ') + name); };
const ids = (d) => d.tasks.map((t) => t.id).sort().join(',');

// 1. первый вход: в облаке пусто — всё с ноутбука сохраняется
let L = { tasks: [T('a', 'A', 1), T('b', 'B', 2)], projects: [], deleted: {}, settings: { theme: 'ocean' }, settingsAt: 5 };
check('пустое облако → всё локальное', ids(M(L, null)) === 'a,b');
// 2. на телефоне свои дела, на ноутбуке свои — объединяются
let R = { tasks: [T('c', 'C', 3)], projects: [], deleted: {}, settings: { theme: 'mint' }, settingsAt: 1 };
let m = M(L, R);
check('объединение дел двух устройств', ids(m) === 'a,b,c');
check('настройки — более свежие (ноутбук)', m.settings.theme === 'ocean');
// 3. одно дело правили на обоих — побеждает более поздняя правка
L = { tasks: [T('a', 'ноутбук', 10)], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
R = { tasks: [T('a', 'телефон', 20)], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
check('свежая правка с телефона', M(L, R).tasks[0].title === 'телефон');
check('свежая правка с ноутбука', M({ ...L, tasks: [T('a', 'ноутбук', 30)] }, R).tasks[0].title === 'ноутбук');
// 4. удалили на телефоне — пропадает и на ноутбуке
L = { tasks: [T('a', 'A', 10), T('b', 'B', 10)], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
R = { tasks: [T('a', 'A', 10)], projects: [], deleted: { b: N0 + 15 }, settings: {}, settingsAt: 0 };
check('удаление с телефона доходит', ids(M(L, R)) === 'a');
// 5. удалили на телефоне, но на ноутбуке ПОСЛЕ этого изменили — дело остаётся
L = { tasks: [T('b', 'B изменено', 20)], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
check('изменение после удаления сохраняет дело', ids(M(L, R)) === 'a,b');
// 6. выполненность переносится
L = { tasks: [T('a', 'A', 10, { done: true })], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
R = { tasks: [T('a', 'A', 5)], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
check('галочка «выполнено» переносится', M(L, R).tasks[0].done === true);
// 7. проекты сливаются так же
L = { tasks: [], projects: [{ id: 'p1', name: 'Диплом', updatedAt: 5 }], deleted: {}, settings: {}, settingsAt: 0 };
R = { tasks: [], projects: [{ id: 'p2', name: 'Курсовая', updatedAt: 6 }], deleted: {}, settings: {}, settingsAt: 0 };
check('проекты объединяются', M(L, R).projects.length === 2);
// 8. старые отметки об удалении чистятся, но новые остаются
R = { tasks: [], projects: [], deleted: { old: Date.now() - 200 * 86400000, fresh: Date.now() }, settings: {}, settingsAt: 0 };
m = M({ tasks: [], projects: [], deleted: {}, settings: {}, settingsAt: 0 }, R);
check('очистка старых отметок удаления', !('old' in m.deleted) && 'fresh' in m.deleted);
// 9. дело без меток времени (из старой версии) не теряется
L = { tasks: [{ id: 'x', title: 'старое' }], projects: [], deleted: {}, settings: {}, settingsAt: 0 };
check('дела из старых версий без меток', ids(M(L, { tasks: [], projects: [], deleted: {}, settings: {}, settingsAt: 0 })) === 'x');
// 10. телефон с темами по умолчанию сменил цвет — темы дел с ноутбука не затираются
const LAP = [{ id: 'study', name: 'Учёба' }, { id: 'dl', name: 'Дедлайны', icon: 'poop' }];
const DEF = [{ id: 'study', name: 'Учёба' }, { id: 'work', name: 'Работа' }];
R = { tasks: [], projects: [], deleted: {}, settings: { theme: 'mint', cats: LAP }, settingsTs: { cats: 100, theme: 100 }, settingsAt: 100 };
L = { tasks: [], projects: [], deleted: {}, settings: { theme: 'rose', cats: DEF }, settingsTs: { theme: 200 }, settingsAt: 200 };
m = M(L, R);
check('цвет с телефона, темы дел с ноутбука', m.settings.theme === 'rose' && m.settings.cats.length === 2 && m.settings.cats[1].id === 'dl');
check('метки настроек сохраняются по отдельности', m.settingsTs.cats === 100 && m.settingsTs.theme === 200);
// 11. новый телефон (метки 0) — всё из облака, даже если старая версия облака без отдельных меток
L = { tasks: [], projects: [], deleted: {}, settings: { theme: 'ocean', cats: DEF }, settingsTs: {}, settingsAt: 0 };
m = M(L, { ...R, settingsTs: undefined });
check('новое устройство берёт настройки из облака', m.settings.theme === 'mint' && m.settings.cats[1].id === 'dl');
// 12. равные метки — побеждает облако (устройства сходятся)
m = M({ ...L, settings: { theme: 'rose' }, settingsTs: { theme: 100 } }, R);
check('равные метки → облако', m.settings.theme === 'mint');
console.log(`\n${ok} из ${ok + fail} проверок прошли`);
process.exit(fail ? 1 : 0);
