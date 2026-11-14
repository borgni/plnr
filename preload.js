// Мост между окном и системой: только нужные функции
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plannerApi', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  openDataFolder: () => ipcRenderer.invoke('data:folder'),
  onFlush: (cb) => ipcRenderer.on('app:flush', () => cb()),
  flushed: () => ipcRenderer.send('app:flushed'),
  platform: process.platform,
});
