/**
 * Sakspilot Desktop Agent, Electron main-prosess.
 *
 * Kjører i bakgrunnen som tray-app. To moduser:
 *   1. "Arbeidsøkt aktiv" , du har klikket Start, vi logger aktivt vindu
 *      hvert N. sekund og knytter til sak via matching-regler
 *   2. "Inaktiv"          , vi logger ikke noe. Klikk Start for å begynne.
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
  Notification, dialog, session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ── GPU + smooth scrolling, må settes FØR app.whenReady ─────────
// Disse switchene aktiverer hardware-akselerasjon og zero-copy buffer-
// transfer, som gir merkbart smoothere scrolling i tunge sider (WP-admin,
// Gmail). Sjelden målbar load-tid-gevinst, men UX-en føles raskere.
try {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  // Smooth scrolling-flagget overstyrer browser-default på Windows
  app.commandLine.appendSwitch('enable-smooth-scrolling');
} catch {}

// ── Crash-logger, skriv ALLE krasj til fil + dialog ────────────
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
const { NotifPoller } = require('./notif-poller');

// ── Global state ────────────────────────────────────────────────
let tray = null;
let settingsWindow = null;
let poller = null;
let syncTimer = null;
let rulesRefreshTimer = null;
let reminderTimer = null;
let notifPoller = null;  // System-toast for nye forespørsler/fakturaer/etc

// ── Personlig hub (kun for Helene) ──────────────────────────────
// Tray-menyitems som peker på Helenes private dashboard-filer/URLer.
// Gated på e-post, usynlig for alle andre brukere.
const PERSONAL_USER_EMAIL = 'helene721@gmail.com';
const PERSONAL_HUB_FILE = 'C:\\Users\\helen\\Desktop\\prosjekt-oversikt.html';
const PERSONAL_HUB_URL = 'https://helene.cloud/hub/hjem-aB3xK9p2qZ.html';
let personalHubWindow = null;
let personalCloudHubWindow = null;

// Arbeidsøkt-state (kun i minnet, ny etter restart)
let workSessionActive = false;
let workSessionStart = null;
let workSessionSessions = [];   // sessions samlet i pågående arbeidsøkt
// Pause-tracking: total tid (ms) i pause i denne arbeidsøkten, og
// timestamp for når nåværende pause startet (null hvis ikke i pause).
// Brukes for å vise REELL arbeidstid i widget, ekskl. pauser.
let workSessionPausedTotalMs = 0;
let workSessionPausedAt = null;
const pendingSessions = [];     // sessions klare for sync til backend
let deviceId = null;            // stabil per installasjon

// Pomodoro-state (kun i minnet, nullstilles ved restart)
// null | { phase: 'work'|'break', startedAt: number, sessionNumber: number, timer: NodeJS.Timeout }
let pomodoroState = null;
let pomodoroCompletedCount = 0; // antall fullførte work-faser i denne sesjonen

// Settes til true når sync får 401 → notif + dashboard åpnes ÉN gang.
// Nullstilles av login-handleren når bruker har re-logget. Hindrer at
// dashboard pop-up'er hvert 30. sek mens tokenet er utløpt.
let authExpiredHandled = false;

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

  // Preconnect/DNS-prefetch til kjente snarvei-domener, bygger TCP +
  // TLS-håndtrykk på forhånd så første klikk på en snarvei sparer 200-400 ms.
  // Vi preconnecter til snarvei-partition (samme som faktiske snarveier bruker)
  // så connection-pool faktisk gjenbrukes når brukeren klikker.
  try {
    const snarveiSession = session.fromPartition('persist:sakspilot-snarvei');
    const PRECONNECT_URLS = [
      'https://outlook.office.com',
      'https://mail.google.com',
      'https://teams.microsoft.com',
      'https://app.slack.com',
      'https://calendar.google.com',
      'https://tripletex.no',
      'https://fiken.no',
      'https://holte.no',
      'https://github.com',
      'https://chat.openai.com',
      'https://claude.ai',
      'https://drive.google.com',
    ];
    for (const url of PRECONNECT_URLS) {
      try { snarveiSession.preconnect({ url, numSockets: 1 }); } catch {}
    }
  } catch {}

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

// Rydd pomodoro-timer ved app-quit så vi ikke etterlater zombie-setTimeout
app.on('before-quit', () => {
  if (pomodoroState && pomodoroState.timer) {
    try { clearTimeout(pomodoroState.timer); } catch {}
    pomodoroState = null;
  }
});

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
      // Trigg sync umiddelbart (ikke vent på timer-intervall), gjør at
      // rapport-siden alltid har ferskeste data. Hvis sync feiler legges
      // sessions tilbake og prøves igjen ved neste tick.
      syncSessions();
    });

    poller.on('error', (err) => console.error('[Poller] feil:', err.message));

    poller.start();
    poller.pause(); // start pauset - venter på "Start arbeidsøkt"

    // Hvis auto-track er på, sett aktiv-sak-fallback fra siste lagrede valg
    // og start arbeidsøkten automatisk så bruker ikke trenger gjøre noe.
    if (store.get('autoTrackOpened')) {
      if (poller.setAutoTrackEnabled) poller.setAutoTrackEnabled(true);
      poller.setActiveSakFallback(
        store.get('activeSakId'),
        store.get('activeSakTitle')
      );
      if (!workSessionActive) startWorkSession({ silent: true });
    }
  }

  scheduleSync();
  scheduleRulesRefresh();
  scheduleReminderCheck();
  refreshRules();
  // Sjekk påminnelser én gang ved oppstart så bruker får etterslepne varsler
  // umiddelbart (ikke etter første minutt).
  checkStickyReminders();
  startNotifPoller();
}

/**
 * Start NotifPoller, system-toast for nye forespørsler/fakturaer/etc.
 * Idempotent: starter ikke ny hvis det allerede kjører en.
 *
 * Kjører helt uavhengig av Poller (arbeidsøkt), varsler kommer også når
 * brukeren IKKE har startet arbeidsøkt, så lenge appen er åpen og innlogget.
 */
function startNotifPoller() {
  if (!notifPoller) {
    notifPoller = new NotifPoller({
      apiCall,
      store,
      notify,
      isLoggedIn: () => !!store.get('token'),
    });
  }
  notifPoller.start();
}

