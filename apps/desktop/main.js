/**
 * Sakspilot Desktop Agent — Electron main-prosess.
 *
 * Kjører i bakgrunnen som tray-app. To moduser:
 *   1. "Arbeidsøkt aktiv"  — du har klikket Start, vi logger aktivt vindu
 *      hvert N. sekund og knytter til sak via matching-regler
 *   2. "Inaktiv"           — vi logger ikke noe. Klikk Start for å begynne.
 *
 * Når du klikker "Stopp + rapport":
 *   - Pågående session avsluttes
 *   - Alle sessions fra denne arbeidsøkten samles til en Excel-rapport
 *   - Du får velge hvor du vil lagre rapporten
 *   - Sessions sendes til backend via /agent/sync (hvis innlogget)
 *
 * Pause/Resume finnes også for korte avbrudd MIDT i en arbeidsøkt (lunsj,
 * privat-tlf osv.) uten å avslutte rapporten.
 */
const {
  app, BrowserWindow, BrowserView, Tray, Menu, nativeImage, shell, ipcMain,
  Notification, dialog,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ── Crash-logger — skriv ALLE krasj til fil + dialog ────────────
// Uten dette feiler en pakket .exe stille hvis noe går galt ved oppstart.
// Loggen kan deles for feilsøking.
const crashLogPath = path.join(os.tmpdir(), 'sakspilot-crash.log');
function logCrash(label, err) {
  try {
    const msg = `[${new Date().toISOString()}] ${label}\n${err && err.stack ? err.stack : String(err)}\n\n`;
    fs.appendFileSync(crashLogPath, msg);
    try {
      dialog.showErrorBox(
        'Sakspilot - feil ved oppstart',
        `${label}\n\n${err && err.message ? err.message : String(err)}\n\nFull logg: ${crashLogPath}`
      );
    } catch {}
  } catch {}
}
process.on('uncaughtException', (err) => logCrash('uncaughtException', err));
process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err));

const store = require('./settings');
const { Poller } = require('./poller');
const { buildWorkSessionReport } = require('./report');

// ── Global state ────────────────────────────────────────────────
let tray = null;
let settingsWindow = null;
let poller = null;
let syncTimer = null;
let rulesRefreshTimer = null;

// Arbeidsøkt-state (kun i minnet — ny etter restart)
let workSessionActive = false;
let workSessionStart = null;
let workSessionSessions = [];   // sessions samlet i pågående arbeidsøkt
const pendingSessions = [];     // sessions klare for sync til backend
let deviceId = null;            // stabil per installasjon

// ── Single-instance lock ────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}
app.on('second-instance', () => openSettingsWindow());

if (process.platform === 'darwin' && app.dock) {
  app.dock.hide();
}

// ── App lifecycle ───────────────────────────────────────────────
app.whenReady().then(async () => {
  // Generer stabil device-id ved første start
  deviceId = store.get('deviceId');
  if (!deviceId) {
    deviceId = 'dev-' + Math.random().toString(36).slice(2, 12) + '-' + Date.now();
    store.set('deviceId', deviceId);
  }

  createTray();

  if (!store.get('token')) {
    openSettingsWindow();
  } else {
    initializeAgent();
    // Åpne dashbordet automatisk ved oppstart hvis bruker er innlogget
    // (kan skrus av i innstillinger senere)
    if (store.get('openDashboardOnStart', true) !== false) {
      openDashboardWindow();
    }
  }
});

app.on('window-all-closed', (e) => e.preventDefault());

