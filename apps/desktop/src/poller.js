/**
 * Poller, kjernen i Sakspilot desktop-agent.
 *
 * Henter aktivt vindu fra active-win hvert N. sekund og
 * fyrer av events når:
 *   - vinduet bytter
 *   - en session (kontinuerlig opphold i samme vindu) avsluttes
 *
 * Sak-matching gjøres via regler hentet fra backend (cached i Store).
 * I POC-versjonen er reglene tomme, full versjon henter via /agent/rules.
 *
 * Cross-platform via `active-win` (Windows + macOS + Linux). Returnerer
 * { title, owner: { name, path, processId }, ... }, samme form som
 * tidligere get-windows, så ingen call-sites trenger endring.
 *
 * Plattform-caveats:
 *   - macOS: krever Accessibility permission (System Settings → Privacy &
 *     Security → Accessibility). Brukeren får en prompt første gang appen
 *     prøver å lese aktivt vindu.
 *   - Linux: krever X11 (active-win bruker xprop/xdotool). Wayland-økter
 *     har begrenset støtte (bare app-navn, ikke window title).
 */
const { EventEmitter } = require('node:events');

class Poller extends EventEmitter {
  constructor({ intervalSec = 15, excludedApps = [] } = {}) {
    super();
    this.intervalSec = intervalSec;
    this.excludedApps = new Set(excludedApps.map((s) => s.toLowerCase()));
    this.rules = []; // [{ sakId, sakTitle, type, pattern (regex), priority }]
    this.activeWindow = null;
    this.currentSession = null;
    this.lastSnapshot = null;
    this.intervalId = null;
    this.paused = false;
    this.pollCount = 0;
    this.errorCount = 0;
    this.sessionCount = 0;
  }

