#!/usr/bin/env node
/**
 * Sakspilot Desktop Agent, Proof of Concept
 *
 * Mål: Bevise at vi kan registrere aktivt vindu på Windows (tittel, app,
 * filsti) med passende oppdateringsfrekvens, uten å brenne CPU og uten
 * å krasje. Hvis denne POC-en virker, er hovedkonseptet flygbart.
 *
 * Hva vi tester:
 *   1. get-windows-pakken laster og kjører på Windows
 *   2. activeWindow() returnerer (app, tittel, prosess-id, [filsti])
 *   3. Polling hvert N. sekund er stabil
 *   4. Vi kan oppdage app-/vindusbytter
 *   5. Sak-matching via regex mot tittel/filsti gir riktige treff
 *   6. Vi kan eksportere TimeEntry-poster som JSON
 *
 * Kjør:
 *   npm run poc            -- 15s intervall, 5 min varighet
 *   npm run poc:fast       -- 3s intervall, 2 min varighet (rask test)
 *   npm run poc:matching   -- inkluder eksempel-sak-matching
 *
 * Eller direkte:
 *   node src/poc-logger.js --interval=5 --duration=60 --rules
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── CLI-argumenter ──────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const INTERVAL_SEC = Number(args.interval ?? 15);
const DURATION_SEC = Number(args.duration ?? 300);
const RULES_MODE = Boolean(args.rules);

// ── Sak-matching eksempelregler (simulerer det desktop-agenten skal gjøre) ──
//
// I produksjon hentes disse fra backend (GET /agent/rules) og caches lokalt
// i SQLite. POC-en hardkoder noen demo-regler for å bevise mekanismen.
//
// NB: get-windows gir oss owner.path = stien til .exe-en (f.eks. WINWORD.EXE),
// IKKE filen som er åpen i Word. For dokument-matching må vi bruke
// vindustittelen som vanligvis inneholder filnavnet.
//
// Regex'ene tillater både mellomrom, bindestrek, understrek eller ingenting
// mellom navn og tall, slik at "Bygdoy-12", "Bygdøy 12", "bygdoy12" alle
// matcher samme sak.
const DEMO_RULES = [
  {
    sakId: 'demo-bygdoy-12',
    sakTitle: 'Bygdøy 12 - rammetillatelse',
    patterns: [
      { type: 'title', pattern: /bygd[øo]y[\s\-_]*12/i },
    ],
  },
  {
    sakId: 'demo-skien-7',
    sakTitle: 'Skien 7 - ferdigattest',
    patterns: [{ type: 'title', pattern: /skien[\s\-_]*7/i }],
  },
  {
    sakId: 'demo-administrasjon',
    sakTitle: 'Administrasjon (intern)',
    patterns: [
      { type: 'app', pattern: /^(outlook|teams|slack)/i },
      { type: 'title', pattern: /epost|invoice|faktura/i },
    ],
  },
];

function findMatchingSak(window) {
  const haystacks = {
    title: window.title || '',
    app: window.owner?.name || '',
    path: window.owner?.path || '',
  };
  for (const rule of DEMO_RULES) {
    for (const p of rule.patterns) {
      const target = haystacks[p.type];
      if (target && p.pattern.test(target)) {
        return { sakId: rule.sakId, sakTitle: rule.sakTitle, matchedOn: p.type };
      }
    }
  }
  return null;
}

// ── State ───────────────────────────────────────────────────────
const sessionStart = new Date();
const sessions = []; // TimeEntry-utkast - én per kontinuerlig sak/app-vindu
let current = null; // pågående session
let lastSnapshot = null;
let pollCount = 0;
let errorCount = 0;

const outDir = path.join(os.tmpdir(), 'sakspilot-poc');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(
  outDir,
  `session-${sessionStart.toISOString().replace(/[:.]/g, '-')}.json`
);

// ── Logging ─────────────────────────────────────────────────────
function ts() {
  return new Date().toISOString().slice(11, 19);
}
function log(msg, ...rest) {
  console.log(`[${ts()}] ${msg}`, ...rest);
}

function isSameWindow(a, b) {
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.owner?.name === b.owner?.name &&
    a.owner?.processId === b.owner?.processId
  );
}

function closeCurrentSession(now) {
  if (!current) return;
  current.endedAt = now.toISOString();
  current.durationSec = Math.round((now - new Date(current.startedAt)) / 1000);
  sessions.push(current);
  current = null;
}

function startNewSession(snap, now, match) {
  current = {
    startedAt: now.toISOString(),
    endedAt: null,
    durationSec: 0,
    app: snap.owner?.name || 'ukjent',
    title: snap.title || '(uten tittel)',
    path: snap.owner?.path || null,
    sakId: match?.sakId ?? null,
    sakTitle: match?.sakTitle ?? null,
    matchedOn: match?.matchedOn ?? null,
  };
}

// ── Hovedløkke ──────────────────────────────────────────────────
async function tick(activeWindow) {
  pollCount++;
  const now = new Date();

  let snap;
  try {
    snap = await activeWindow();
  } catch (err) {
    errorCount++;
    log(`⚠ get-windows feilet: ${err.message}`);
    return;
  }

  if (!snap) {
    // Skjermlås, ingen aktivt vindu, etc.
    if (current) {
      log(`⏸  Ingen aktivt vindu - avslutter session "${current.title}"`);
      closeCurrentSession(now);
    }
    lastSnapshot = null;
    return;
  }

  const match = RULES_MODE ? findMatchingSak(snap) : null;

  if (!isSameWindow(snap, lastSnapshot)) {
    closeCurrentSession(now);
    startNewSession(snap, now, match);
    const sakLabel = match ? `  → 🎯 ${match.sakTitle} (${match.matchedOn})` : '';
    log(`▶  ${snap.owner?.name}: "${truncate(snap.title, 60)}"${sakLabel}`);
  }
  lastSnapshot = snap;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ── Avslutning + rapport ────────────────────────────────────────
function finish(reason) {
  closeCurrentSession(new Date());
  const totalDuration = Math.round((Date.now() - sessionStart.getTime()) / 1000);

  console.log('\n' + '═'.repeat(70));
  console.log(`POC FULLFØRT - ${reason}`);
  console.log('═'.repeat(70));
  console.log(`Totalt:           ${totalDuration}s`);
  console.log(`Polls:            ${pollCount} (${(pollCount / Math.max(totalDuration, 1) * 60).toFixed(1)}/min)`);
  console.log(`Feil:             ${errorCount}`);
  console.log(`Sessions:         ${sessions.length}`);

  // Per-app aggregat
  const perApp = {};
  for (const s of sessions) {
    perApp[s.app] = (perApp[s.app] ?? 0) + s.durationSec;
  }
  const sorted = Object.entries(perApp).sort((a, b) => b[1] - a[1]);
  console.log('\nTid per applikasjon:');
  for (const [app, sec] of sorted) {
    console.log(`  ${app.padEnd(30)} ${formatDur(sec)}`);
  }

  // Per-sak aggregat (hvis matching var på)
  if (RULES_MODE) {
    const perSak = {};
    for (const s of sessions) {
      const key = s.sakTitle || '(ikke-matchet)';
      perSak[key] = (perSak[key] ?? 0) + s.durationSec;
    }
    console.log('\nTid per sak:');
    for (const [sak, sec] of Object.entries(perSak).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${sak.padEnd(40)} ${formatDur(sec)}`);
    }
  }

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        sessionStart: sessionStart.toISOString(),
        sessionEnd: new Date().toISOString(),
        totalDurationSec: totalDuration,
        pollCount,
        errorCount,
        intervalSec: INTERVAL_SEC,
        rulesEnabled: RULES_MODE,
        sessions,
      },
      null,
      2
    )
  );
  console.log(`\nDetaljert JSON skrevet til:\n  ${outFile}\n`);

  // Verdivurdering
  if (errorCount === 0) {
    console.log('✅ POC ok - get-windows fungerer pålitelig på din Windows.');
  } else if (errorCount < pollCount * 0.1) {
    console.log('⚠ POC delvis ok - sporadiske feil men håndterbart.');
  } else {
    console.log('❌ POC har for mange feil - undersøk get-windows-installasjonen.');
  }
}

function formatDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}t ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Start ───────────────────────────────────────────────────────
(async () => {
  // active-win er ESM-only, bruk dynamic import. Cross-platform (win/mac/linux).
  let activeWindow;
  try {
    const mod = await import('active-win');
    activeWindow = mod.default;
  } catch (err) {
    console.error('Kunne ikke laste active-win:', err.message);
    console.error('Kjør "npm install" i apps/desktop først.');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         Sakspilot Desktop Agent - Proof of Concept              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`Polling-intervall:  ${INTERVAL_SEC}s`);
  console.log(`Varighet:           ${DURATION_SEC}s (Ctrl+C for å avslutte tidligere)`);
  console.log(`Sak-matching:       ${RULES_MODE ? 'PÅ (demo-regler)' : 'AV (ren logging)'}`);
  console.log(`Plattform:          ${process.platform} ${process.arch}, Node ${process.version}`);
  console.log('─'.repeat(70));
  console.log('Bytt vinduer (Word, Outlook, nettleser, Filutforsker, AutoCAD osv.)');
  console.log('for å verifisere at agenten oppdager byttene.');
  console.log('─'.repeat(70) + '\n');

  // Første tick umiddelbart, så hvert INTERVAL_SEC
  await tick(activeWindow);
  const intervalId = setInterval(() => tick(activeWindow), INTERVAL_SEC * 1000);

  // Auto-stopp
  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);
    finish('varighet utløp');
    process.exit(0);
  }, DURATION_SEC * 1000);

  // Graceful Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    clearTimeout(timeoutId);
    finish('avbrutt med Ctrl+C');
    process.exit(0);
  });
})();