function initializeAgent() {
  // Poller START seg selv, men VENTER på "Start arbeidsøkt" før den
  // faktisk logger noe (paused = true til man klikker Start)
  if (!poller) {
    poller = new Poller({
      intervalSec: store.get('intervalSec'),
      excludedApps: store.get('excludedApps'),
    });

    poller.on('window-change', ({ snap, match }) => {
      const sak = match ? ` → ${match.sakTitle}` : '';
      console.log(`[${ts()}] ▶ ${snap.owner?.name}: "${truncate(snap.title, 60)}"${sak}`);
      updateTrayMenu();
    });

    poller.on('session-closed', (sess) => {
      if (sess.durationSec < 5) return; // ignorer kort støy
      if (workSessionActive) {
        workSessionSessions.push(sess);
      }
      pendingSessions.push(sess);
    });

    poller.on('error', (err) => console.error('[Poller] feil:', err.message));

    poller.start();
    poller.pause(); // start pauset - venter på "Start arbeidsøkt"
  }

  scheduleSync();
  scheduleRulesRefresh();
  refreshRules();
}

// ── Tray ────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('Tray-ikon mangler. Kjør "npm install" eller "node scripts/generate-icon.js"');
    app.quit();
    return;
  }
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Sakspilot');
  updateTrayMenu();
  // Dobbeltklikk: åpne settings/status-vindu
  tray.on('double-click', () => openSettingsWindow());
}

function updateTrayMenu() {
  const loggedIn = !!store.get('token');
  const userName = store.get('userName') || 'Ikke innlogget';
  const status = poller?.getStatus();
  const items = [];

  if (loggedIn) {
    items.push({ label: `📍 ${userName}`, enabled: false });

    if (workSessionActive) {
      const elapsedSec = Math.round((Date.now() - workSessionStart) / 1000);
      items.push({ label: `🟢 Arbeidsøkt aktiv - ${formatDur(elapsedSec)}`, enabled: false });
      if (status?.currentSession?.sakTitle) {
        items.push({ label: `   🎯 ${truncate(status.currentSession.sakTitle, 38)}`, enabled: false });
      } else if (status?.currentSession) {
        items.push({ label: `   ⏱  ${truncate(status.currentSession.app, 38)}`, enabled: false });
      }
      items.push({ label: `   ${workSessionSessions.length} sessions i denne økten`, enabled: false });
      items.push({ type: 'separator' });
      items.push({ label: '■  Stopp arbeidsøkt + lag rapport', click: () => stopWorkSession() });
      items.push({
        label: poller?.paused ? '▶  Fortsett (etter pause)' : '⏸  Pause (kort avbrudd)',
        click: () => togglePause(),
      });
    } else {
      items.push({ label: '⏹  Ingen arbeidsøkt - klikk Start for å logge', enabled: false });
      items.push({ type: 'separator' });
      items.push({ label: '▶  Start arbeidsøkt', click: () => startWorkSession() });
    }

    items.push({ type: 'separator' });
    items.push({
      label: `🔄 Synk til backend (${pendingSessions.length} ventende)`,
      click: () => syncSessions(),
    });
    items.push({
      label: '📊 Åpne dashbord (i Sakspilot)',
      click: () => openDashboardWindow(),
    });
    items.push({
      label: '🔁 Last dashbord på nytt (Ctrl+Shift+R)',
      enabled: !!(dashboardWindow && !dashboardWindow.isDestroyed()),
      click: () => {
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.session.clearCache().finally(() => {
            if (!dashboardWindow.isDestroyed()) dashboardWindow.reload();
          });
        }
      },
    });
    items.push({
      label: '🌐 Åpne i nettleser',
      click: () => {
        const apiUrl = store.get('apiUrl') || 'https://api.sakspilot.no';
        const webUrl = apiUrl.includes('sakspilot.no')
          ? 'https://sakspilot.no'
          : apiUrl.includes('onrender.com')
            ? 'https://sakspilot-web.vercel.app'
            : apiUrl.replace(/:\d+$/, ':3001');
        shell.openExternal(`${webUrl}/saker`);
      },
    });
    items.push({ type: 'separator' });
    items.push({ label: '⚙  Innstillinger', click: () => openSettingsWindow() });
    items.push({ label: '🚪 Logg ut', click: () => logout() });
  } else {
    items.push({ label: '⚠  Ikke innlogget', enabled: false });
    items.push({ type: 'separator' });
    items.push({ label: '➡  Logg inn', click: () => openSettingsWindow() });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'ℹ  Sakspilot v' + app.getVersion(), enabled: false });
  items.push({ role: 'quit', label: '❌ Avslutt' });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function formatDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}t ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Arbeidsøkt-håndtering ───────────────────────────────────────
