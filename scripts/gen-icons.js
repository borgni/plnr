// Собирает нужные иконки lucide в src/icons.js (один раз, при разработке)
const fs = require('fs'), path = require('path');
const names = ['sun','calendar-days','list-checks','plus','settings','chevron-left','chevron-right','check','trash-2','pencil','clock','graduation-cap','briefcase','heart','rocket','search','x','repeat','upload','download','sparkles','arrow-right','calendar-plus','rotate-ccw','eye','eye-off','power','layers','circle-check','book-open','scale','dumbbell','house','shopping-cart','plane','gamepad-2','cat','palette','tag','target','flag','percent','minus'];
const out = {};
for (const n of names) {
  const svg = fs.readFileSync(path.join(__dirname, '../node_modules/lucide-static/icons', n + '.svg'), 'utf8');
  const inner = svg.replace(/<!--.*?-->/s, '').replace(/^[\s\S]*?>/, m => m.includes('<svg') ? '' : m).replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
  out[n] = inner;
}
// свой стикер в том же стиле (линии 2px, скругления)
out['poop'] = '<path d="M4.5 21h15a2.75 2.75 0 0 0 0-5.5h-1a2.5 2.5 0 0 0-2-5H16a2.25 2.25 0 0 0-2.5-4.5c1-1 1-3-1-3.5.3 1.3-1 3.1-3 3.5A2.25 2.25 0 0 0 8 10.5h-.5a2.5 2.5 0 0 0-2 5h-1a2.75 2.75 0 0 0 0 5.5Z" /> <path d="M10 13.2h.01" /> <path d="M14 13.2h.01" /> <path d="M10 17.4c1.2.9 2.8.9 4 0" />';
const js = '/* Иконки: lucide (ISC) */\nwindow.P = window.P || {};\nP.ICONS = ' + JSON.stringify(out, null, 0) + ';\nP.icon = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P.ICONS[n] || ""}</svg>`;\n';
fs.writeFileSync(path.join(__dirname, '../src/icons.js'), js);
console.log('icons:', Object.keys(out).length);
