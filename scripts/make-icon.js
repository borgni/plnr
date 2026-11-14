const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const svg = fs.readFileSync(path.join(__dirname, '../build/icon.svg'));
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
(async () => {
  fs.writeFileSync(path.join(__dirname, '../build/icon.png'), render(1024));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const bufs = sizes.map(render);
  sizes.forEach((s, i) => fs.writeFileSync(path.join(__dirname, `../build/icon-${s}.png`), bufs[i]));
  const ico = await pngToIco(sizes.map((s) => path.join(__dirname, `../build/icon-${s}.png`)));
  fs.writeFileSync(path.join(__dirname, '../build/icon.ico'), ico);
  console.log('icon ok', ico.length);
})();
