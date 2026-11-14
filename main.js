// PLNR — главный процесс Electron
const { app, BrowserWindow, ipcMain, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.borgni.plannner');
nativeTheme.themeSource = 'dark';
app.commandLine.appendSwitch('lang', 'ru'); // русский язык системных элементов

// Папка данных: %APPDATA%\PLNR (в тестах можно переопределить)
app.setPath('userData', process.env.PLANNNER_DATA_DIR || path.join(app.getPath('appData'), 'PLNR'));
// перенос дел из папки прежнего названия «Планнер», если она есть
try {
  const oldDir = path.join(app.getPath('appData'), 'Планнер');
  const newFile = path.join(app.getPath('userData'), 'plannner-data.json');
  const oldFile = path.join(oldDir, 'plannner-data.json');
  if (!process.env.PLANNNER_DATA_DIR && !fs.existsSync(newFile) && fs.existsSync(oldFile)) {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.copyFileSync(oldFile, newFile);
  }
} catch {}

const dataFile = () => path.join(app.getPath('userData'), 'plannner-data.json');
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Запись небольших служебных файлов (положение окна)
function writeJSONAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, file + '.bak'); } catch {}
  }
  fs.renameSync(tmp, file);
}

// Запись дел: временный файл → проверка → замена основного. Если Windows/антивирус
// на мгновение держит файл, пробуем ещё несколько раз, а в крайнем случае копируем поверх.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function writeDataSafe(file, obj) {
  if (!obj || !Array.isArray(obj.tasks)) throw new Error('bad data');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(obj, null, 2);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // убеждаемся, что записалось целиком
  if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch {} }
  for (let i = 0; i < 6; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i === 5) { fs.copyFileSync(tmp, file); try { fs.unlinkSync(tmp); } catch {} return; }
      await sleep(80 * (i + 1));
    }
  }
}

// Раз в день — копия всех дел в папку backups; хранятся 14 последних копий.
// Удаляются только старые КОПИИ, сами дела в основном файле не трогаются.
function dailyBackup() {
  try {
    if (!fs.existsSync(dataFile()) || !readJSON(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const target = path.join(backupDir(), `plannner-data-${stamp}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const files = fs.readdirSync(backupDir()).filter((f) => /^plannner-data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) { try { fs.unlinkSync(path.join(backupDir(), f)); } catch {} }
  } catch {}
}

let win = null;

function createWindow() {
  const st = readJSON(stateFile()) || {};
  win = new BrowserWindow({
    width: st.width || 1320,
    height: st.height || 840,
    x: st.x, y: st.y,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'PLNR',
    backgroundColor: '#071538',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e8f0ff', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (st.maximized) win.maximize();

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (process.env.PLNR_AUTOCLOSE) setTimeout(() => win.close(), +process.env.PLNR_AUTOCLOSE); // для проверки закрытия

  // Внешние ссылки — в браузер, не внутри приложения
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    const b = win.getNormalBounds();
    try { writeJSONAtomic(stateFile(), { ...b, maximized: win.isMaximized() }); } catch {}
  };
  // перед закрытием дожидаемся, пока окно допишет последние изменения
  let allowClose = false, closing = false;
  win.on('close', (e) => {
    saveState();
    if (allowClose) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    const done = () => { allowClose = true; if (win && !win.isDestroyed()) win.close(); };
    const timer = setTimeout(done, 1500);
    ipcMain.once('app:flushed', () => { clearTimeout(timer); done(); });
    win.webContents.send('app:flush');
  });
  win.on('closed', () => { win = null; });
}

// --- IPC: данные ---
ipcMain.handle('store:load', () => {
  const file = dataFile();
  if (!fs.existsSync(file)) return readJSON(file + '.bak');
  const d = readJSON(file);
  if (d) return d;
  // основной файл повреждён: сохраняем его копию (ничего не теряем) и берём запасной
  try { fs.copyFileSync(file, path.join(app.getPath('userData'), `plannner-data.broken-${Date.now()}.json`)); } catch {}
  const bak = readJSON(file + '.bak');
  if (bak) return bak;
  try {
    const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort().reverse();
    for (const f of files) { const b = readJSON(path.join(backupDir(), f)); if (b) return b; }
  } catch {}
  return null;
});

ipcMain.handle('store:save', async (_e, data) => {
  await writeDataSafe(dataFile(), data);
  return true;
});

ipcMain.handle('data:folder', () => shell.openPath(app.getPath('userData')));

// --- Запуск ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // автозапуск убран из программы — выключаем, если его включали в старых версиях
    try { if (app.isPackaged && app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: false }); } catch {}
    dailyBackup();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