  async start() {
    if (this.intervalId) return; // allerede startet
    // active-win er cross-platform (win32 + darwin + linux). Default-export
    // er selve funksjonen: const activeWin = require('active-win'); await activeWin();
    // Binæren kan mangle/være inkompatibel etter bygg på tvers av Electron-
    // versjoner. Da kaster vi en tydelig, merket feil sa main kan vise
    // brukeren noe forstaaelig istedenfor en stille frossen tray.
    try {
      const mod = await import('active-win');
      this.activeWindow = mod.default;
    } catch (err) {
      const e = new Error(
        'active-win kunne ikke lastes (mangler eller feil binær for denne maskinen). ' +
        'Automatisk tidsregistrering kan ikke kjøre.'
      );
      e.code = 'ACTIVE_WIN_MISSING';
      e.cause = err;
      this.emit('error', e);
      throw e;
    }
    this._tick(); // første tick umiddelbart
    this.intervalId = setInterval(() => this._tick(), this.intervalSec * 1000);
    this.emit('started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._closeCurrentSession(new Date());
    this.emit('stopped');
  }

  pause() {
    this.paused = true;
    this._closeCurrentSession(new Date());
    this.emit('paused');
  }

  resume() {
    this.paused = false;
    this.emit('resumed');
  }

  setRules(rules) {
    // Konverter pattern-strenger til kompilerte RegExp én gang
    this.rules = rules.map((r) => ({
      ...r,
      regex: new RegExp(r.pattern, 'i'),
    }));
    this.emit('rules-updated', this.rules.length);
  }

  setExcludedApps(apps) {
    this.excludedApps = new Set(apps.map((s) => s.toLowerCase()));
  }

  /**
   * Manuelt logg en ekstern session, brukes når Sakspilot åpner noe
   * (snarvei/.exe/mappe/URL) og auto-track er på.
   *
   * Vi vet ikke når brukeren slutter å bruke det åpnede, så vi logger
   * det som en "startet"-event nå, varigheten kommer fra poller-cyklusen
   * som plukker opp vinduet uansett. Hovedpoenget her er at vi attribuerer
   * det til riktig sak selv om matching-regler mangler.
   */
  logOpenedExternal({ app, title, sakId = null, sakTitle = null, durationSec = 5 }) {
    const now = new Date();
    const sess = {
      startedAt: new Date(now.getTime() - durationSec * 1000),
      endedAt: now,
      app: app || 'sakspilot-opened',
      title: title || '',
      processId: null,
      sakId,
      sakTitle,
      matchedOn: sakId ? 'auto-track' : null,
      durationSec,
    };
    this.sessionCount++;
    this.emit('session-closed', sess);
  }

  /**
   * Override-attribusjon, kalles av main.js for å si "alle nye sessions
   * uten match skal heretter attribueres til denne saken". Returneres til
   * matching-pipelinen som fallback når reglene ikke matcher.
   */
  setActiveSakFallback(sakId, sakTitle) {
    this.activeSakFallback = sakId ? { sakId, sakTitle } : null;
  }

  setInterval(sec) {
    if (sec === this.intervalSec) return;
    this.intervalSec = sec;
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }

  async _tick() {
    if (this.paused) return;
    this.pollCount++;

    let snap;
    try {
      snap = await this.activeWindow();
    } catch (err) {
      this.errorCount++;
      this.emit('error', err);
      return;
    }

    if (!snap) {
      // Skjermlås / ingen aktivt vindu
      this._closeCurrentSession(new Date());
      this.lastSnapshot = null;
      return;
    }

    const appName = snap.owner?.name?.toLowerCase() || '';
    if (this.excludedApps.has(appName)) {
      // Ekskludert app (f.eks. nettbank), ikke logg
      this._closeCurrentSession(new Date());
      this.lastSnapshot = snap;
      return;
    }

    const match = this._findMatch(snap);

    if (!this._isSameWindow(snap, this.lastSnapshot)) {
      this._closeCurrentSession(new Date());
      this._startSession(snap, new Date(), match);
      this.emit('window-change', { snap, match });
    }
    this.lastSnapshot = snap;
  }

  _findMatch(snap) {
    const haystacks = {
      title: snap.title || '',
      app: snap.owner?.name || '',
      path: snap.owner?.path || '',
    };
    // Reglene er sortert etter priority desc, første treff vinner
    for (const rule of this.rules) {
      const target = haystacks[rule.type];
      if (target && rule.regex.test(target)) {
        return { sakId: rule.sakId, sakTitle: rule.sakTitle, matchedOn: rule.type };
      }
    }
    // Fallback 1: auto-track-modus med aktiv sak satt -> attribuer til den saken
    if (this.activeSakFallback) {
      return {
        sakId: this.activeSakFallback.sakId,
        sakTitle: this.activeSakFallback.sakTitle,
        matchedOn: 'active-sak',
      };
    }
    // Fallback 2: auto-track er PA men ingen aktiv sak valgt.
    // Sesjonen telles fortsatt som fakturerbar (matchedOn='auto-track')
    // siden brukeren har eksplisitt slatt pa tidssporing - intensjonen er
    // a fakturere denne tiden. Sesjonen gar i "Ukategorisert"-botta i
    // rapporten til brukeren tagger den til en sak.
    if (this._autoTrackEnabled) {
      return {
        sakId: null,
        sakTitle: null,
        matchedOn: 'auto-track',
      };
    }
    return null;
  }

  /**
   * Slass av/pa "auto-track-modus uten valgt sak teller som fakturerbar".
   * Settes fra main.js sammen med activeSakFallback for backward-compat.
   */
  setAutoTrackEnabled(enabled) {
    this._autoTrackEnabled = !!enabled;
  }

  _isSameWindow(a, b) {
    if (!a || !b) return false;
    return (
      a.title === b.title &&
      a.owner?.name === b.owner?.name &&
      a.owner?.processId === b.owner?.processId
    );
  }

  _startSession(snap, now, match) {
    this.currentSession = {
      startedAt: now,
      app: snap.owner?.name || 'ukjent',
      title: snap.title || '',
      processId: snap.owner?.processId,
      sakId: match?.sakId ?? null,
      sakTitle: match?.sakTitle ?? null,
      matchedOn: match?.matchedOn ?? null,
    };
  }

  _closeCurrentSession(now) {
    if (!this.currentSession) return;
    const sess = {
      ...this.currentSession,
      endedAt: now,
      durationSec: Math.max(1, Math.round((now - this.currentSession.startedAt) / 1000)),
    };
    this.sessionCount++;
    this.currentSession = null;
    this.emit('session-closed', sess);
  }

  getStatus() {
    return {
      running: !!this.intervalId,
      paused: this.paused,
      pollCount: this.pollCount,
      errorCount: this.errorCount,
      sessionCount: this.sessionCount,
      ruleCount: this.rules.length,
      currentSession: this.currentSession
        ? {
            app: this.currentSession.app,
            title: this.currentSession.title,
            sakTitle: this.currentSession.sakTitle,
            startedAt: this.currentSession.startedAt,
          }
        : null,
    };
  }
}

module.exports = { Poller };