// ── Personlig hub (kun Helene), hjelpefunksjoner ───────────────

/**
 * Åpne lokal prosjekt-oversikt.html i eget BrowserWindow.
 * Loader fra desktop-stien dynamisk så Helene kan oppdatere fila uten rebuild.
 * Hvis fila ikke finnes: vis feilmelding.
 */
function openPersonalHub() {
  if (personalHubWindow && !personalHubWindow.isDestroyed()) {
    personalHubWindow.show();
    personalHubWindow.focus();
    return;
  }
  if (!fs.existsSync(PERSONAL_HUB_FILE)) {
    dialog.showErrorBox(
      'Prosjekt-oversikt mangler',
      `Fant ikke filen:\n${PERSONAL_HUB_FILE}\n\nSjekk at den ligger på skrivebordet.`
    );
    return;
  }
  personalHubWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Prosjekt-oversikt - Helene',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  personalHubWindow.loadFile(PERSONAL_HUB_FILE);
  personalHubWindow.on('closed', () => { personalHubWindow = null; });
}

/**
 * Åpne helene.cloud privat hub i eget BrowserWindow.
 * Bruker egen partition for å holde session adskilt fra snarvei-systemet.
 */
function openPersonalCloudHub() {
  if (personalCloudHubWindow && !personalCloudHubWindow.isDestroyed()) {
    personalCloudHubWindow.show();
    personalCloudHubWindow.focus();
    return;
  }
  personalCloudHubWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Helene Hub - helene.cloud',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:personal-hub',
    },
  });
  personalCloudHubWindow.loadURL(PERSONAL_HUB_URL);
  personalCloudHubWindow.on('closed', () => { personalCloudHubWindow = null; });
}

// ── Tray ────────────────────────────────────────────────────────
function createTray() {
  // macOS menubar bruker template-ikon (svart silhuett på transparent
  // bakgrunn). macOS auto-tinter det basert på lys/mørk meny-bar.
  // Filnavnet MÅ ende på "Template.png" så Electron aktiverer dette.
  // Windows/Linux bruker det vanlige fargeikonet vårt.
  const iconFile = process.platform === 'darwin'
    ? 'tray-iconTemplate.png'
    : 'tray-icon.png';
  const iconPath = path.join(__dirname, '..', 'assets', iconFile);
  if (!fs.existsSync(iconPath)) {
    console.error(`Tray-ikon mangler (${iconFile}). Kjør "npm install" eller "node scripts/generate-icon.js"`);
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

    // Auto-track toggle, synlig øverst slik at status er åpenbar
    const autoOn = !!store.get('autoTrackOpened');
    items.push({
      label: autoOn
        ? '🎯 Auto-spor PÅ (alt jeg åpner telles)'
        : '🎯 Auto-spor AV',
      type: 'checkbox',
      checked: autoOn,
      click: () => setAutoTrack(!autoOn),
    });
    if (autoOn && store.get('activeSakTitle')) {
      items.push({
        label: `   ↳ tilordnes: ${truncate(store.get('activeSakTitle'), 36)}`,
        enabled: false,
      });
    }
    items.push({ type: 'separator' });

    // Pomodoro skjult 2026-06 (pilot-fokus): desktop-agenten skal vaere ren
    // tidsregistrering, ikke en produktivitets-launcher. All pomodoro-kode,
    // funksjoner og IPC er beholdt - sett flagget til false for aa vise igjen.
    const PILOT_HIDE_POMODORO = true;
    if (!PILOT_HIDE_POMODORO) {
      // Pomodoro-timer, egen seksjon mellom auto-spor og arbeidsøkt
      if (pomodoroState) {
        const remaining = pomodoroRemainingSec();
        const phaseLabel = pomodoroState.phase === 'work'
          ? `🟢 Arbeid ${formatDur(remaining)} igjen`
          : `🟡 Pause ${formatDur(remaining)} igjen`;
        items.push({
          label: `🍅 Pomodoro #${pomodoroState.sessionNumber}: ${phaseLabel}`,
          enabled: false,
        });
        items.push({ label: '■  Stopp pomodoro', click: () => stopPomodoro() });
      } else {
        const nextNum = pomodoroCompletedCount + 1;
        items.push({
          label: pomodoroCompletedCount > 0
            ? `🍅 Start pomodoro #${nextNum} (25/5)`
            : '🍅 Start pomodoro (25/5)',
          click: () => startPomodoro(),
        });
      }
      items.push({ type: 'separator' });
    }

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

    // Personlig hub, kun synlig for Helene (gated på e-post)
    if (store.get('userEmail') === PERSONAL_USER_EMAIL) {
      items.push({ type: 'separator' });
      items.push({ label: '🔒 Personlig', enabled: false });
      items.push({
        label: '   📋 Prosjekt-oversikt (lokal)',
        click: () => openPersonalHub(),
      });
      items.push({
        label: '   ☁  Helene Hub (helene.cloud)',
        click: () => openPersonalCloudHub(),
      });
    }

    items.push({ type: 'separator' });
    items.push({
      label: '📊 Åpne dashbord',
      click: () => openDashboardWindow(),
    });
    items.push({
      label: '🌐 Åpne sakspilot.no i nettleser',
      click: () => shell.openExternal(`${getWebUrl()}/saker`),
    });
    // Personvern: ett klikk for aa slutte aa logge appen du jobber i naa.
    // Brukeren slipper aa apne innstillinger og skrive prosessnavn for hand.
    const trackedApp = poller?.lastSnapshot?.owner?.name;
    if (trackedApp) {
      items.push({
        label: `🙈 Ikke logg «${truncate(trackedApp, 26)}»`,
        click: () => excludeCurrentApp(),
      });
    }
    items.push({ type: 'separator' });
    items.push({
      label: 'Start når Windows starter',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => setOpenAtLogin(mi.checked),
    });
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

  // Tooltip viser status uten at brukeren maa aapne menyen - svar paa
  // "logges det noe akkurat na?".
  if (loggedIn && workSessionActive) {
    const cur = status?.currentSession;
    const what = cur?.sakTitle
      ? `→ ${truncate(cur.sakTitle, 30)}`
      : cur?.app
        ? truncate(cur.app, 30)
        : 'venter…';
    tray.setToolTip(poller?.paused ? 'Sakspilot - pauset' : `Sakspilot - sporer ${what}`);
  } else if (loggedIn) {
    tray.setToolTip('Sakspilot - ingen aktiv arbeidsøkt (klikk Start)');
  } else {
    tray.setToolTip('Sakspilot - ikke innlogget');
  }

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// Ekskluder appen brukeren jobber i akkurat na fra logging (personvern).
// Leser aktivt vindu fra poller, lagrer i store, og oppdaterer poller live.
function excludeCurrentApp() {
  const appName = poller?.lastSnapshot?.owner?.name;
  if (!appName) return;
  const current = store.get('excludedApps') || [];
  if (current.map((s) => String(s).toLowerCase()).includes(appName.toLowerCase())) return;
  const next = [...current, appName];
  store.set('excludedApps', next);
  if (poller) poller.setExcludedApps(next);
  updateTrayMenu();
  try {
    new Notification({
      title: 'Sakspilot',
      body: `«${appName}» logges ikke lenger. Du kan angre i Innstillinger.`,
    }).show();
  } catch { /* notif ikke kritisk */ }
}

// Start ved Windows-innlogging. openAsHidden sa appen starter rett i tray.
function setOpenAtLogin(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  } catch (e) {
    console.warn('[LoginItem] kunne ikke sette openAtLogin:', e.message);
  }
  updateTrayMenu();
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Mapper API-URL -> web-URL. Samlet ett sted (var duplisert 3 steder med
// inkonsistens: tray-varianten manglet .replace('/api','') som de andre
// hadde). Bruk denne overalt.
function getWebUrl(apiUrl) {
  const url = apiUrl || store.get('apiUrl') || 'https://api.sakspilot.no';
  if (url.includes('sakspilot.no')) return 'https://sakspilot.no';
  if (url.includes('onrender.com')) return 'https://sakspilot-web.vercel.app';
  return url.replace(/:\d+$/, ':3001').replace('/api', '');
}

function formatDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}t ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Pomodoro-timer ──────────────────────────────────────────────
// 25 min arbeid → 5 min pause → notif "Start ny?". Tellingen holdes
// kun i minnet og resettes ved app-restart.
const POMODORO_WORK_MS = 25 * 60 * 1000;
const POMODORO_BREAK_MS = 5 * 60 * 1000;

function pomodoroDurationMs(phase) {
  return phase === 'break' ? POMODORO_BREAK_MS : POMODORO_WORK_MS;
}

function pomodoroRemainingSec() {
  if (!pomodoroState) return 0;
  const total = pomodoroDurationMs(pomodoroState.phase);
  const elapsed = Date.now() - pomodoroState.startedAt;
  return Math.max(0, Math.round((total - elapsed) / 1000));
}

function pomodoroNotify(title, body) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, urgency: 'normal' }).show();
  } catch (err) {
    console.warn('[Pomodoro] notif feilet:', err.message);
  }
}

