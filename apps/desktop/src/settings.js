/**
 * Konfig-lagring for Sakspilot desktop-agent.
 *
 * Bruker electron-store som lagrer kryptert JSON i:
 *   Windows: %APPDATA%\sakspilot\config.json
 *   macOS:   ~/Library/Application Support/sakspilot/config.json
 *
 * Innhold:
 *   apiUrl           — backend-URL (default: http://localhost:8001)
 *   token            — JWT for innlogget bruker
 *   userName         — vises i tray-menyen
 *   userEmail
 *   organizationId
 *   intervalSec      — poll-frekvens (default 15)
 *   paused           — om logging er midlertidig av
 *   excludedApps     — array av app-navn som aldri logges (privacy)
 *   lastSyncAt       — siste vellykket sync til backend
 */
const Store = require('electron-store');

const store = new Store({
  defaults: {
    apiUrl: 'https://sakspilot.onrender.com',  // prod (Render). For lokal dev: endre til http://localhost:8001
    token: null,
    userName: null,
    userEmail: null,
    organizationId: null,
    intervalSec: 15,
    paused: false,
    excludedApps: [],
    lastSyncAt: null,
  },
  // Filnavn i appdata-katalogen
  name: 'config',
});

module.exports = store;
