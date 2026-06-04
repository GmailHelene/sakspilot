/**
 * Excel-rapportgenerator for Sakspilot arbeidsøkter.
 *
 * Tar en arbeidsøkt (samling av sessions mellom Start og Stopp) og
 * lager en .xlsx-fil med fire ark:
 *
 *   1. Sammendrag      , totaltall, dato, varighet
 *   2. Per sak         , fakturerbar tid per sak
 *   3. Per applikasjon , hvor mye tid brukt i hvert program
 *   4. Detaljer        , hver eneste vindusperiode
 *
 * Filformatet er valgt fordi det er enkelt å:
 *   - Sende til kunde som vedlegg
 *   - Lime inn i Tripletex / Fiken / regnskapssystem
 *   - Justere manuelt om noen entries trenger korrigering
 *   - Åpne på Mac (Numbers) og iPhone (Numbers / Excel mobile)
 */
const XLSX = require('xlsx');

/**
 * @param {Object} input
 * @param {Date} input.workSessionStart
 * @param {Date} input.workSessionEnd
 * @param {Array} input.sessions  TimeEntry-utkast: { startedAt, endedAt, durationSec, app, title, sakId, sakTitle, sakHourlyRate, matchedOn }
 * @param {string} input.userName
 * @param {string} input.orgName
 * @returns {Buffer} XLSX-fil som Buffer
 */
function buildWorkSessionReport({ workSessionStart, workSessionEnd, sessions, userName, orgName }) {
  const wb = XLSX.utils.book_new();

  const totalSec = sessions.reduce((s, e) => s + e.durationSec, 0);

  // Fakturerbart = enten matchet en sak (sakId satt) ELLER ble logget via
  // auto-spor-flyten (matchedOn='auto-track' eller 'active-sak').
  // Grunn: når bruker har "auto-spor PÅ" betyr det at de fakturerer alt
  // de gjør i Sakspilot, selv om de ikke har attribuert til en spesifikk
  // sak ennå. Det kan kategoriseres senere via AI-triage eller manuelt.
  const isBillable = (e) =>
    !!e.sakId ||
    e.matchedOn === "auto-track" ||
    e.matchedOn === "active-sak";

  const billableSec = sessions
    .filter(isBillable)
    .reduce((s, e) => s + e.durationSec, 0);
  const nonBillableSec = totalSec - billableSec;

  const totalAmount = sessions
    .filter((e) => isBillable(e) && e.sakHourlyRate)
    .reduce((s, e) => s + (e.durationSec / 3600) * (e.sakHourlyRate || 0), 0);

  // ── Ark 1: Sammendrag ──────────────────────────────────────
  const sammendrag = [
    ['Sakspilot - arbeidsøktsrapport'],
    [],
    ['Bruker', userName || ''],
    ['Organisasjon', orgName || ''],
    ['Generert', formatDateTime(new Date())],
    [],
    ['Arbeidsøkt'],
    ['Start', formatDateTime(workSessionStart)],
    ['Slutt', formatDateTime(workSessionEnd)],
    ['Varighet (klokke)', formatDuration((workSessionEnd - workSessionStart) / 1000)],
    [],
    ['Logget tid'],
    ['Totalt registrert', formatDuration(totalSec)],
    ['Fakturerbart', formatDuration(billableSec)],
    ['Ikke-fakturerbart', formatDuration(nonBillableSec)],
    ['Antall sessions', sessions.length],
    [],
    ['Beløp (estimert)'],
    ['Sum fakturerbart', round2(totalAmount), 'kr'],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(sammendrag);
  wsSum['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 6 }];
  XLSX.utils.book_append_sheet(wb, wsSum, 'Sammendrag');

  // ── Ark 2: Per prosjekt ────────────────────────────────────
  // Bruker bucket-nøkkel basert på (sakId ELLER auto-spor-flagg) så
  // auto-tracked sessions uten sakId havner i "Ukategorisert"-bøtta
  // istedenfor "(ikke-matchet)" som var forvirrende.
  const perSakMap = new Map();
  for (const s of sessions) {
    const isAutoTracked = !s.sakId && (s.matchedOn === 'auto-track' || s.matchedOn === 'active-sak');
    const key = s.sakId || (isAutoTracked ? '__auto__' : '__none__');
    const defaultTitle = s.sakId
      ? s.sakTitle
      : isAutoTracked
      ? 'Ukategorisert (auto-sporet - fordel til prosjekt i Sakspilot)'
      : 'Ukategorisert (ingen match - fordel til prosjekt i Sakspilot)';
    const existing = perSakMap.get(key) || {
      sakTitle: defaultTitle,
      hourlyRate: s.sakHourlyRate || 0,
      sec: 0,
      sessions: 0,
    };
    existing.sec += s.durationSec;
    existing.sessions += 1;
    perSakMap.set(key, existing);
  }
  const perSak = [['Prosjekt', 'Timer', 'Timesats (kr/t)', 'Beløp (kr)', 'Sessions']];
  for (const [, v] of [...perSakMap].sort((a, b) => b[1].sec - a[1].sec)) {
    const hours = round2(v.sec / 3600);
    const amount = v.hourlyRate ? round2(hours * v.hourlyRate) : '';
    perSak.push([v.sakTitle, hours, v.hourlyRate || '', amount, v.sessions]);
  }
  perSak.push([]);
  perSak.push([
    'SUM',
    round2(totalSec / 3600),
    '',
    round2(totalAmount),
    sessions.length,
  ]);
  const wsSak = XLSX.utils.aoa_to_sheet(perSak);
  wsSak['!cols'] = [{ wch: 50 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsSak, 'Per prosjekt');

  // ── Ark 3: Per applikasjon ─────────────────────────────────
  const perAppMap = new Map();
  for (const s of sessions) {
    const key = s.app || '(ukjent)';
    perAppMap.set(key, (perAppMap.get(key) || 0) + s.durationSec);
  }
  const perApp = [['Applikasjon', 'Timer', 'Minutter', 'Andel av total']];
  for (const [app, sec] of [...perAppMap].sort((a, b) => b[1] - a[1])) {
    const hours = round2(sec / 3600);
    const minutes = Math.round(sec / 60);
    const pct = totalSec ? ((sec / totalSec) * 100).toFixed(1) + ' %' : '0 %';
    perApp.push([app, hours, minutes, pct]);
  }
  const wsApp = XLSX.utils.aoa_to_sheet(perApp);
  wsApp['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsApp, 'Per applikasjon');

  // ── Ark 4: Detaljer ────────────────────────────────────────
  const detalj = [['Start', 'Slutt', 'Varighet', 'Sek', 'Prosjekt', 'Applikasjon', 'Vindustittel', 'Matchet på']];
  for (const s of [...sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))) {
    detalj.push([
      formatDateTime(s.startedAt),
      formatDateTime(s.endedAt),
      formatDuration(s.durationSec),
      s.durationSec,
      s.sakTitle || '',
      s.app || '',
      s.title || '',
      s.matchedOn || '',
    ]);
  }
  const wsDet = XLSX.utils.aoa_to_sheet(detalj);
  wsDet['!cols'] = [
    { wch: 19 }, { wch: 19 }, { wch: 12 }, { wch: 8 },
    { wch: 40 }, { wch: 25 }, { wch: 60 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, 'Detaljer');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Hjelpefunksjoner ─────────────────────────────────────────
function formatDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString('nb-NO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { buildWorkSessionReport };
