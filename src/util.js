/* Вспомогательные функции: даты, текст, категории */
window.P = window.P || {};

/* Темы дел (Учёба, Работа…) — настраиваются только в Настройках.
   Удалённая тема остаётся у старых дел, но для новых её выбрать нельзя. */
P.DEFAULT_CATS = [
  { id: 'study',    name: 'Учёба',  icon: 'graduation-cap', color: '#5cc8ff' },
  { id: 'work',     name: 'Работа', icon: 'briefcase',      color: '#9d8cff' },
  { id: 'personal', name: 'Личное', icon: 'heart',          color: '#ff86c0' },
  { id: 'project',  name: 'Проект', icon: 'rocket',         color: '#ffc46b' },
];
P.STICKERS = ['graduation-cap', 'briefcase', 'heart', 'rocket', 'book-open', 'scale', 'dumbbell', 'house', 'shopping-cart', 'plane', 'gamepad-2', 'cat', 'poop'];
P.CAT_COLORS = ['#5cc8ff', '#9d8cff', '#ff86c0', '#ffc46b', '#4ade80', '#f87171', '#fb923c', '#2dd4bf', '#e879f9', '#a3e635', '#facc15', '#94a3b8', '#c08457'];
P.MAX_CATS = 8;
P.CATS = {};
P.CAT_IDS = [];      // активные темы — их можно выбрать для дела
P.rebuildCats = (list) => {
  P.CATS = {};
  for (const c of list) P.CATS[c.id] = { ...c };
  P.CAT_IDS = list.filter((c) => !c.deleted).map((c) => c.id);
};
// темы для фильтров: активные + удалённые, у которых ещё есть дела
P.filterCats = () => {
  const used = new Set(P.store.all().map((t) => t.category));
  return Object.values(P.CATS).filter((c) => !c.deleted || used.has(c.id)).map((c) => c.id);
};
P.catOf = (id) => P.CATS[id] || { id, name: 'Без темы', icon: 'tag', color: '#94a3b8', deleted: true };

P.WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
P.WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
P.MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
P.MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad = (n) => String(n).padStart(2, '0');
P.pad = pad;

// Ключ даты 'ГГГГ-ММ-ДД' в местном времени
P.key = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
P.parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
P.todayKey = () => P.key(new Date());
P.addDays = (k, n) => { const d = P.parse(k); d.setDate(d.getDate() + n); return P.key(d); };
P.diffDays = (a, b) => Math.round((P.parse(b) - P.parse(a)) / 86400000);

// 01.09.26 — как на бумаге
P.fmtNumeric = (k) => { const d = P.parse(k); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`; };
P.fmtLong = (k) => { const d = P.parse(k); return `${d.getDate()} ${P.MONTHS_GEN[d.getMonth()]}`; };
P.fmtLongYear = (k) => { const d = P.parse(k); const y = d.getFullYear(); return `${d.getDate()} ${P.MONTHS_GEN[d.getMonth()]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
P.weekday = (k) => P.WEEKDAYS[P.parse(k).getDay()];
P.wdShort = (k) => P.WD_SHORT[P.parse(k).getDay()];

P.relLabel = (k) => {
  const diff = P.diffDays(P.todayKey(), k);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === 2) return 'Послезавтра';
  if (diff === -1) return 'Вчера';
  return '';
};

P.fmtFriendly = (k) => {
  const r = P.relLabel(k);
  return r ? `${r}, ${P.fmtLongYear(k)}` : `${P.wdShort(k)}, ${P.fmtLongYear(k)}`;
};

P.timeRange = (t) => {
  if (t.start && t.end) return `${t.start} – ${t.end}`;
  if (t.start) return `в ${t.start}`;
  return 'Весь день';
};

// Сортировка дел внутри дня: «весь день» сверху, затем по времени
P.byTime = (a, b) => {
  const as = a.start || '', bs = b.start || '';
  if (as !== bs) return as < bs ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
};

P.byDoneThenTime = (a, b) => (a.done === b.done ? P.byTime(a, b) : a.done ? 1 : -1);

// метка «◎ Проект · +10%» для дела, если функция проектов включена
P.projTag = (t, cls = '') => {
  if (!t.projectId || !(P.projectsOn && P.projectsOn())) return '';
  const p = P.store.project(t.projectId);
  if (!p) return '';
  return `<span class="proj-tag ${cls}" style="--pc:${p.color}" title="Проект «${P.esc(p.name)}»: выполнение добавит ${t.projectPct}%">${P.icon('target')}<span>${P.esc(p.name)}</span><b>+${t.projectPct}%</b></span>`;
};

// телефон: приложение для iPhone или узкое окно
P.isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
P.isMobile = () => document.body.classList.contains('mobile');

// свайп влево/вправо по элементу (для смены дня и месяца на телефоне)
// палец на полосе, которая сама листается вбок (темы и т.п.), — это не смена дня/месяца
const inHScroll = (node, stop) => {
  for (let n = node; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
};
P.onSwipe = (el, fn) => {
  let x0 = 0, y0 = 0, t0 = 0, tracking = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, textarea, .tp-col, .modal, .cat-filter, .list-filter') || inHScroll(e.target, el)) { tracking = false; return; }
    tracking = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - t0 < 700) fn(dx < 0 ? 1 : -1);
  }, { passive: true });
};

P.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

P.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

P.plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

P.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

P.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// Неделя с понедельника: индекс 0..6
P.mondayIndex = (d) => (d.getDay() + 6) % 7;