function startWorkSession() {
  if (!poller) return;
  workSessionActive = true;
  workSessionStart = Date.now();
  workSessionSessions = [];
  poller.resume();
  updateTrayMenu();
  notify('Sakspilot', 'Arbeidsøkt startet - logging aktiv');
  // Hent friske regler ved start
  refreshRules();
}

async function stopWorkSession() {
  if (!workSessionActive || !poller) return;

  // Avslutt pågående session så det siste vinduet inkluderes
  poller.pause();
  // poller.pause() lukker current session og kaster session-closed → pushes
  // til workSessionSessions hvis den var lang nok

  // Gi event-loopen et øyeblikk til å prosessere session-closed
  await new Promise((r) => setTimeout(r, 200));

  const sessions = [...workSessionSessions];
  const wsStart = new Date(workSessionStart);
  const wsEnd = new Date();
  const durSec = Math.round((wsEnd - wsStart) / 1000);

  // Reset state FØR vi viser dialog (så bruker kan starte ny økt selv om
  // dialogen henger)
  workSessionActive = false;
  workSessionStart = null;
  workSessionSessions = [];
  updateTrayMenu();

  if (sessions.length === 0) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Sakspilot',
      message: 'Arbeidsøkt avsluttet',
      detail: `Varighet: ${formatDur(durSec)}\nIngen aktivitet logget - sessions under 5 sekunder ignoreres.`,
      buttons: ['OK'],
    });
    return;
  }

  // Berik sessions med sakHourlyRate fra hentede regler
  const ruleCache = poller?.rules || [];
  const sakRateMap = new Map();
  for (const r of ruleCache) {
    if (r.sakHourlyRate) sakRateMap.set(r.sakId, r.sakHourlyRate);
  }
  const enriched = sessions.map((s) => ({
    ...s,
    sakHourlyRate: s.sakId ? sakRateMap.get(s.sakId) || null : null,
  }));

  // Foreslå filnavn med dato + klokkeslett
  const datePart = wsStart.toISOString().slice(0, 10);
  const timePart = wsStart.toTimeString().slice(0, 5).replace(':', '');
  const defaultName = `Sakspilot-arbeidsokt-${datePart}-${timePart}.xlsx`;

  const result = await dialog.showSaveDialog({
    title: 'Lagre arbeidsøktsrapport',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Excel-fil', extensions: ['xlsx'] }],
  });

  if (!result.canceled && result.filePath) {
    try {
      const buf = buildWorkSessionReport({
        workSessionStart: wsStart,
        workSessionEnd: wsEnd,
        sessions: enriched,
        userName: store.get('userName') || '',
        orgName: store.get('organizationName') || '',
      });
      fs.writeFileSync(result.filePath, buf);

      const open = await dialog.showMessageBox({
        type: 'info',
        title: 'Sakspilot',
        message: 'Rapport lagret',
        detail: `${sessions.length} sessions over ${formatDur(durSec)}\n\n${result.filePath}`,
        buttons: ['Åpne fil', 'Vis i mappe', 'OK'],
        defaultId: 0,
        cancelId: 2,
      });
      if (open.response === 0) shell.openPath(result.filePath);
      if (open.response === 1) shell.showItemInFolder(result.filePath);
    } catch (err) {
      dialog.showErrorBox('Rapporteringsfeil', err.message);
    }
  }

  // Synk til backend (uavhengig av om rapport ble lagret)
  syncSessions();
}

