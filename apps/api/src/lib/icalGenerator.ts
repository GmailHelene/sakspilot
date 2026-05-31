/**
 * iCal-generator — RFC 5545-output for Sakspilot.
 *
 * Genererer et abonnement-egnet kalender-feed med VEVENT-blokker for
 * sak-frister og milepæler. Skrevet for hånd (ingen ekstern ical-lib):
 * subsettet vi trenger er begrenset, og en avhengighet til mer ville
 * dratt inn unødvendig kompleksitet.
 *
 * Viktige detaljer:
 *   - CRLF (\r\n) som linjeskille (spec krever det)
 *   - Line-folding på 75 oktetter (CRLF + ett SPACE-tegn = continuation)
 *   - Escape-regler: \\, semikolon → \;, komma → \,, newline → \n
 *   - Full VTIMEZONE-blokk for Europe/Oslo med DST-overgangs-regler
 *     (RRULE som matcher EU-standard: siste søndag i mars / oktober).
 *     En forenklet variant uten DST-info fungerer i de fleste klienter
 *     men feiler i Outlook ved DST-skiftet — derfor tar vi heller den
 *     korrekte varianten.
 *   - DTSTAMP er tidspunktet feeden genereres (UTC, format Z), kreves
 *     på alle VEVENT.
 *   - Heldagshendelser bruker VALUE=DATE og YYYYMMDD-format (uten tid)
 *     — det er korrekt for frister som ikke har et spesifikt klokkeslett.
 *
 * Vi inkluderer X-WR-CALNAME (kalender-navn som vises i klient) og
 * X-PUBLISHED-TTL (anbefalt refresh-intervall — 1 time).
 */

export interface ICalEvent {
  /** Stabil unik ID — typisk "{milestoneId}@sakspilot.no" eller "{sakId}-deadline@sakspilot.no". */
  uid: string;
  /** Hovedtekst som vises i kalender. */
  summary: string;
  /** Lengre beskrivelse — newlines tillatt (escapes til \n i output). */
  description?: string;
  /**
   * Når hendelsen starter. Hvis allDay=true ignoreres klokkeslett og kun
   * dato brukes (heldagshendelse). Ellers brukes Europe/Oslo-tidssone.
   */
  start: Date;
  /**
   * Når hendelsen slutter. For heldagshendelser SKAL dette være DAGEN ETTER
   * (iCal-konvensjon: DTEND er eksklusiv for heldag — DTSTART=2026-06-01,
   * DTEND=2026-06-02 = heldag 1. juni). Hvis allDay=true og end ikke er satt,
   * setter generatoren start+1 dag automatisk.
   */
  end?: Date;
  /** True hvis hendelsen ikke har et klokkeslett (frister er typisk dette). */
  allDay?: boolean;
  /** Valgfri lokasjon. */
  location?: string;
  /** Dyplenke tilbake til Sakspilot. */
  url?: string;
}

export interface ICalCalendar {
  /** Navn som vises i kalender-klienten (Google Calendar, Apple Calendar, Outlook). */
  name: string;
  /** Beskrivelse av kalenderen. */
  description?: string;
  /** Tidssone for ikke-heldagshendelser. Default Europe/Oslo. */
  tzid?: string;
  events: ICalEvent[];
}

/**
 * RFC 5545 escape — semikolon, komma, newline, backslash må escapes
 * i TEXT-felter (SUMMARY, DESCRIPTION, LOCATION).
 *
 * Rekkefølgen er kritisk: backslash FØRST, ellers dobbel-escapes vi de
 * andre escape-sekvensene.
 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Format Date til iCal-format. Heldags → YYYYMMDD. Med tid → YYYYMMDDTHHMMSS
 * uten Z-suffiks (lokal tid med TZID=Europe/Oslo i parameter). UTC-stempler
 * (brukes for DTSTAMP) får Z-suffiks via formatUtc.
 *
 * Tar vare på Europe/Oslo-tid ved å konvertere via Intl. Vi unngår å bake
 * inn DST-logikk her — Intl bruker IANA tz-databasen på serveren.
 */
function formatDateLocal(d: Date, allDay: boolean): string {
  if (allDay) {
    // Formatér i Europe/Oslo for å unngå at en UTC-dato som ligger sent
    // på natten ender opp som dagen før/etter for nordmenn.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    return `${y}${m}${day}`;
  }
  // Med klokkeslett: hent komponenter i Europe/Oslo, output uten tz-suffiks
  // (TZID-parameter på selve property-linjen forteller hvilken tz).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const y = get("year");
  const m = get("month");
  const day = get("day");
  // Intl returnerer "24" for midnatt i en-CA — normalisér til "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  const min = get("minute");
  const sec = get("second");
  return `${y}${m}${day}T${hour}${min}${sec}`;
}

