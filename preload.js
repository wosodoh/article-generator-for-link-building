'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: data => ipcRenderer.invoke('save', data),
  dataPath: () => ipcRenderer.invoke('dataPath'),
  gemini: req => ipcRenderer.invoke('gemini', req),
  listModels: key => ipcRenderer.invoke('listModels', key),
  fetchPage: url => ipcRenderer.invoke('fetchPage', url),
  saveFile: opts => ipcRenderer.invoke('saveFile', opts),
  openPath: p => ipcRenderer.invoke('openPath', p),
  openUrl: u => ipcRenderer.invoke('openUrl', u),
  copy: text => ipcRenderer.invoke('copy', text),
});
