/**
 * Konfig-lagring for Sakspilot desktop-agent.
 *
 * Bruker electron-store som lagrer kryptert JSON i:
 *   Windows: %APPDATA%\sakspilot\config.json
 *   macOS:   ~/Library/Application Support/sakspilot/config.json
 *
 * Innhold:
 *   apiUrl          , backend-URL (default: http://localhost:8001)
 *   token           , JWT for innlogget bruker
 *   userName        , vises i tray-menyen
 *   userEmail
 *   organizationId
 *   intervalSec     , poll-frekvens (default 15)
 *   paused          , om logging er midlertidig av
 *   excludedApps    , array av app-navn som aldri logges (privacy)
 *   lastSyncAt      , siste vellykket sync til backend
 */
const Store = require('electron-store');

const store = new Store({
  defaults: {
    apiUrl: 'https://api.sakspilot.no',  // prod (via Render). For lokal dev: endre til http://localhost:8001
    token: null,
    userName: null,
    userEmail: null,
    organizationId: null,
    intervalSec: 15,
    paused: false,
    excludedApps: [],
    lastSyncAt: null,
    // Auto-track: ÉN bryter som sier "alt jeg åpner i/gjennom Sakspilot
    // skal automatisk telle som arbeidstid". Når på:
    //   1. Arbeidsøkt starter automatisk når noe åpnes (eller appen åpnes)
    //   2. Alle BrowserView-snarveier, eksterne lenker, lokale .exe og
    //      mapper som åpnes via Sakspilot starter umiddelbart en session
    //   3. Sessions attribueres til "aktiv sak" (sist sett /saker/[id])
    //      hvis tilgjengelig, ellers sakId=null (kan tilordnes senere)
    autoTrackOpened: false,
    // Aktiv sak, settes fra web-appen via IPC når bruker navigerer til
    // /saker/[id]. Brukes som default-attribusjon for auto-tracked sessions.
    activeSakId: null,
    activeSakTitle: null,
  },
  // Filnavn i appdata-katalogen
  name: 'config',
});

module.exports = store;