function togglePause() {
  if (!poller) return;
  if (poller.paused) {
    poller.resume();
    notify('Sakspilot', 'Logging er på igjen');
  } else {
    poller.pause();
    notify('Sakspilot', 'Logging pauset (arbeidsøkt fortsetter)');
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
    throw new Error(`API ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}

async function refreshRules() {
  if (!store.get('token') || !poller) return;
  try {
    const { rules } = await apiCall('/agent/rules');
    poller.setRules(rules);
    console.log(`[Rules] hentet ${rules.length} matching-regler fra /agent/rules`);
  } catch (err) {
    console.error('[Rules] henting feilet:', err.message);
  }
}

async function syncSessions() {
  if (!store.get('token')) {
    updateTrayMenu();
    return;
  }
  if (pendingSessions.length === 0) {
    updateTrayMenu();
    return;
  }
  const batch = pendingSessions.splice(0, pendingSessions.length);
  try {
    const result = await apiCall('/agent/sync', {
      method: 'POST',
      body: {
        agentVersion: app.getVersion(),
        deviceName: require('node:os').hostname(),
        sessions: batch.map((s) => ({
          startedAt: new Date(s.startedAt).toISOString(),
          endedAt: new Date(s.endedAt).toISOString(),
          durationSec: s.durationSec,
          app: s.app,
          title: s.title,
          sakId: s.sakId,
          matchedOn: s.matchedOn,
          deviceId,
        })),
      },
    });
    store.set('lastSyncAt', new Date().toISOString());
    console.log(`[Sync] ${result.created} sessions synket til backend`);
  } catch (err) {
    console.error('[Sync] feilet:', err.message);
    // Legg dem tilbake — neste sync-tick prøver igjen
    pendingSessions.unshift(...batch);
    // Vis synlig notification (max én per time, så vi ikke spammer)
    const lastNotif = store.get('lastSyncErrorNotif') || 0;
    if (Notification.isSupported() && Date.now() - lastNotif > 3600_000) {
      const apiUrl = store.get('apiUrl') || 'https://api.sakspilot.no';
      const isLocalhost = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');
      new Notification({
        title: 'Sakspilot - sync feilet',
        body: isLocalhost
          ? `Kan ikke nå API på ${apiUrl}. Endre i Innstillinger → API URL til https://api.sakspilot.no`
          : `Kan ikke nå ${apiUrl}: ${err.message}. Sessions beholdes - prøver igjen om 5 min.`,
        urgency: 'normal',
      }).show();
      store.set('lastSyncErrorNotif', Date.now());
    }
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

// ── Innstillinger-vindu ─────────────────────────────────────────
function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 650,
    title: 'Sakspilot - Innstillinger',
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

let dashboardWindow = null;
let dashboardLoadTimer = null;

function openDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  const apiUrl = store.get('apiUrl') || 'https://api.sakspilot.no';
  // For prod: api.sakspilot.no + sakspilot.no. For dev: localhost:8001 + localhost:3001
  const webUrl = apiUrl.includes('sakspilot.no')
    ? 'https://sakspilot.no'
    : apiUrl.includes('onrender.com')
      ? 'https://sakspilot-web.vercel.app'
      : apiUrl.replace(/:\d+$/, ':3001').replace('/api', '');

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Sakspilot - Dashbord',
    autoHideMenuBar: false,
    backgroundColor: '#1E3A5F', // unngå hvit-blink før innhold laster
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // Tøm HTTP-cache OG service-worker-cache for å unngå webpack chunk-hash-
  // mismatch etter deploy. Vercel ruller ut nye chunks med nye hashes;
  // gammel cachet HTML refererer til chunks som ikke lenger eksisterer →
  // «Cannot read properties of undefined (reading 'call')».
  // Disse er fire-and-forget — vil ikke blokkere oppstart, men bruker
  // session.clearStorageData som tar alt for sakspilot.no.
  Promise.all([
    dashboardWindow.webContents.session.clearCache(),
    // Ingen origin-filter: clear ALT av SW + cachestorage. URL-en kan være
    // både sakspilot.no og www.sakspilot.no, og origin-filteret krever
    // EKSAKT match, så vi dropper det.
    dashboardWindow.webContents.session.clearStorageData({
      storages: ['serviceworkers', 'cachestorage'],
    }),
  ]).catch(() => {});

  // Auto-recovery: hvis renderer crasher (typisk webpack chunk-feil), reload.
  // Tøm BÅDE cache og service-worker så vi ikke får samme feil i loop.
  dashboardWindow.webContents.on('render-process-gone', async (_e, details) => {
    console.warn('[Dashbord] Renderer crashet:', details.reason);
    if (details.reason === 'clean-exit' || dashboardWindow.isDestroyed()) return;
    try {
      await Promise.all([
        dashboardWindow.webContents.session.clearCache(),
        dashboardWindow.webContents.session.clearStorageData({
          storages: ['serviceworkers', 'cachestorage'],
          origin: 'https://sakspilot.no',
        }),
      ]);
    } catch {}
    if (!dashboardWindow.isDestroyed()) dashboardWindow.reload();
  });

  // Tastatursnarveier: Ctrl+R = reload, Ctrl+Shift+R = hard reload (tøm cache)
  dashboardWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      if (input.shift) {
        dashboardWindow.webContents.session.clearCache().finally(() => {
          if (!dashboardWindow.isDestroyed()) dashboardWindow.reload();
        });
      } else {
        dashboardWindow.reload();
      }
    }
    // Ctrl+Shift+I = DevTools (for feilsøking)
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      dashboardWindow.webContents.toggleDevTools();
    }
  });

  // Splash som ALLTID vises først (også hvis web-laster henger)
  loadSplash();

  // Forsøk å laste web-appen etter 500ms
  setTimeout(() => attemptLoad(), 500);

  // 'did-fail-load' fanger ERR_CONNECTION_REFUSED osv. som .catch() ikke gjør
  dashboardWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    // Hopp over hvis det er splash/error-pagen vår som "feilet" (data: URLs)
    if (!validatedURL || validatedURL.startsWith('data:')) return;
    console.error(`[Dashbord] Kunne ikke laste ${validatedURL}: ${errorCode} ${errorDescription}`);
    loadErrorPage(errorCode, errorDescription, validatedURL);
  });

  dashboardWindow.on('closed', () => {
    if (dashboardLoadTimer) { clearTimeout(dashboardLoadTimer); dashboardLoadTimer = null; }
    dashboardWindow = null;
  });

  // IPC-handler for "prøv igjen"-knappen i error-pagen
  ipcMain.removeHandler('dashboard:retry');
  ipcMain.handle('dashboard:retry', () => {
    loadSplash();
    setTimeout(() => attemptLoad(), 300);
    return true;
  });

  function loadSplash() {
    if (!dashboardWindow) return;
    const splashHTML = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Sakspilot - laster</title>
      <style>
        body { margin:0; font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
               background: #1E3A5F; color: white; height: 100vh;
               display: flex; align-items: center; justify-content: center; flex-direction: column; }
        .logo { font-size: 36px; font-weight: 800; letter-spacing: 3px; margin-bottom: 8px; }
        .sub { font-size: 13px; color: #B8860B; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 28px; }
        .loader { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2);
                  border-top-color: #B8860B; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status { margin-top: 18px; font-size: 13px; color: rgba(255,255,255,0.6); }
      </style></head><body>
        <div class="logo">SAKSPILOT</div>
        <div class="sub">Workspace for selvstendige</div>
        <div class="loader"></div>
        <div class="status">Laster dashbord...</div>
      </body></html>`;
    dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHTML));
  }

  function attemptLoad() {
    if (!dashboardWindow) return;
    dashboardWindow.loadURL(webUrl).catch((err) => {
      loadErrorPage('LOAD_FAILED', err.message, webUrl);
    });
  }

  function loadErrorPage(code, desc, url) {
    if (!dashboardWindow) return;
    const errorHTML = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Sakspilot - kunne ikke koble til</title>
      <style>
        * { box-sizing: border-box; }
        body { margin:0; padding: 0; font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
               background: #FAFAF7; color: #1A1A1A; line-height: 1.5; }
        .container { max-width: 640px; margin: 60px auto; padding: 32px;
                     background: white; border: 1px solid #E2E2DC; border-radius: 14px;
                     box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
        .logo-text { font-size: 16px; font-weight: 800; letter-spacing: 1px; color: #1E3A5F; }
        h1 { color: #9D0208; font-size: 22px; margin: 0 0 8px 0; }
        .sub { color: #555; margin-bottom: 24px; }
        code { background: #F4F4F0; padding: 2px 8px; border-radius: 4px;
               font-family: Consolas, "Courier New", monospace; font-size: 13px; color: #1E3A5F; }
        h2 { color: #1E3A5F; font-size: 15px; margin-top: 24px; text-transform: uppercase; letter-spacing: 0.5px; }
        ol { padding-left: 20px; }
        ol li { margin-bottom: 12px; }
        .btn { display: inline-block; background: #1E3A5F; color: white;
               padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;
               border: none; cursor: pointer; margin-top: 20px; margin-right: 10px;
               font-family: inherit; }
        .btn-secondary { background: white; color: #555; border: 1px solid #E2E2DC; }
        .meta { margin-top: 28px; padding-top: 16px; border-top: 1px solid #E2E2DC;
                font-size: 12px; color: #999; }
      </style></head><body>
        <div class="container">
          <div class="logo">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <polygon points="14,2 26,26 2,26" fill="#152A47" />
              <polygon points="14,10 22,26 6,26" fill="#B8860B" />
            </svg>
            <span class="logo-text">SAKSPILOT</span>
          </div>
          <h1>⚠ Kunne ikke koble til dashbordet</h1>
          <p class="sub">Sakspilot-agenten kjører som den skal, men web-dashbordet er ikke tilgjengelig på <code>${url}</code>.</p>

          <h2>Hva gjør jeg?</h2>
          <ol>
            <li><strong>Sjekk at backend-tjenesten kjører.</strong> Den må startes separat fra agenten.</li>
            <li>Gå til mappa <code>C:\\Users\\helen\\Desktop\\sakspilot</code></li>
            <li>Dobbeltklikk <code>Start - Sakspilot dev.bat</code></li>
            <li>Vent til du ser "<em>Ready in Xs</em>" i terminalvinduet</li>
            <li>Klikk "Prøv igjen" under</li>
          </ol>

          <p style="margin-top: 24px;">
            <button class="btn" onclick="window.location.reload()">🔄 Prøv igjen</button>
            <a class="btn btn-secondary" href="${url}" target="_blank">🌐 Åpne i nettleser</a>
          </p>

          <div class="meta">
            <strong>Teknisk:</strong> ${code} - ${desc}<br>
            <strong>URL forsøkt:</strong> ${url}<br>
            <strong>Når web er live på sakspilot.no</strong> trenger du ikke kjøre dette lokalt.
          </div>
        </div>
      </body></html>`;
    dashboardWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHTML));
  }
}

