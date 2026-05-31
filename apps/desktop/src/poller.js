/**
 * Poller — kjernen i Sakspilot desktop-agent.
 *
 * Henter aktivt vindu fra get-windows hvert N. sekund og
 * fyrer av events når:
 *   - vinduet bytter
 *   - en session (kontinuerlig opphold i samme vindu) avsluttes
 *
 * Sak-matching gjøres via regler hentet fra backend (cached i Store).
 * I POC-versjonen er reglene tomme — full versjon henter via /agent/rules.
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
    const mod = await import('get-windows');
    this.activeWindow = mod.activeWindow;
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
   * Manuelt logg en ekstern session — brukes når Sakspilot åpner noe
   * (snarvei/.exe/mappe/URL) og auto-track er på.
   *
   * Vi vet ikke når brukeren slutter å bruke det åpnede, så vi logger
   * det som en "startet"-event nå — varigheten kommer fra poller-cyklusen
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
   * Override-attribusjon — kalles av main.js for å si "alle nye sessions
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
      // Ekskludert app (f.eks. nettbank) — ikke logg
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
    // Reglene er sortert etter priority desc — første treff vinner
    for (const rule of this.rules) {
      const target = haystacks[rule.type];
      if (target && rule.regex.test(target)) {
        return { sakId: rule.sakId, sakTitle: rule.sakTitle, matchedOn: rule.type };
      }
    }
    // Fallback: auto-track-modus setter "active sak" som default-attribusjon
    // for alt som ikke matcher en eksplisitt regel.
    if (this.activeSakFallback) {
      return {
        sakId: this.activeSakFallback.sakId,
        sakTitle: this.activeSakFallback.sakTitle,
        matchedOn: 'active-sak',
      };
    }
    return null;
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
