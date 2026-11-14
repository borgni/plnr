const { app, BrowserWindow } = require('electron');
const a = process.argv; const i = a.findIndex((x) => x.endsWith('render-page.js')); const [file, out, w, h] = a.slice(i + 1);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: true, useContentSize: true });
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 1200));
  const img = await win.webContents.capturePage();
  require('fs').writeFileSync(out, img.toPNG());
  app.quit();
});
