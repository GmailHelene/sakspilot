/**
 * Cloud-sync av UI-preferanser (sakspilot_*-keys i localStorage).
 *
 * Hvorfor: localStorage er per Electron-installasjon. Når Helene laster ned
 * ny .exe og pakker ut til ny mappe, blir alle Mine sites/mapper/snarveier
 * borte. Med cloud-sync følger alt brukeren overalt, pluss at samme bruker
 * kan logge inn på sakspilot.no i nettleser og se sine egne preferanser.
 *
 * Flyt:
 *   1. Ved app-mount: GET /me/preferences → populér manglende localStorage-keys
 *      (lokale verdier vinner, brukeren har kanskje endret noe lokalt)
 *   2. Hver 5. sekund: snapshot alle sakspilot_*-keys → hvis endret siden
 *      sist, PUT /me/preferences
 *   3. Ved logout/exit: best-effort siste push (kan miste 0-5 sek av endringer)
 */
import { api, isTokenValid } from './api';

const SYNCED_KEYS = [
  'sakspilot_shortcuts',
  'sakspilot_folder_shortcuts',
  'sakspilot_my_sites',
  'sakspilot_launcher_apps',
  'sakspilot_hidden_nav',
  'sakspilot_hjem_hidden_widgets',
  'sakspilot_theme',
  'sakspilot_profession',
  'sakspilot_onboarded',
] as const;

let initialized = false;
let lastSentHash = '';
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === 'undefined') return out;
  for (const k of SYNCED_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

async function pushIfChanged() {
  const snap = snapshot();
  const hash = JSON.stringify(snap);
  if (hash === lastSentHash) return;
  if (Object.keys(snap).length === 0) return; // ikke push tomt
  try {
    await api('/me/preferences', { method: 'PUT', body: snap });
    lastSentHash = hash;
  } catch {
    // ignorer feil, vi prøver igjen om 5 sek
  }
}

export async function initPreferenceSync(): Promise<void> {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  if (!isTokenValid()) return;
  initialized = true;

  // Steg 1: hent fra DB og populér manglende keys
  // VIKTIG: dispatch events etter populering sa komponenter som Sidebar +
  // Launcher kan re-lese fra localStorage. Uten dette har Sidebar allerede
  // mountet med tom state og ser aldri den synced-inn dataen, brukeren tror
  // alle snarveier/sites/mapper er borte etter ny .exe-install.
  let restoredAny = false;
  try {
    const remote = await api<Record<string, string>>('/me/preferences');
    if (remote && typeof remote === 'object') {
      for (const [k, v] of Object.entries(remote)) {
        if (
          typeof v === 'string' &&
          (SYNCED_KEYS as readonly string[]).includes(k) &&
          localStorage.getItem(k) === null
        ) {
          localStorage.setItem(k, v);
          restoredAny = true;
        }
      }
    }
  } catch {
    // ignorer, vi prøver igjen ved neste pageload
  }
  if (restoredAny) {
    // Sidebar lytter pa prefs-restored og sites-updated for shortcuts/sites/folders
    // Launcher lytter pa launcher-updated og sites-updated for apper
    window.dispatchEvent(new Event('sakspilot:prefs-restored'));
    window.dispatchEvent(new Event('sakspilot:sites-updated'));
    window.dispatchEvent(new Event('sakspilot:launcher-updated'));
    window.dispatchEvent(new Event('sakspilot:nav-updated'));
  }

  lastSentHash = JSON.stringify(snapshot());

  // Steg 2: periodisk sync (5s)
  intervalHandle = setInterval(pushIfChanged, 5000);

  // Steg 3: best-effort push ved page-unload
  window.addEventListener('beforeunload', () => {
    pushIfChanged().catch(() => {});
  });
}

export function stopPreferenceSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  initialized = false;
}
