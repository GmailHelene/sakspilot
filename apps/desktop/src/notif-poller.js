/**
 * Notification-poller — henter /notifications/counts hvert 60 sek,
 * sammenligner med forrige snapshot og fyrer Windows/macOS-toast
 * når en kategori har FÅTT flere uleste.
 *
 *   Eksempel:
 *     forrige snapshot: { foresporsler: { unread: 0 }, fakturaer: { unread: 1 } }
 *     ny snapshot:      { foresporsler: { unread: 2 }, fakturaer: { unread: 1 } }
 *     → varsler "2 nye forespørsler"
 *
 * Trigger BARE på økning (delta > 0). Hvis bruker leser i web og
 * count går ned, sier vi ingenting. Hvis count forblir likt heller ikke.
 *
 * Tap av økning: vi sammenligner mot SISTE snapshot, ikke mot "siste sett
 * av bruker". Bevisst valg — så hvis du har 1 ulest og du IKKE har
 * lest den, sier vi ikke fra på nytt. Vi sier bare fra om nye siden
 * forrige polling-tick. Dette unngår spam.
 *
 * Toast-klikk: åpner dashbordet og navigerer det til relevant /side.
 *
 * Krever:
 *   - apiCall (HTTP-helper fra main.js)
 *   - store (electron-store-instans)
 *   - notify(opts) (wrapper rundt Electron Notification, definert i main.js
 *     fordi den allerede har all click-håndtering)
 *   - navigateDashboard(path) (åpner+navigerer dashboardWindow)
 */
const STORE_KEY = 'lastSeenNotifCounts';
const BASE_POLL_INTERVAL_MS = 60_000;
const MAX_POLL_INTERVAL_MS = 5 * 60_000;  // 5 min max — uansett hvor mange fail vi har

// Per-område: hvordan vi formaterer toast-tittel + body.
// `silent: false` aktiverer Windows-standard-varsel-lyd; vi setter det
// kun på områder som er VIKTIGE å fange opp med en gang (nye leads).
// Andre områder bruker silent toast for å ikke avbryte arbeidsflyten.
const AREA_CONFIG = {
  foresporsler: {
    title: (n) => (n === 1 ? 'Ny forespørsel' : `${n} nye forespørsler`),
    body:  'Klikk for å se i Sakspilot',
    path:  '/foresporsler',
    silent: false,   // nye leads = penger på bordet, må fange brukerens oppmerksomhet
  },
  saker: {
    title: (n) => (n === 1 ? 'Forfalt sak' : `${n} saker har overskredet frist`),
    body:  'Sjekk hvilke saker som er forsinket',
    path:  '/saker',
    silent: true,    // forfalte saker er allerede et problem — ikke spamme lyd
  },
  fakturaer: {
    title: (n) => (n === 1 ? 'Forfalt faktura' : `${n} forfalte fakturaer`),
    body:  'Send purring eller marker som betalt',
    path:  '/fakturaer',
    silent: true,
  },
  kalender: {
    title: (n) => (n === 1 ? 'Frist i dag eller i morgen' : `${n} frister neste 24 t`),
    body:  'Se kalender i Sakspilot',
    path:  '/kalender',
    silent: true,
  },
  klistrelapper: {
    title: (n) => (n === 1 ? 'Påminnelse' : `${n} påminnelser`),
    body:  'Klistrelapp har gått forbi remind-tid',
    path:  '/klistrelapper',
    silent: false,   // påminnelser er bevisst valgt av brukeren — lyd matcher intensjon
  },
  team: {
    title: (n) => (n === 1 ? 'Team-invitasjon' : `${n} team-invitasjoner venter`),
    body:  'Aksepter eller avslå i Innstillinger → Team',
    path:  '/innstillinger/team',
    silent: true,
  },
};

class NotifPoller {
  /**
   * @param {Object} opts
   * @param {Function} opts.apiCall — async (path) => json (samme som main.js)
   * @param {Object}   opts.store   — electron-store-instans
   * @param {Function} opts.notify  — ({ title, body, areaPath }) => void
   *                                  Skal fyre Notification + sette up click-handler
   * @param {Function} opts.isLoggedIn — () => boolean, så vi ikke poller når utlogget
   */
  constructor({ apiCall, store, notify, isLoggedIn }) {
    this.apiCall = apiCall;
    this.store = store;
    this.notify = notify;
    this.isLoggedIn = isLoggedIn;
    this.timer = null;
    this.inFlight = false;
    // True når neste tick IKKE skal varsle — bare "kalibrere" snapshot.
    this.skipNextNotify = false;
    // Eksponentiell backoff ved API-feil: dobles for hver påfølgende feil
    // (60s → 120s → 240s → 300s capped). Resettes til base ved første
    // vellykkede tick. Hindrer at en nede-Render-API gir 60 forsøk per minutt
    // og fyller logger med error-spam.
    this.currentIntervalMs = BASE_POLL_INTERVAL_MS;
    this.consecutiveErrors = 0;
  }

