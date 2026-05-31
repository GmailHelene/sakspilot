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

  // Auto-track: ÉN bryter — når på, telles alt åpnet via Sakspilot automatisk
  setAutoTrack: (enabled) => ipcRenderer.invoke('agent:set-auto-track', enabled),
  // Aktiv sak — settes når bruker navigerer til /saker/[id] så auto-track
  // attribuerer åpnede snarveier til riktig sak
  setActiveSak: (sakId, sakTitle) =>
    ipcRenderer.invoke('agent:set-active-sak', sakId, sakTitle),

  // Filsystem (kun Electron — åpner mapper i Windows Explorer)
  openFolder: (path) => ipcRenderer.invoke('shell:open-folder', path),

  // Multi-tab snarvei-system — flere BrowserViews samtidig
  openInWindow: (url, label) => ipcRenderer.invoke('shell:open-in-window', url, label),
  switchShortcut: (url) => ipcRenderer.invoke('shell:switch-shortcut', url),
  closeShortcutView: (url) => ipcRenderer.invoke('shell:close-shortcut-view', url),
  getShortcutState: () => ipcRenderer.invoke('shell:get-shortcut-state'),

  // Åpne URL i brukerens default-nettleser (brukes f.eks. fra settings.html
  // for "Opprett konto"-lenken som skal åpnes utenfor Sakspilot)
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Lokal-app-snarveier i Launcher: file-picker + åpne .exe
  pickExeFile: () => ipcRenderer.invoke('shell:pick-exe'),
  openLocalPath: (filePath) => ipcRenderer.invoke('shell:open-local', filePath),

  // Lytt etter shortcut-state-events fra main-prosessen.
  // Hver gang åpnede tabs eller aktiv tab endres, broadcastes hele state.
  onShortcutState: (callback) => {
    const listener = (_e, state) => callback(state);
    ipcRenderer.on('shortcut:state', listener);
    return () => ipcRenderer.removeListener('shortcut:state', listener);
  },
});

// Egen, mer begrenset bro for det flytende widget-vinduet (widget.html).
// Trenger bare et lite sett IPC-kanaler — eksponeres via egen world for
// å holde sakspilot.no-overflaten ren fra widget-spesifikke ting.
const WIDGET_ALLOWED = new Set([
  'agent:status',
  'agent:start-work-session',
  'agent:stop-work-session',
  'agent:toggle-pause',
  'agent:set-auto-track',
  'agent:sync-now',
  'widget:resize',
]);
contextBridge.exposeInMainWorld('sakspilotWidget', {
  invoke: (channel, ...args) => {
    if (!WIDGET_ALLOWED.has(channel)) {
      return Promise.reject(new Error('Widget channel ikke tillatt: ' + channel));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
});
