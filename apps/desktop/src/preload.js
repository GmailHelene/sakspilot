/**
 * Preload-script — sikker IPC-bro mellom renderer (settings.html)
 * og main-prosessen. Eksponerer kun trygt API til DOM.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sakspilot', {
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  login: (apiUrl, email, password) =>
    ipcRenderer.invoke('auth:login', apiUrl, email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getStatus: () => ipcRenderer.invoke('agent:status'),
  getPendingCount: () => ipcRenderer.invoke('agent:pending-count'),
});
