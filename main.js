// Генератор статей — главный процесс (окно, файлы, сеть)
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const dataFile = () => path.join(app.getPath('userData'), 'data.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    title: 'Генератор статей',
    backgroundColor: '#f6f7f9',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // Ссылки не открываем внутри программы
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // F12 — инструменты разработчика (на случай диагностики)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Данные ──
ipcMain.handle('load', () => {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch (e) { return null; }
});
ipcMain.handle('save', (e, data) => {
  const f = dataFile();
  const tmp = f + '.tmp';
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, f);
  return true;
});
ipcMain.handle('dataPath', () => dataFile());

// ── Сеть ──
async function httpRequest({ url, method, headers, body, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 180000);
  try {
    const r = await fetch(url, { method: method || 'GET', headers: headers || {}, body, signal: ctrl.signal, redirect: 'follow' });
    const text = await r.text();
    return { status: r.status, text };
  } catch (e) {
    return { status: 0, text: e.name === 'AbortError' ? 'Google не ответил за 2,5 мин' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('gemini', (e, { url, body, key }) =>
  httpRequest({ url, method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, timeoutMs: 150000 }));

ipcMain.handle('listModels', (e, key) =>
  httpRequest({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', headers: { 'x-goog-api-key': key }, timeoutMs: 30000 }));

ipcMain.handle('fetchPage', async (e, url) => {
  const r = await httpRequest({ url, headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeoutMs: 15000 });
  return r.status >= 200 && r.status < 400 ? r.text.slice(0, 400000) : '';
});

// ── Файлы ──
ipcMain.handle('saveFile', async (e, { defaultName, kind, content }) => {
  const filters = kind === 'docx' ? [{ name: 'Word', extensions: ['docx'] }] : [{ name: 'HTML', extensions: ['html'] }];
  const res = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('documents'), defaultName), filters });
  if (res.canceled || !res.filePath) return '';
  if (kind === 'docx') {
    const HTMLtoDOCX = require('html-to-docx');
    const buf = await HTMLtoDOCX(content, null, { title: 'Статьи', font: 'Arial', fontSize: 22, table: { row: { cantSplit: true } } });
    fs.writeFileSync(res.filePath, buf);
  } else {
    fs.writeFileSync(res.filePath, content, 'utf8');
  }
  return res.filePath;
});
ipcMain.handle('openPath', (e, p) => shell.openPath(p));
ipcMain.handle('openUrl', (e, u) => { if (/^https?:\/\//i.test(u)) shell.openExternal(u); });
ipcMain.handle('copy', (e, text) => { clipboard.writeText(String(text)); return true; });