  start() {
    if (this.timer) return; // allerede startet
    // Første tick om 10 sek (gir tid til app-init)
    setTimeout(() => this.tick(), 10_000);
    // Schedulering av påfølgende ticks håndteres via scheduleNext()
    // (justeres opp/ned basert på feil-historikk)
    this.scheduleNext();
    console.log('[NotifPoller] startet (60 sek base-intervall, exp backoff ved feil)');
  }

  /** Schedulér neste tick basert på nåværende intervall. */
  scheduleNext() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), this.currentIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[NotifPoller] stoppet');
  }

  async tick() {
    if (this.inFlight) return;
    if (!this.isLoggedIn()) return;
    this.inFlight = true;
    try {
      const res = await this.apiCall('/notifications/counts');
      const counts = res && res.counts ? res.counts : {};
      // Hopp over notify for første tick etter reset (vi vil bare ha en
      // baseline-snapshot, ikke spamme alle eksisterende uleste som "nye").
      // Etterfølgende ticks varsler normalt om endringer fra denne baseline.
      if (this.skipNextNotify) {
        this.skipNextNotify = false;
        console.log('[NotifPoller] første tick etter reset — bare kalibrerer snapshot');
      } else {
        this.compareAndNotify(counts);
      }
      // Lagre fersk snapshot for neste tick. Vi lagrer BARE unread-tallene
      // — total er ikke relevant for delta-sammenligning.
      const snapshot = {};
      for (const [area, c] of Object.entries(counts)) {
        snapshot[area] = c.unread || 0;
      }
      this.store.set(STORE_KEY, snapshot);
      // Vellykket tick — nullstill backoff
      if (this.consecutiveErrors > 0) {
        console.log(`[NotifPoller] kontakt gjenopprettet etter ${this.consecutiveErrors} feil — backoff reset`);
        this.consecutiveErrors = 0;
        this.currentIntervalMs = BASE_POLL_INTERVAL_MS;
      }
    } catch (err) {
      // 401 = utløpt token. Stille feil — main.js sin sync-poller håndterer
      // re-login-flyt allerede; vi vil ikke duplisere toast-spam for det.
      const msg = String(err.message || err);
      if (!msg.includes('401')) {
        // Eksponentiell backoff: dobbel intervall opptil MAX
        this.consecutiveErrors++;
        this.currentIntervalMs = Math.min(
          BASE_POLL_INTERVAL_MS * Math.pow(2, this.consecutiveErrors),
          MAX_POLL_INTERVAL_MS,
        );
        console.warn(`[NotifPoller] tick feilet (#${this.consecutiveErrors}): ${msg}. Neste forsøk om ${Math.round(this.currentIntervalMs / 1000)}s`);
      }
    } finally {
      this.inFlight = false;
      // Schedulér neste tick — bruker oppdatert currentIntervalMs
      this.scheduleNext();
    }
  }

  compareAndNotify(counts) {
    const prev = this.store.get(STORE_KEY) || {};
    for (const [area, c] of Object.entries(counts)) {
      const cfg = AREA_CONFIG[area];
      if (!cfg) continue;
      const prevUnread = prev[area] || 0;
      const currUnread = c.unread || 0;
      const delta = currUnread - prevUnread;
      if (delta > 0) {
        // Vis toast for NYE siden forrige tick (ikke totalt antall uleste)
        try {
          this.notify({
            title: cfg.title(delta),
            body: cfg.body,
            areaPath: cfg.path,
            silent: cfg.silent,
          });
          console.log(`[NotifPoller] ${area}: +${delta} (was ${prevUnread} → ${currUnread})`);
        } catch (err) {
          console.warn('[NotifPoller] notify feilet:', err.message);
        }
      }
    }
  }

  /**
   * Reset snapshot — kalles ved logout. Setter også skipNextNotify så neste
   * tick (etter neste login) bare kalibrerer baseline uten å spam-varsle om
   * alt som har samlet seg opp i mellomtiden.
   */
  reset() {
    this.store.delete(STORE_KEY);
    this.skipNextNotify = true;
  }
}

module.exports = { NotifPoller };