function startPomodoro() {
  // Hvis en pomodoro allerede kjører, ikke start på nytt, bare rapporter.
  if (pomodoroState) return false;
  const sessionNumber = pomodoroCompletedCount + 1;
  pomodoroState = {
    phase: 'work',
    startedAt: Date.now(),
    sessionNumber,
    timer: setTimeout(onPomodoroPhaseEnd, POMODORO_WORK_MS),
  };
  pomodoroNotify('Sakspilot - pomodoro startet', `🍅 #${sessionNumber}: 25 min fokustid begynner nå`);
  updateTrayMenu();
  return true;
}

function stopPomodoro() {
  if (!pomodoroState) return false;
  try { clearTimeout(pomodoroState.timer); } catch {}
  pomodoroState = null;
  updateTrayMenu();
  return true;
}

function onPomodoroPhaseEnd() {
  if (!pomodoroState) return;
  const { phase, sessionNumber } = pomodoroState;
  try { clearTimeout(pomodoroState.timer); } catch {}

  if (phase === 'work') {
    // Work-fase ferdig → start break
    pomodoroCompletedCount = sessionNumber;
    pomodoroState = {
      phase: 'break',
      startedAt: Date.now(),
      sessionNumber,
      timer: setTimeout(onPomodoroPhaseEnd, POMODORO_BREAK_MS),
    };
    pomodoroNotify(
      'Sakspilot - pomodoro',
      `🍅 Pomodoro #${sessionNumber} ferdig - ta 5 min pause`
    );
  } else {
    // Break-fase ferdig → tilbake til idle, varsle bruker
    pomodoroState = null;
    pomodoroNotify(
      'Sakspilot - pomodoro',
      `✅ Pause ferdig - start ny pomodoro #${sessionNumber + 1} når du er klar`
    );
  }
  updateTrayMenu();
}

// ── Arbeidsøkt-håndtering ───────────────────────────────────────
function startWorkSession(opts = {}) {
  if (!poller) return;
  workSessionActive = true;
  workSessionStart = Date.now();
  workSessionSessions = [];
  workSessionPausedTotalMs = 0;
  workSessionPausedAt = null;
  poller.resume();
  updateTrayMenu();
  if (!opts.silent) {
    notify(
      'Sakspilot',
      store.get('autoTrackOpened')
        ? 'Auto-spor PÅ - alt du åpner via Sakspilot telles automatisk'
        : 'Arbeidsøkt startet - logging aktiv'
    );
  }
  // Hent friske regler ved start
  refreshRules();
}

// ── Auto-track ──────────────────────────────────────────────────
// Når på: alt som åpnes via Sakspilot (snarveier, .exe, mapper, eksterne
// URL-er) starter automatisk en arbeidsøkt hvis ingen er aktiv, og
// attribueres til "aktiv sak" hvis bruker har en åpen sak-side.
function ensureWorkSessionForOpen() {
  if (!poller) return;
  if (!store.get('autoTrackOpened')) return; // bruker har skrudd av - gjør ingenting
  if (!workSessionActive) {
    startWorkSession({ silent: true });
  } else if (poller.paused) {
    poller.resume();
    updateTrayMenu();
  }
}

