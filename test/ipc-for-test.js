// Те же IPC-обработчики хранения, что в main.js, для тестового окна
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
module.exports = (dir) => {
  const file = path.join(dir, 'plannner-data.json');
  ipcMain.handle('store:load', () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } });
  ipcMain.handle('store:save', (_e, d) => { fs.writeFileSync(file, JSON.stringify(d, null, 2)); return true; });
  ipcMain.handle('autostart:get', () => false);
  ipcMain.handle('autostart:set', (_e, v) => v);
};