/** UTC-format med Z-suffiks (for DTSTAMP). */
function formatUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/**
 * Line-folding iht RFC 5545 §3.1: ingen linje > 75 oktetter (bytes, ikke
 * tegn). Lange linjer brytes opp ved å sette CRLF + ett mellomrom — neste
 * linje regnes da som fortsettelse av den forrige.
 *
 * Vi måler i UTF-8-bytes (TextEncoder) for å håndtere norske bokstaver
 * (å = 2 bytes osv) korrekt. Splitter på byte-grense, ikke tegn-grense,
 * men passer på å ikke kutte midt i en multi-byte sekvens.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let offset = 0;
  let maxBytes = 75; // første linje får 75; etterfølgende 74 (1 byte til SPACE)
  while (offset < bytes.length) {
    let end = Math.min(offset + maxBytes, bytes.length);
    // Ikke kutt midt i en UTF-8-sekvens — kontinuasjons-bytes har bit-mønster 10xxxxxx
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(decoder.decode(bytes.slice(offset, end)));
    offset = end;
    maxBytes = 74; // continuation-linjer får et leading SPACE
  }
  return chunks.join("\r\n ");
}

/**
 * VTIMEZONE-blokk for Europe/Oslo. Inneholder STANDARD (CET, UTC+1) og
 * DAYLIGHT (CEST, UTC+2) med RRULE som matcher EU-DST-regelen:
 * siste søndag i mars → CEST, siste søndag i oktober → CET.
 *
 * TZOFFSETFROM/TO er i format ±HHMM. DTSTART for hver del er den datoen
 * regelen "starter å gjelde fra" — vi bruker en historisk dato (1970) så
 * den dekker alle fremtidige hendelser. RRULE genererer alle påfølgende
 * overgangs-datoer automatisk.
 */
function buildOsloTimezone(): string[] {
  return [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Oslo",
    "X-LIC-LOCATION:Europe/Oslo",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

/**
 * Bygg én VEVENT-blokk. Alle linjer foldes individuelt til 75 oktetter.
 */
function buildEvent(ev: ICalEvent, dtstamp: string, tzid: string): string[] {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${ev.uid}`, `DTSTAMP:${dtstamp}`];

  const allDay = ev.allDay === true;
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateLocal(ev.start, true)}`);
    // For heldag må DTEND være dagen ETTER (eksklusiv). Hvis ikke satt, +1 dag.
    const endDate = ev.end ?? new Date(ev.start.getTime() + 86_400_000);
    lines.push(`DTEND;VALUE=DATE:${formatDateLocal(endDate, true)}`);
  } else {
    lines.push(`DTSTART;TZID=${tzid}:${formatDateLocal(ev.start, false)}`);
    if (ev.end) {
      lines.push(`DTEND;TZID=${tzid}:${formatDateLocal(ev.end, false)}`);
    }
  }

  lines.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.description) {
    lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  }
  if (ev.location) {
    lines.push(`LOCATION:${escapeText(ev.location)}`);
  }
  if (ev.url) {
    // URL skal IKKE escapes som TEXT — den er en URI-property. Men vi vil
    // fortsatt unngå kontroll-tegn. Validering har skjedd i kalleren.
    lines.push(`URL:${ev.url}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Hovedfunksjon — bygg komplett iCal-feed som string.
 * Output bruker CRLF som linjeskille (kreves av RFC 5545).
 */
export function buildIcalFeed(cal: ICalCalendar): string {
  const tzid = cal.tzid ?? "Europe/Oslo";
  const dtstamp = formatUtc(new Date());

  const allLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID identifiserer programmet som genererte feeden — kreves.
    "PRODID:-//Sakspilot//iCal Feed//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`,
  ];
  if (cal.description) {
    allLines.push(`X-WR-CALDESC:${escapeText(cal.description)}`);
  }
  allLines.push(`X-WR-TIMEZONE:${tzid}`);
  // PT1H = 1 time refresh-anbefaling for klient
  allLines.push("X-PUBLISHED-TTL:PT1H");
  allLines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");

  // Inkluder timezone-definisjonen kun hvis vi har minst én ikke-heldag-event
  // (sparer noen kB for feeds som kun har frister).
  const hasTimedEvent = cal.events.some((e) => e.allDay !== true);
  if (hasTimedEvent) {
    allLines.push(...buildOsloTimezone());
  }

  for (const ev of cal.events) {
    allLines.push(...buildEvent(ev, dtstamp, tzid));
  }
  allLines.push("END:VCALENDAR");

  return allLines.map(foldLine).join("\r\n") + "\r\n";
}
