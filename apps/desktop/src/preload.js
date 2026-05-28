/**
 * Preload-script — sikker IPC-bro mellom renderer (settings.html)
 * og main-prosessen. Eksponerer kun trygt API til DOM.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sakspilot', {
  // Markør så web-UI vet at den kjører i Sakspilot Desktop og ikke browser
  isDesktop: true,

  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  login: (apiUrl, email, password) =>
    ipcRenderer.invoke('auth:login', apiUrl, email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getStatus: () => ipcRenderer.invoke('agent:status'),
  getPendingCount: () => ipcRenderer.invoke('agent:pending-count'),

  // Arbeidsøkt-styring (samme som tray-meny-knappene)
  startWorkSession: () => ipcRenderer.invoke('agent:start-work-session'),
  stopWorkSession: () => ipcRenderer.invoke('agent:stop-work-session'),
  togglePause: () => ipcRenderer.invoke('agent:toggle-pause'),
  syncNow: () => ipcRenderer.invoke('agent:sync-now'),

  // Filsystem (kun Electron — åpner mapper i Windows Explorer)
  openFolder: (path) => ipcRenderer.invoke('shell:open-folder', path),

  // Åpne URL i embedded BrowserView INNE i dashboard-vinduet
  openInWindow: (url, label) => ipcRenderer.invoke('shell:open-in-window', url, label),
  closeShortcutView: () => ipcRenderer.invoke('shell:close-shortcut-view'),

  // Åpne URL i brukerens default-nettleser (brukes f.eks. fra settings.html
  // for "Opprett konto"-lenken som skal åpnes utenfor Sakspilot)
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Lytt etter shortcut-events fra main-prosessen
  onShortcutOpened: (callback) => {
    const listener = (_e, meta) => callback(meta);
    ipcRenderer.on('shortcut:opened', listener);
    return () => ipcRenderer.removeListener('shortcut:opened', listener);
  },
  onShortcutClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:closed', listener);
    return () => ipcRenderer.removeListener('shortcut:closed', listener);
  },
});