function setAutoTrack(enabled) {
  store.set('autoTrackOpened', !!enabled);
  if (poller) {
    // Sett auto-track-modus separat fra active-sak. Dette gjor at sesjoner
    // teller som fakturerbare nar auto-track er paa, selv om brukeren ikke
    // har valgt en aktiv sak enda - rapporten kategoriserer dem som
    // "Ukategorisert" istedenfor "ikke-fakturerbart".
    if (poller.setAutoTrackEnabled) poller.setAutoTrackEnabled(!!enabled);
    if (enabled) {
      poller.setActiveSakFallback(
        store.get('activeSakId'),
        store.get('activeSakTitle')
      );
      if (!workSessionActive) startWorkSession({ silent: false });
    } else {
      poller.setActiveSakFallback(null, null);
    }
  }
  updateTrayMenu();
}

function setActiveSak(sakId, sakTitle) {
  store.set('activeSakId', sakId || null);
  store.set('activeSakTitle', sakTitle || null);
  if (poller && store.get('autoTrackOpened')) {
    poller.setActiveSakFallback(sakId || null, sakTitle || null);
  }
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
    // Fortsetter, legg til varigheten av forrige pause til totalen
    if (workSessionPausedAt) {
      workSessionPausedTotalMs += Date.now() - workSessionPausedAt;
      workSessionPausedAt = null;
    }
    poller.resume();
    notify('Sakspilot', 'Logging er på igjen');
  } else {
    // Pauser, registrer når pausen startet
    workSessionPausedAt = Date.now();
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
    // Legg dem tilbake, neste sync-tick prøver igjen
    pendingSessions.unshift(...batch);

    // 401 = utløpt JWT, bruker må logge inn på nytt. Åpne dashbordet
    // ÉN gang og vis tydelig notification. authExpiredHandled-flagget
    // resettes ved neste vellykkede login (i auth:login-IPC under).
    const is401 = /\b401\b/.test(err.message) || /Ikke innlogget/i.test(err.message);
    if (is401) {
      if (!authExpiredHandled) {
        authExpiredHandled = true; // ikke gjenta før neste login
        if (Notification.isSupported()) {
          new Notification({
            title: 'Sakspilot - logg inn på nytt',
            body: 'Sesjonen din har utløpt. Logg inn i Sakspilot-vinduet så fortsetter alt automatisk.',
            urgency: 'critical',
          }).show();
        }
        // Åpne dashboard så bruker kan logge inn igjen
        try { openDashboardWindow(); } catch {}
      }
      // Stopper sync-loopen midlertidig, vi prøver ikke igjen før bruker
      // har re-logget. Dette unngår at agenten kontinuerlig fyrer 401
      // i bakgrunnen og holder dashboard på topp.
      updateTrayMenu();
      return;
    }

    // Andre feil (nettverk osv), vis advarsel max én per time
    const lastNotif = store.get('lastSyncErrorNotif') || 0;
    if (Notification.isSupported() && Date.now() - lastNotif > 3600_000) {
      const apiUrl = store.get('apiUrl') || 'https://api.sakspilot.no';
      const isLocalhost = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');
      new Notification({
        title: 'Sakspilot - sync feilet',
        body: isLocalhost
          ? `Kan ikke nå API på ${apiUrl}. Endre i Innstillinger → API URL til https://api.sakspilot.no`
          : `Kan ikke nå ${apiUrl}: ${err.message}. Sessions beholdes - prøver igjen om 30 sek.`,
        urgency: 'normal',
      }).show();
      store.set('lastSyncErrorNotif', Date.now());
    }
  }
  updateTrayMenu();
}

function scheduleSync() {
  if (syncTimer) clearInterval(syncTimer);
  // Sync hvert 30. sek, alle endringer trender naturlig mot å være synket
  // innen et halvt minutt. Lavere tall ville hamre på API-en når ingenting
  // er nytt; sync-funksjonen er allerede no-op ved tom kø.
  syncTimer = setInterval(syncSessions, 30 * 1000);
}

function scheduleRulesRefresh() {
  if (rulesRefreshTimer) clearInterval(rulesRefreshTimer);
  rulesRefreshTimer = setInterval(refreshRules, 10 * 60 * 1000);
}

// ── Klistrelapp-påminnelser ─────────────────────────────────────
// Hvert minutt: spør backend om klistrelapper med remindAt <= now som
// ennå ikke er varslet (notifiedAt = null). For hver: vis native
// OS-notification og POST mark-notified så samme varsel ikke kommer igjen.
//
// Web-appen poller samme endpoint parallelt, backend er kilden til sannhet
// (notifiedAt settes atomisk via mark-notified), så worst case er at samme
// påminnelse vises BÅDE som OS-notif OG in-app toast hvis bruker har begge
// åpne samtidig. Det er greit, bedre å varsle dobbelt enn å glemme.
function scheduleReminderCheck() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkStickyReminders, 60 * 1000);
}

async function checkStickyReminders() {
  if (!store.get('token')) return;
  let due;
  try {
    const res = await apiCall('/stickies/due-reminders');
    due = res.notes || [];
  } catch (err) {
    // Stille feil, prøver igjen om 60 sek
    console.warn('[Reminders] kunne ikke hente:', err.message);
    return;
  }
  if (due.length === 0) return;

  for (const note of due) {
    showReminderNotification(note);
    // Marker som varslet, uavhengig av om native-notif faktisk vises (kan
    // feile på Linux uten libnotify, men da har dashbordet-toast tatt over)
    try {
      await apiCall(`/stickies/${note.id}/mark-notified`, { method: 'POST' });
    } catch (err) {
      console.warn(`[Reminders] mark-notified feilet for ${note.id}:`, err.message);
    }
  }
}

