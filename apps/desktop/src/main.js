/**
 * Sakspilot Desktop Agent — Electron main-prosess.
 *
 * Kjører i bakgrunnen som tray-app (Slack/Dropbox-stil). Hovedoppgaver:
 *   1. Vise tray-ikon med meny i system-trayen
 *   2. Holde Poller-instansen i live så lenge appen er åpen
 *   3. Synkronisere sessions til backend hvert 5. minutt
 *   4. Hente matching-regler fra backend hvert 10. minutt
 *   5. Vise innstillings-vindu på første start (innlogging)
 *
 * Appen viser ALDRI noe hovedvindu — alt skjer via tray-menyen og det
 * lille innstillinger-vinduet.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./settings');
const { Poller } = require('./poller');

// ── Global state ────────────────────────────────────────────────
let tray = null;
let settingsWindow = null;
let poller = null;
let syncTimer = null;
let rulesRefreshTimer = null;
const pendingSessions = []; // ikke-synkede sessions (kø)

// ── Single-instance lock — bare én Sakspilot om gangen ──────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}
app.on('second-instance', () => {
  // Hvis bruker prøver å starte appen igjen, åpne settings istedenfor
  openSettingsWindow();
});

// ── Skjul Dock-ikon på macOS (vi er tray-only) ──────────────────
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide();
}

// ── App lifecycle ───────────────────────────────────────────────
app.whenReady().then(async () => {
  createTray();

  // Hvis bruker ikke har logget inn enda — åpne settings-vinduet
  if (!store.get('token')) {
    openSettingsWindow();
  } else {
    startPoller();
    scheduleSync();
    scheduleRulesRefresh();
    refreshRules(); // hent regler én gang ved oppstart
  }
});

// Aldri quit på "window-all-closed" — vi er tray-app
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// ── Tray-ikon og meny ───────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('Tray-ikon mangler. Kjør "npm install" eller "node scripts/generate-icon.js"');
    app.quit();
    return;
  }
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Sakspilot — workspace for selvstendige');
  updateTrayMenu();
}

function updateTrayMenu() {
  const loggedIn = !!store.get('token');
  const userName = store.get('userName') || 'Ikke innlogget';
  const paused = poller?.paused ?? false;
  const status = poller?.getStatus();

  // Bygg dynamisk meny basert på status
  const items = [];

  if (loggedIn) {
    items.push({ label: `📍 ${userName}`, enabled: false });
    if (status?.currentSession?.sakTitle) {
      items.push({
        label: `🎯 Logger: ${truncate(status.currentSession.sakTitle, 40)}`,
        enabled: false,
      });
    } else if (status?.currentSession) {
      items.push({
        label: `⏱  Logger: ${truncate(status.currentSession.app, 40)}`,
        enabled: false,
      });
    } else {
      items.push({ label: '⏸  Ingen aktivitet', enabled: false });
    }
    if (status) {
      items.push({
        label: `   ${status.sessionCount} sessions · ${pendingSessions.length} ikke synket`,
        enabled: false,
      });
    }
    items.push({ type: 'separator' });
    items.push({
      label: paused ? '▶  Fortsett logging' : '⏸  Pause logging',
      click: () => togglePause(),
    });
    items.push({
      label: '🌐 Åpne Sakspilot på web',
      click: () => shell.openExternal(`${store.get('apiUrl').replace(/:\d+$/, ':3001')}/saker`),
    });
    items.push({
      label: '🔄 Synk nå',
      click: () => syncSessions(),
    });
    items.push({ type: 'separator' });
    items.push({
      label: '⚙  Innstillinger',
      click: () => openSettingsWindow(),
    });
    items.push({
      label: '🚪 Logg ut',
      click: () => logout(),
    });
  } else {
    items.push({ label: '⚠  Ikke innlogget', enabled: false });
    items.push({ type: 'separator' });
    items.push({
      label: '➡  Logg inn',
      click: () => openSettingsWindow(),
    });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'ℹ  Versjon ' + app.getVersion(), enabled: false });
  items.push({ role: 'quit', label: '❌ Avslutt' });

  const menu = Menu.buildFromTemplate(items);
  tray.setContextMenu(menu);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ── Innstillinger-vindu ─────────────────────────────────────────
function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    title: 'Sakspilot — Innstillinger',
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ── Poller-styring ──────────────────────────────────────────────
function startPoller() {
  if (poller) poller.stop();
  poller = new Poller({
    intervalSec: store.get('intervalSec'),
    excludedApps: store.get('excludedApps'),
  });

  poller.on('window-change', ({ snap, match }) => {
    // Logg til konsoll for feilsøking (synlig kun med electron . --dev)
    const sak = match ? ` → ${match.sakTitle}` : '';
    console.log(`[${ts()}] ▶ ${snap.owner?.name}: "${truncate(snap.title, 60)}"${sak}`);
    updateTrayMenu();
  });

  poller.on('session-closed', (sess) => {
    // Bare sessions over 5 sekunder lagres — kortere er sannsynligvis støy
    if (sess.durationSec >= 5) {
      pendingSessions.push(sess);
    }
  });

  poller.on('error', (err) => {
    console.error('[Poller] feil:', err.message);
  });

  poller.start();
}

function togglePause() {
  if (!poller) return;
  if (poller.paused) {
    poller.resume();
    notify('Sakspilot', 'Logging er på igjen');
  } else {
    poller.pause();
    notify('Sakspilot', 'Logging er pauset');
  }
  updateTrayMenu();
}

// ── Backend-kall ────────────────────────────────────────────────
async function apiCall(path, options = {}) {
  const token = store.get('token');
  const apiUrl = store.get('apiUrl');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function refreshRules() {
  if (!store.get('token') || !poller) return;
  try {
    // Hent alle saker — i full versjon: GET /agent/rules som returnerer
    // bare aktive matching-regler. Foreløpig: alle saker + reglene deres.
    const { saker } = await apiCall('/saker');
    const flatRules = [];
    for (const sak of saker || []) {
      // Hver sak har matchingRules som array (returneres når vi henter
      // /saker/:id, men /saker liste-endepunkt har bare _count). Vi
      // henter detaljer for hver sak inntil /agent/rules-endepunktet er bygd.
      try {
        const detail = await apiCall(`/saker/${sak.id}`);
        for (const rule of detail.matchingRules || []) {
          if (!rule.enabled) continue;
          flatRules.push({
            sakId: sak.id,
            sakTitle: sak.title,
            type: rule.type,
            pattern: rule.pattern,
            priority: rule.priority,
          });
        }
      } catch {
        // Hopp over saker vi ikke kan lese
      }
    }
    flatRules.sort((a, b) => b.priority - a.priority);
    poller.setRules(flatRules);
    console.log(`[Rules] hentet ${flatRules.length} matching-regler`);
  } catch (err) {
    console.error('[Rules] henting feilet:', err.message);
  }
}

async function syncSessions() {
  if (!store.get('token') || pendingSessions.length === 0) {
    updateTrayMenu();
    return;
  }
  const batch = pendingSessions.splice(0, pendingSessions.length);
  try {
    // I full versjon: POST /agent/sync med batch av TimeEntry-utkast.
    // Endepunktet finnes ikke enda — vi logger til lokal fil som backup.
    const logFile = path.join(app.getPath('userData'), 'pending-sessions.jsonl');
    fs.appendFileSync(
      logFile,
      batch.map((s) => JSON.stringify(s)).join('\n') + '\n'
    );
    store.set('lastSyncAt', new Date().toISOString());
    console.log(`[Sync] ${batch.length} sessions lagret lokalt (backend-endepunkt /agent/sync mangler ennå)`);

    // TODO når /agent/sync finnes:
    // await apiCall('/agent/sync', { method: 'POST', body: { sessions: batch } });
  } catch (err) {
    console.error('[Sync] feilet:', err.message);
    // Legg dem tilbake i køen så vi prøver igjen senere
    pendingSessions.unshift(...batch);
  }
  updateTrayMenu();
}

function scheduleSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncSessions, 5 * 60 * 1000);
}

function scheduleRulesRefresh() {
  if (rulesRefreshTimer) clearInterval(rulesRefreshTimer);
  rulesRefreshTimer = setInterval(refreshRules, 10 * 60 * 1000);
}

// ── Autentisering ───────────────────────────────────────────────
async function login(apiUrl, email, password) {
  // Settings-vinduet kaller hit via IPC. Vi kjører /auth/login.
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Innlogging feilet (${res.status})`);
  }
  store.set({
    apiUrl,
    token: data.token,
    userName: data.user.name,
    userEmail: data.user.email,
    organizationId: data.user.organizationId,
  });
  startPoller();
  scheduleSync();
  scheduleRulesRefresh();
  refreshRules();
  updateTrayMenu();
  notify('Sakspilot', `Logget inn som ${data.user.name}`);
  return data;
}

function logout() {
  store.set({ token: null, userName: null, userEmail: null, organizationId: null });
  if (poller) {
    poller.stop();
    poller = null;
  }
  if (syncTimer) clearInterval(syncTimer);
  if (rulesRefreshTimer) clearInterval(rulesRefreshTimer);
  updateTrayMenu();
  notify('Sakspilot', 'Logget ut');
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

// ── IPC fra settings-vinduet ────────────────────────────────────
ipcMain.handle('settings:get-all', () => store.store);
ipcMain.handle('settings:set', (_e, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle('auth:login', async (_e, apiUrl, email, password) => {
  try {
    const data = await login(apiUrl, email, password);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('auth:logout', () => {
  logout();
  return true;
});
ipcMain.handle('agent:status', () => poller?.getStatus() || null);
ipcMain.handle('agent:pending-count', () => pendingSessions.length);

// Oppdater tray-menyen hvert 15. sekund så status-linjene er ferske
setInterval(() => updateTrayMenu(), 15000);