// ── Auth ────────────────────────────────────────────────────────
async function login(apiUrl, email, password) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Innlogging feilet (${res.status})`);
  store.set({
    apiUrl,
    token: data.token,
    userName: data.user.name,
    userEmail: data.user.email,
    organizationId: data.user.organizationId,
    organizationName: data.user.organizationName,
  });
  initializeAgent();
  updateTrayMenu();
  notify('Sakspilot', `Logget inn som ${data.user.name}`);
  return data;
}

function logout() {
  // Sync gjenværende før utlogging
  if (pendingSessions.length > 0) syncSessions();

  // Stopp aktiv arbeidsøkt uten rapport (rapporter krever bruker-input,
  // ikke noe vi vil tvinge ved logout)
  if (workSessionActive) {
    workSessionActive = false;
    workSessionStart = null;
    workSessionSessions = [];
  }

  store.set({ token: null, userName: null, userEmail: null, organizationId: null });
  if (poller) { poller.stop(); poller = null; }
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

function ts() { return new Date().toTimeString().slice(0, 8); }

// ── IPC ─────────────────────────────────────────────────────────
ipcMain.handle('settings:get-all', () => store.store);
ipcMain.handle('settings:set', (_e, key, value) => { store.set(key, value); return true; });
ipcMain.handle('auth:login', async (_e, apiUrl, email, password) => {
  try {
    const data = await login(apiUrl, email, password);
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('auth:logout', () => { logout(); return true; });
ipcMain.handle('agent:status', () => {
  const pollerStatus = poller?.getStatus() || {};
  return {
    // Eksisterende navn (beholdes for bakoverkompatibilitet)
    ...pollerStatus,
    workSessionActive,
    workSessionStartedAt: workSessionStart,
    workSessionSessionCount: workSessionSessions.length,
    // Nye alias så web-widgeten kan bruke korte navn
    active: workSessionActive,
    paused: !!pollerStatus.paused,
    startedAt: workSessionStart ? new Date(workSessionStart).getTime() : null,
    sessionCount: workSessionSessions.length,
    pendingCount: pendingSessions.length,
  };
});
ipcMain.handle('agent:pending-count', () => pendingSessions.length);
ipcMain.handle('agent:start-work-session', () => { startWorkSession(); return true; });
ipcMain.handle('agent:stop-work-session', () => { stopWorkSession(); return true; });
ipcMain.handle('agent:toggle-pause', () => { togglePause(); return true; });
ipcMain.handle('agent:sync-now', async () => { await syncSessions(); return true; });

// Åpne lokal mappe i Windows Explorer
ipcMain.handle('shell:open-folder', async (_e, folderPath) => {
  if (!folderPath) return { ok: false, error: 'Ingen sti oppgitt' };
  try {
    const result = await shell.openPath(folderPath);
    if (result) return { ok: false, error: result };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Åpne URL INNE I dashboard-vinduet via BrowserView.
// Vi reserverer 44px topp-bar (renderes av React i dashboard) der det vises
// en "← Lukk Tripletex"-knapp som kaller shell:close-shortcut-view.
let activeShortcutView = null;
let activeShortcutMeta = null; // { url, label }
const TOP_BAR_HEIGHT = 44;

function closeShortcutView() {
  if (activeShortcutView && dashboardWindow && !dashboardWindow.isDestroyed()) {
    try { dashboardWindow.removeBrowserView(activeShortcutView); } catch {}
    try { activeShortcutView.webContents.destroy(); } catch {}
  }
  activeShortcutView = null;
  activeShortcutMeta = null;
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('shortcut:closed');
  }
}

ipcMain.handle('shell:open-in-window', async (_e, url, label) => {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    // Hvis dashboard ikke er åpen, fall tilbake til ekstern browser
    shell.openExternal(url);
    return { ok: true, fallback: 'external' };
  }

  // Hvis samme URL allerede er åpen → ingenting å gjøre
  if (activeShortcutMeta && activeShortcutMeta.url === url) {
    return { ok: true };
  }

  closeShortcutView();

  const view = new BrowserView({
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  dashboardWindow.setBrowserView(view);
  activeShortcutView = view;
  activeShortcutMeta = { url, label };

  const bounds = dashboardWindow.getContentBounds();
  view.setBounds({
    x: 0,
    y: TOP_BAR_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - TOP_BAR_HEIGHT),
  });
  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL(url).catch((err) => {
    console.error('[open-in-window] loadURL feilet:', err);
  });

  // Si fra til dashboard så React kan vise topp-bar med "Lukk"-knapp
  dashboardWindow.webContents.send('shortcut:opened', { url, label });
  return { ok: true };
});

ipcMain.handle('shell:close-shortcut-view', () => {
  closeShortcutView();
  return { ok: true };
});

// Oppdater tray-menyen hvert 15. sekund for å holde elapsed-tid fersk
setInterval(() => updateTrayMenu(), 15000);