function showReminderNotification(note) {
  if (!Notification.isSupported()) return;
  try {
    const body = note.content
      ? truncate(note.content, 200)
      : '(tom klistrelapp)';
    const n = new Notification({
      title: 'Sakspilot - påminnelse',
      body,
      urgency: 'normal',
    });
    // Klikk på native-notif → åpne dashbord på klistrelapp-siden
    n.on('click', () => {
      try {
        openDashboardWindow();
      } catch {}
    });
    n.show();
  } catch (err) {
    console.warn('[Reminders] notif feilet:', err.message);
  }
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

/**
 * Daily auto-reload, sikrer at brukeren får siste web-build uten å måtte
 * trykke Ctrl+R selv. Triggrer reload + cache-clear ved første åpning av
 * dashbordet hver kalenderdag (lokal tid).
 *
 * Logikk: lagre siste reload-dato i electron-store. Ved openDashboardWindow()
 * sammenlign med dagens dato, hvis forskjellig, reload etter at vinduet er
 * vist. Mid-day work avbrytes ikke (samme dato = ingen reload).
 */
function maybeDailyReload() {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const lastReloadDate = store.get('lastDashboardReloadDate');
    if (lastReloadDate === today) return false; // allerede gjort i dag

    store.set('lastDashboardReloadDate', today);
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return false;

    console.log(`[Dashbord] Daglig auto-reload (forrige: ${lastReloadDate || 'aldri'})`);
    Promise.all([
      dashboardWindow.webContents.session.clearCache(),
      dashboardWindow.webContents.session.clearStorageData({
        storages: ['serviceworkers', 'cachestorage'],
      }),
    ])
      .catch(() => {})
      .finally(() => {
        if (!dashboardWindow.isDestroyed()) dashboardWindow.reload();
      });
    return true;
  } catch (err) {
    console.warn('[Dashbord] Daily reload feilet:', err);
    return false;
  }
}

function openDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.show();
    dashboardWindow.focus();
    maybeDailyReload();
    return;
  }

  const webUrl = getWebUrl();

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Sakspilot - Dashbord',
    autoHideMenuBar: false,
    backgroundColor: '#1E3A5F', // unngå hvit-blink før innhold laster
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Preload eksponerer window.sakspilot.isDesktop, openInWindow, openFolder,
      // getStatus osv., uten dette tror dashboardet det er i nettleser, og
      // mappe-snarveier + tidsregistrerings-widget + Launcher-shortcuts feiler.
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // Tøm KUN service-worker- og cachestorage (chunk-hash-bug fra Vercel),
  // ikke HTTP-cache. Tidligere clearet vi alt → snarveier i samme session
  // mistet også sin cache → tregere reload. Nå har snarveier egen partition
  // ('persist:sakspilot-snarvei'), så de er upåvirket uansett, men vi
  // beholder HTTP-cachen på dashboardet også for raskere kald-start.
  dashboardWindow.webContents.session
    .clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    .catch(() => {});

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

  // Floating widget, opprett etter at vinduet finnes så bounds er klare
  setTimeout(() => ensureWidgetView(), 800);

  // Hold widget riktig posisjonert + på topp når dashbordet endrer størrelse.
  // Vi lytter på FLERE events fordi maximize/restore/full-screen ikke alltid
  // trigger 'resize' før etter at bounds er ferdig oppdatert.
  for (const ev of [
    'resize', 'move', 'show', 'restore', 'maximize', 'unmaximize',
    'enter-full-screen', 'leave-full-screen', 'focus',
  ]) {
    try { dashboardWindow.on(ev, () => positionWidgetView()); } catch {}
  }

  // 'did-fail-load' fanger ERR_CONNECTION_REFUSED osv. som .catch() ikke gjør
  dashboardWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    // Hopp over hvis det er splash/error-pagen vår som "feilet" (data: URLs)
    if (!validatedURL || validatedURL.startsWith('data:')) return;
    console.error(`[Dashbord] Kunne ikke laste ${validatedURL}: ${errorCode} ${errorDescription}`);
    loadErrorPage(errorCode, errorDescription, validatedURL);
  });

  dashboardWindow.on('closed', () => {
    if (dashboardLoadTimer) { clearTimeout(dashboardLoadTimer); dashboardLoadTimer = null; }
    destroyWidgetView();
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
    // Marker dagens dato som "reloaded" så maybeDailyReload ikke trigger
    // igjen samme dag (initial load HAR allerede hentet ferskt innhold).
    try {
      const today = new Date().toISOString().slice(0, 10);
      store.set('lastDashboardReloadDate', today);
    } catch {}
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
  // Timeout etter 15 sek, så vi ikke henger evig hvis API er nede
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Tidsavbrudd: API svarte ikke innen 15 sek. Sjekk nettverket eller om ${apiUrl} er riktig.`);
    }
    throw new Error(`Nettverksfeil: ${err.message}. Sjekk nettverket eller om ${apiUrl} er riktig.`);
  }
  clearTimeout(timeoutId);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`API svarte med ugyldig data (${res.status}). Sjekk om ${apiUrl} faktisk er Sakspilot-API.`);
  }
  if (!res.ok) throw new Error(data.error || `Innlogging feilet (${res.status})`);
  if (!data.user) throw new Error('API returnerte ingen brukerdata.');

  store.set({
    apiUrl,
    token: data.token,
    userName: data.user.name,
    userEmail: data.user.email,
    organizationId: data.user.organizationId,
    organizationName: data.user.organizationName || '',
  });
  // Nullstill 401-debounce, ny token er gyldig, sync skal prøve igjen
  authExpiredHandled = false;
  initializeAgent();
  updateTrayMenu();
  notify('Sakspilot', `Logget inn som ${data.user.name}`);
  // Trigg sync umiddelbart så etterslepne sessions kommer inn med en gang
  setTimeout(() => syncSessions(), 1000);
  // Lukk settings-vindu + åpne dashboard automatisk så bruker ikke må
  // klikke gjennom tray-menyen manuelt
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  setTimeout(() => openDashboardWindow(), 500);
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
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
  if (notifPoller) { notifPoller.stop(); notifPoller.reset(); }
  updateTrayMenu();
  notify('Sakspilot', 'Logget ut');
}

/**
 * Vis en native OS-notifikasjon (Windows Action Center / macOS Notification
 * Center / Linux libnotify).
 *
 * Signatur er bakoverkompatibel:
 *   notify('Tittel', 'Body')                 , gammel callsite, ingen klikk-action
 *   notify({ title, body })                  , objekt-form
 *   notify({ title, body, areaPath: '/foresporsler' })
 *                                            , klikk åpner dashbordet + navigerer
 *                                               til /foresporsler
 *
 * silent: true unngår "ding" på Windows for de fleste varsler, vi bruker
 * lyd kun ved nye leads (forespørsler).
 */
function notify(arg1, arg2) {
  if (!Notification.isSupported()) return;

  const opts = typeof arg1 === 'string'
    ? { title: arg1, body: arg2 || '', silent: true }
    : { title: arg1.title, body: arg1.body || '', silent: arg1.silent !== false };

  const n = new Notification({ title: opts.title, body: opts.body, silent: opts.silent });

  // Klikk-handler: åpne dashbordet + naviger hvis areaPath er gitt
  if (typeof arg1 === 'object' && arg1.areaPath) {
    n.on('click', () => {
      try {
        navigateDashboardTo(arg1.areaPath);
      } catch (err) {
        console.warn('[notify] click-handler feilet:', err.message);
      }
    });
  }

  n.show();
}

/**
 * Åpne dashbordet (lager nytt vindu hvis ingen finnes) og naviger til path.
 * Brukes av notification-click-handler.
 */
function navigateDashboardTo(targetPath) {
  // Bygg full URL ut fra samme logikk som openDashboardWindow bruker
  const webUrl = getWebUrl();
  const fullUrl = `${webUrl}${targetPath}`;

  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    // Åpne dashbordet (det laster til sakspilot.no, så naviger etter load)
    openDashboardWindow();
    if (dashboardWindow) {
      dashboardWindow.webContents.once('did-finish-load', () => {
        try { dashboardWindow.loadURL(fullUrl); } catch {}
      });
    }
    return;
  }

  // Vindu finnes, vis det, fokuser, naviger
  dashboardWindow.show();
  dashboardWindow.focus();
  try { dashboardWindow.loadURL(fullUrl); } catch {}
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
    // Pause-tracking, widget bruker disse til å beregne REELL arbeidstid
    // (ekskl. pauser). pausedTotalMs = sum av tidligere fullførte pauser.
    // pausedAt = timestamp for nåværende pause hvis paused, ellers null.
    pausedTotalMs: workSessionPausedTotalMs,
    pausedAt: workSessionPausedAt,
    sessionCount: workSessionSessions.length,
    pendingCount: pendingSessions.length,
    // Auto-track-state for web-widgeten
    autoTrackOpened: !!store.get('autoTrackOpened'),
    activeSakId: store.get('activeSakId') || null,
    activeSakTitle: store.get('activeSakTitle') || null,
  };
});
ipcMain.handle('agent:pending-count', () => pendingSessions.length);
ipcMain.handle('agent:start-work-session', () => { startWorkSession(); return true; });
ipcMain.handle('agent:stop-work-session', () => { stopWorkSession(); return true; });
ipcMain.handle('agent:toggle-pause', () => { togglePause(); return true; });
ipcMain.handle('agent:sync-now', async () => { await syncSessions(); return true; });

// Pomodoro-kontroll (kan brukes fra widget.html eller dashboard senere)
ipcMain.handle('pomodoro:start', () => ({ ok: startPomodoro() }));
ipcMain.handle('pomodoro:stop', () => ({ ok: stopPomodoro() }));
ipcMain.handle('pomodoro:status', () => {
  if (!pomodoroState) {
    return { active: false, completedCount: pomodoroCompletedCount };
  }
  return {
    active: true,
    phase: pomodoroState.phase,
    sessionNumber: pomodoroState.sessionNumber,
    startedAt: pomodoroState.startedAt,
    remainingSec: pomodoroRemainingSec(),
    completedCount: pomodoroCompletedCount,
  };
});

// Auto-track-toggle (én bryter for "track everything I open via Sakspilot")
ipcMain.handle('agent:set-auto-track', (_e, enabled) => {
  setAutoTrack(!!enabled);
  return { ok: true, enabled: !!enabled };
});

// Aktiv sak, kalles fra web når bruker navigerer til /saker/[id]
// så auto-track vet hvilken sak å attribuere til.
ipcMain.handle('agent:set-active-sak', (_e, sakId, sakTitle) => {
  setActiveSak(sakId, sakTitle);
  return { ok: true };
});

// Velg en lokal .exe-fil (eller annen kjørbar). Brukes fra Launcher når
// brukeren vil legge til snarvei til et lokalt Windows-program.
ipcMain.handle('shell:pick-exe', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Velg program (.exe)',
    properties: ['openFile'],
    filters: [
      { name: 'Kjørbare filer', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
      { name: 'Alle filer', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  const filePath = result.filePaths[0];
  // Utled et fornuftig label fra filnavnet (uten ext)
  const path = require('path');
  const base = path.basename(filePath, path.extname(filePath));
  return { ok: true, filePath, suggestedLabel: base };
});

// Åpne en lokal fil/.exe i Windows. shell.openPath håndterer både filer
// og kataloger og kjører riktig program for filtypen.
ipcMain.handle('shell:open-local', async (_e, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'Ingen sti oppgitt' };
  }
  try {
    const result = await shell.openPath(filePath);
    if (result) {
      // openPath returnerer feilmelding-string hvis den feilet
      return { ok: false, error: result };
    }
    // Auto-track: marker som åpnet via Sakspilot
    ensureWorkSessionForOpen();
    if (poller && store.get('autoTrackOpened')) {
      const path = require('path');
      poller.logOpenedExternal({
        app: path.basename(filePath),
        title: filePath,
        sakId: store.get('activeSakId'),
        sakTitle: store.get('activeSakTitle'),
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Åpne ekstern URL i default-nettleser. Brukes f.eks. fra settings.html
// "Opprett konto"-lenken som skal åpne sakspilot.no/registrer i Chrome/Edge
// (ikke i Sakspilot-vinduet).
ipcMain.handle('shell:open-external', async (_e, url) => {
  if (!url || typeof url !== 'string') return { ok: false, error: 'Ugyldig URL' };
  // Safety: kun http(s)
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Kun http(s)-URLer tillatt' };
  try {
    await shell.openExternal(url);
    // Auto-track: marker som åpnet via Sakspilot
    ensureWorkSessionForOpen();
    if (poller && store.get('autoTrackOpened')) {
      poller.logOpenedExternal({
        app: 'ekstern-lenke',
        title: url,
        sakId: store.get('activeSakId'),
        sakTitle: store.get('activeSakTitle'),
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Åpne lokal mappe i Windows Explorer
ipcMain.handle('shell:open-folder', async (_e, folderPath) => {
  if (!folderPath) return { ok: false, error: 'Ingen sti oppgitt' };
  try {
    const result = await shell.openPath(folderPath);
    if (result) return { ok: false, error: result };
    // Auto-track: marker som åpnet via Sakspilot
    ensureWorkSessionForOpen();
    if (poller && store.get('autoTrackOpened')) {
      poller.logOpenedExternal({
        app: 'explorer',
        title: folderPath,
        sakId: store.get('activeSakId'),
        sakTitle: store.get('activeSakTitle'),
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─────────────────────────────────────────────────────────────────
// Multi-tab shortcut-system
// ─────────────────────────────────────────────────────────────────
// Hver åpnet snarvei (Gmail, Railway, osv) lever som en egen BrowserView.
// Bare ÉN er synlig av gangen ("active"), men alle holdes i live så
// brukeren kan switche mellom dem uten å miste sesjon/state.
//
// Datastruktur:
//   openShortcuts: Map<url, { view, label, resizeHandler }>
//   activeShortcutUrl: string | null
//
// React får komplett liste via 'shortcut:state'-events.
//
// Offsetter må matche sakspilot.no sin layout (DesktopShortcutOverlay.tsx
// har samme konstanter, hold synkronisert!)
const SAKSPILOT_HEADER_HEIGHT = 72;
const SIDEBAR_WIDTH = 220;
const LAUNCHER_WIDTH = 60;
const TAB_BAR_HEIGHT = 36;

const openShortcuts = new Map(); // url → { view, label, resizeHandler }
let activeShortcutUrl = null;

function getShortcutBounds(win) {
  const bounds = win.getContentBounds();
  const xOffset = SIDEBAR_WIDTH + LAUNCHER_WIDTH;
  const yOffset = SAKSPILOT_HEADER_HEIGHT + TAB_BAR_HEIGHT;
  return {
    x: xOffset,
    y: yOffset,
    width: Math.max(0, bounds.width - xOffset),
    height: Math.max(0, bounds.height - yOffset),
  };
}

function broadcastShortcutState() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  const tabs = Array.from(openShortcuts.entries()).map(([url, meta]) => ({
    url,
    label: meta.label,
    loading: !!meta.loading,
  }));
  dashboardWindow.webContents.send('shortcut:state', {
    tabs,
    activeUrl: activeShortcutUrl,
  });
}

function setActiveShortcut(url) {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  const entry = openShortcuts.get(url);
  if (!entry) return;

  // Fjern alle andre views fra topplaget, bare den aktive vises
  for (const [u, m] of openShortcuts.entries()) {
    if (u !== url) {
      try { dashboardWindow.removeBrowserView(m.view); } catch {}
    }
  }
  // Sett aktiv view
  try { dashboardWindow.setBrowserView(entry.view); } catch {}
  entry.view.setBounds(getShortcutBounds(dashboardWindow));
  activeShortcutUrl = url;
  broadcastShortcutState();
  // Sørg for at widget-overlayet ligger ØVERST etter snarvei-bytte
  raiseWidgetOnTop();
}

function destroyShortcut(url) {
  const entry = openShortcuts.get(url);
  if (!entry) return;
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    try { dashboardWindow.removeBrowserView(entry.view); } catch {}
    try { dashboardWindow.removeListener('resize', entry.resizeHandler); } catch {}
  }
  try { entry.view.webContents.destroy(); } catch {}
  openShortcuts.delete(url);

  // Hvis vi lukket aktiv tab → switch til neste tilgjengelige (eller null)
  if (activeShortcutUrl === url) {
    const remaining = Array.from(openShortcuts.keys());
    if (remaining.length > 0) {
      setActiveShortcut(remaining[remaining.length - 1]);
    } else {
      activeShortcutUrl = null;
      broadcastShortcutState();
    }
  } else {
    broadcastShortcutState();
  }
}

function closeAllShortcuts() {
  const urls = Array.from(openShortcuts.keys());
  for (const url of urls) {
    destroyShortcut(url);
  }
  raiseWidgetOnTop();
}

// ─────────────────────────────────────────────────────────────────
// Floating widget, alltid-på-topp tidsregistrerings-kontroller
// ─────────────────────────────────────────────────────────────────
// React-widgeten i sakspilot.no lever i hoved-DOM-en og dekkes av
// snarvei-BrowserViews. Dette er en EGEN BrowserView som vi alltid
// re-legger øverst etter at andre views er manipulert. Lader en liten
// statisk widget.html som snakker med main via `sakspilotWidget.invoke`.

let widgetView = null;
let widgetIsExpanded = false;
const WIDGET_ICON_SIZE = 60;          // 44px knapp + margin
const WIDGET_PANEL_W = 290;           // bredde på utvidet panel
const WIDGET_PANEL_H = 260;           // høyde på utvidet panel
const WIDGET_MARGIN = 8;

function ensureWidgetView() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  if (widgetView && !widgetView.webContents.isDestroyed()) {
    raiseWidgetOnTop();
    positionWidgetView();
    return;
  }
  widgetView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // transparent: vi tegner kun knappen/panelet, resten skal være see-through
      backgroundThrottling: false,
    },
  });
  try { widgetView.setBackgroundColor('#00000000'); } catch {}
  widgetView.webContents.loadFile(path.join(__dirname, 'renderer', 'widget.html'))
    .catch((err) => console.error('[widget] kunne ikke laste widget.html:', err));
  positionWidgetView();
  raiseWidgetOnTop();
}

function positionWidgetView() {
  if (!widgetView || widgetView.webContents.isDestroyed()) return;
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  // Bruk getBounds (klient-koordinater w/h er stabile selv under minimize)
  const b = dashboardWindow.getContentBounds();
  // Hvis vinduet er minimisert eller har null/ulovlig størrelse, IKKE flytt
  // widgeten, la den ligge der den var. Tidligere fikk vi x=0, y=0 →
  // klokken hoppet til oppe-til-venstre når dashboard ble minimisert.
  if (!b || b.width < 200 || b.height < 200) return;
  const w = widgetIsExpanded ? WIDGET_PANEL_W : WIDGET_ICON_SIZE;
  const h = widgetIsExpanded ? WIDGET_PANEL_H : WIDGET_ICON_SIZE;
  // Hvis vinduet er for smalt for widget + margin, fall tilbake til hjørne
  // uten å hoppe til (0,0)
  const x = Math.max(WIDGET_MARGIN, b.width - w - WIDGET_MARGIN);
  const y = Math.max(WIDGET_MARGIN, b.height - h - WIDGET_MARGIN);
  try {
    widgetView.setBounds({ x, y, width: w, height: h });
  } catch {}
}

function raiseWidgetOnTop() {
  if (!widgetView || widgetView.webContents.isDestroyed()) return;
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  // Re-add view → flytter den til topp av z-stacken
  try { dashboardWindow.removeBrowserView(widgetView); } catch {}
  try { dashboardWindow.addBrowserView(widgetView); } catch {}
  positionWidgetView();
}

function destroyWidgetView() {
  if (!widgetView) return;
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.removeBrowserView(widgetView);
    }
  } catch {}
  try { widgetView.webContents.destroy(); } catch {}
  widgetView = null;
}

ipcMain.handle('widget:resize', (_e, expanded) => {
  widgetIsExpanded = !!expanded;
  positionWidgetView();
  return { ok: true };
});

ipcMain.handle('shell:open-in-window', async (_e, url, label) => {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    shell.openExternal(url);
    ensureWorkSessionForOpen();
    if (poller && store.get('autoTrackOpened')) {
      poller.logOpenedExternal({
        app: 'sakspilot-snarvei',
        title: label ? `${label} (${url})` : url,
        sakId: store.get('activeSakId'),
        sakTitle: store.get('activeSakTitle'),
      });
    }
    return { ok: true, fallback: 'external' };
  }

  // Hvis allerede åpen → bare switch til den
  if (openShortcuts.has(url)) {
    setActiveShortcut(url);
    ensureWorkSessionForOpen();
    return { ok: true, alreadyOpen: true };
  }

  // Ny snarvei åpnes, auto-track logger den
  ensureWorkSessionForOpen();
  if (poller && store.get('autoTrackOpened')) {
    poller.logOpenedExternal({
      app: 'sakspilot-snarvei',
      title: label ? `${label} (${url})` : url,
      sakId: store.get('activeSakId'),
      sakTitle: store.get('activeSakTitle'),
    });
  }

  // Opprett ny BrowserView med EGEN persistent session.
  // Tidligere delte snarveier session med dashbordet, så hver gang vi
  // tømte dashboard-cachen (clearStorageData ved oppstart for å unngå
  // chunk-hash-bug) ble OGSÅ Gmail/WP-admin/osv sin cache nullstilt →
  // tregere lasting hver gang. Egen partition gir snarveier varig cache.
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:sakspilot-snarvei',
      // Lar Chromium throttle bakgrunn-faner (sparer CPU/batteri når
      // brukeren ser på en annen snarvei)
      backgroundThrottling: true,
    },
  });

  const resizeHandler = () => {
    if (
      dashboardWindow &&
      !dashboardWindow.isDestroyed() &&
      activeShortcutUrl === url &&
      !view.webContents.isDestroyed()
    ) {
      view.setBounds(getShortcutBounds(dashboardWindow));
    }
  };
  dashboardWindow.on('resize', resizeHandler);

  openShortcuts.set(url, { view, label, resizeHandler, loading: true });

  // Loading-state, tab-pillen får spinner mens siden laster
  view.webContents.on('did-start-loading', () => {
    const m = openShortcuts.get(url);
    if (m) { m.loading = true; broadcastShortcutState(); }
  });
  view.webContents.on('did-stop-loading', () => {
    const m = openShortcuts.get(url);
    if (m) { m.loading = false; broadcastShortcutState(); }
  });

  // ── Auto-badge fra fanetittel ─────────────────────────────────
  // Mange tjenester legger antall uleste i tittelen, vi plukker det
  // ut og sender til renderer. Vi godtar BARE to mønstre for å unngå
  // falsk-positive (som "GitHub (3 stars) - Repo"):
  //
  //   A. Tittel starter med "(N) ...", Slack, Discord, Outlook, FB
  //   B. "Inbox (N) - ..." eller "Mail (N) | ...", Gmail, Outlook web
  //      (tall i parentes etterfulgt av separator: " -", " |", "·")
  //
  // GitHub Notifications bruker mønster A: "(3) Notifications", så det
  // funker. "GitHub (3 stars)" matcher IKKE A (starter ikke med parentes)
  // og IKKE B (ingen separator etter parentesen). Vi vinner.
  //
  // Hvis tjenesten ikke matcher noen av disse, sender vi count=0 så
  // gammel badge nullstilles. Manuell høyreklikk-badge overlever.
  const TITLE_PREFIX_RE = /^\((\d+)\)\s/;            // (3) ...
  const TITLE_INFIX_RE  = /\((\d+)\)\s*[-|·-]/;      // ... (3) - ...
  view.webContents.on('page-title-updated', (_event, title) => {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
    let count = 0;
    const m1 = title.match(TITLE_PREFIX_RE);
    if (m1) {
      count = parseInt(m1[1], 10);
    } else {
      const m2 = title.match(TITLE_INFIX_RE);
      if (m2) count = parseInt(m2[1], 10);
    }
    dashboardWindow.webContents.send('shortcut:auto-badge', {
      url,
      count: Number.isFinite(count) && count > 0 ? count : 0,
    });
  });

  setActiveShortcut(url);

  view.webContents.loadURL(url).catch((err) => {
    console.error('[open-in-window] loadURL feilet:', err);
    const m = openShortcuts.get(url);
    if (m) { m.loading = false; broadcastShortcutState(); }
  });

  return { ok: true };
});

ipcMain.handle('shell:switch-shortcut', (_e, url) => {
  if (!openShortcuts.has(url)) return { ok: false, error: 'Ikke åpen' };
  setActiveShortcut(url);
  return { ok: true };
});

ipcMain.handle('shell:close-shortcut-view', (_e, url) => {
  // Hvis url ikke gitt = behold gammel adferd (lukk alle = tilbake til Sakspilot)
  if (!url) {
    closeAllShortcuts();
    return { ok: true };
  }
  destroyShortcut(url);
  return { ok: true };
});

ipcMain.handle('shell:get-shortcut-state', () => {
  const tabs = Array.from(openShortcuts.entries()).map(([url, meta]) => ({
    url,
    label: meta.label,
    loading: !!meta.loading,
  }));
  return { tabs, activeUrl: activeShortcutUrl };
});

// Oppdater tray-menyen hvert 5. sekund for å holde elapsed-tid + pomodoro-
// nedtelling fersk (kortere intervall siden pomodoroen viser m:ss-igjen)
setInterval(() => updateTrayMenu(), 5000);
