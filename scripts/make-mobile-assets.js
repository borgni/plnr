// Картинки для iPhone: иконка 1024×1024 без прозрачности и заставка запуска
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const dir = path.join(__dirname, '../mobile/assets');
const icon = fs.readFileSync(path.join(dir, 'icon-ios.svg'));
fs.writeFileSync(path.join(dir, 'AppIcon-1024.png'), new Resvg(icon, { fitTo: { mode: 'width', value: 1024 }, background: '#1f5fe8' }).render().asPng());
const logo = fs.readFileSync(path.join(__dirname, '../build/icon.svg'), 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">
  <defs><radialGradient id="g" cx="0.3" cy="0.15" r="0.9"><stop offset="0" stop-color="#1d55d8"/><stop offset="0.55" stop-color="#0b2266"/><stop offset="1" stop-color="#040c27"/></radialGradient></defs>
  <rect width="2732" height="2732" fill="url(#g)"/>
  <svg x="1146" y="1146" width="440" height="440" viewBox="0 0 512 512">${logo}</svg>
</svg>`;
const png = new Resvg(splash, { fitTo: { mode: 'width', value: 2732 } }).render().asPng();
fs.writeFileSync(path.join(dir, 'splash-2732.png'), png);
console.log('mobile assets ok');
