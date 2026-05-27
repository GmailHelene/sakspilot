/**
 * Genererer Sakspilot-Komplett-Dokumentasjon-v1.docx — det levende
 * "masterdokumentet" for prosjektet. Erstatter de tre forrige Word-
 * dokumentene (konsept, intervjuguide, fremdriftsplan) som fortsatt
 * finnes for spesifikke formål.
 *
 * Innhold:
 *   Del 1 — Visjon og problem
 *   Del 2 — Marked og konkurranse
 *   Del 3 — Produktet (funksjoner, brukergrensesnitt)
 *   Del 4 — Brukermanual (how to use)
 *   Del 5 — Arkitektur og teknologi
 *   Del 6 — Fremdriftsplan (ferdig / pågående / planlagt)
 *   Del 7 — Forretningsmodell
 *   Del 8 — Risiko og avhengigheter
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageBreak, PageNumber, TableOfContents,
} = require('docx');

const NAVY = '1E3A5F';
const NAVY_DARK = '152A47';
const GOLD = 'B8860B';
const GRAY_LIGHT = 'F4F4F0';
const GRAY_MID = 'CCCCCC';
const GRAY_DARK = '555555';
const GREEN = '2D6A4F';
const RED = '9D0208';
const FONT_H = 'Calibri';
const FONT_B = 'Calibri';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: GRAY_MID };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

const numbering = {
  config: [
    {
      reference: 'bul',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
    {
      reference: 'num',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    },
  ],
};

// ── Hjelpere ───────────────────────────────────────────────
function H1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 200 }, children: [new TextRun({ text: t, bold: true, size: 36, color: NAVY, font: FONT_H })] }); }
function H2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, size: 28, color: NAVY, font: FONT_H })] }); }
function H3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 100 }, children: [new TextRun({ text: t, bold: true, size: 22, color: NAVY, font: FONT_H })] }); }
function P(t, opts = {}) { return new Paragraph({ spacing: { after: 120 }, alignment: opts.align, children: [new TextRun({ text: t, size: 22, font: FONT_B, bold: opts.bold, italics: opts.italic, color: opts.color || '222222' })] }); }
function PRich(runs, opts = {}) { return new Paragraph({ spacing: { after: 120 }, alignment: opts.align, children: runs.map(r => new TextRun({ text: r.text, size: r.size || 22, font: FONT_B, bold: r.bold, italics: r.italic, color: r.color || '222222' })) }); }
function BUL(t, opts = {}) { return new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, size: 22, font: FONT_B, bold: opts.bold, color: opts.color || '222222' })] }); }
function BUL_RICH(runs) { return new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 80 }, children: runs.map(r => new TextRun({ text: r.text, size: 22, font: FONT_B, bold: r.bold, italics: r.italic, color: r.color || '222222' })) }); }
function NUM(t) { return new Paragraph({ numbering: { reference: 'num', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, size: 22, font: FONT_B })] }); }
function CELL(t, o = {}) { return new TableCell({ borders: BORDERS, width: o.width ? { size: o.width, type: WidthType.DXA } : undefined, shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR } : undefined, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: t, size: o.size || 20, font: FONT_B, bold: o.bold, color: o.color || '222222' })] })] }); }
function SPACER(n = 200) { return new Paragraph({ spacing: { after: n }, children: [new TextRun('')] }); }
function CALLOUT(text, color = NAVY) {
  return new Paragraph({
    spacing: { before: 120, after: 200 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color, space: 12 } },
    indent: { left: 240 },
    children: [new TextRun({ text, size: 22, font: FONT_B, italics: true, color: GRAY_DARK })],
  });
}

// ── Forside ────────────────────────────────────────────────
const FORSIDE = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 480 }, children: [new TextRun({ text: 'SAKSPILOT', bold: true, size: 72, color: NAVY, font: FONT_H })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Komplett dokumentasjon', size: 32, color: GOLD, font: FONT_H })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [new TextRun({ text: 'Workspace for selvstendig næringsdrivende', size: 22, italics: true, color: GRAY_DARK, font: FONT_B })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Visjon · Marked · Produkt · Brukermanual · Arkitektur · Fremdrift', size: 22, color: NAVY, font: FONT_B })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 80 }, children: [new TextRun({ text: 'v1.0', size: 26, bold: true, color: NAVY, font: FONT_H })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: '27. mai 2026', size: 22, color: GRAY_DARK, font: FONT_B })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Helene Åsheim Grønberg · Tech Solutions · helene.cloud', size: 20, color: GRAY_DARK, font: FONT_B })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Innholdsfortegnelse ────────────────────────────────────
const TOC = [
  H1('Innholdsfortegnelse'),
  new TableOfContents('Klikk på en linje for å hoppe til kapittelet', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 1 — Visjon og problem
// ════════════════════════════════════════════════════════════════
const DEL1 = [
  H1('Del 1 — Visjon og problem'),

  H2('1.1  Den menneskelige situasjonen'),
  P('Nicole Torgersen er sentralt godkjent ansvarlig søker i byggebransjen. Hun jobber for seg selv, fakturerer per time, og har 5–10 aktive klientoppdrag samtidig. På en typisk arbeidsdag jobber hun i Word, AutoCAD, Holte, Outlook og PDF — om hverandre, ofte på samme sak innen samme 30-minutters periode.'),
  P('Hun bruker Holte for byggesøk, Outlook for kommunikasjon, lokale Word-filer for notater. På slutten av dagen vet hun at hun har jobbet i 8–9 timer, men når hun skal fakturere kunden tipper hun "ca 6 timer" — fordi hun ikke har en presis logg. Hun lever stort sett ned 15–25 % av faktisk arbeidstid hver uke.'),
  P('Hun er ikke alene. Det samme gjelder arkitekter, advokater, regnskapsførere, designere, ingeniører og andre selvstendig næringsdrivende som fakturerer per time.'),

  H2('1.2  Hvorfor finnes ikke en løsning allerede?'),
  P('Markedsanalyse 27. mai 2026 viser at hullet er reelt:'),
  BUL('Holte / Cordel / Visma Severa har sak-CRM, men krever manuell timeføring'),
  BUL('Memtime / Timely har passiv tidsregistrering, men ingen sak-CRM eller integrasjon mot byggebransjen'),
  BUL('SuperOffice + Holte gir CRM + Outlook, men dobbeltlisens og manuell timer'),
  BUL('Tripletex / Fiken er regnskap-først, ikke sak-først'),
  BUL('Procore / Buildertrend (internasjonale) er ikke tilgjengelige i Norge til relevant prispoeng'),

  H2('1.3  Sakspilot sin visjon'),
  PRich([
    { text: 'Du jobber som vanlig. Sakspilot teller timene. ', bold: true },
    { text: 'En diskret tray-app kjører i bakgrunnen og logger automatisk hvilken sak du jobber på, basert på vindustittel og filsti. På slutten av dagen har du en presis fakturalogg — uten å ha startet eller stoppet en eneste timer.' },
  ]),
  P('Du ser oversikten i nettleser-dashbordet. Du eksporterer rapporten til Tripletex/Fiken eller Excel. Du fakturerer for det du faktisk jobbet — ikke det du husker.'),

  H2('1.4  Hvem er Sakspilot for?'),
  P('Selvstendig næringsdrivende som:'),
  BUL('Jobber med flere klienter/saker samtidig'),
  BUL('Fakturerer per time eller per sak'),
  BUL('Bruker mange ulike programmer i samme arbeidsdag'),
  BUL('Driver alene eller i lite team (1–10 personer)'),
  P('Primær lansering: ansvarlige søkere, arkitekter, småentreprenører i byggebransjen.'),
  P('Sekundær: advokater, regnskapsførere, ingeniørrådgivere, designere, IT-konsulenter.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 2 — Marked og konkurranse
// ════════════════════════════════════════════════════════════════
const DEL2 = [
  H1('Del 2 — Marked og konkurranse'),

  H2('2.1  Funksjonsmatrise — konkurrentanalyse'),
  P('Sammenligning av Sakspilot mot eksisterende løsninger på de syv hovedfunksjonene:'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2400, 1400, 1400, 1400, 1400, 1360],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Løsning', { width: 2400, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Sak-CRM', { width: 1400, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Outlook', { width: 1400, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Passiv timer', { width: 1400, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Lokal mappe', { width: 1400, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Faktura', { width: 1360, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      ...[
        ['Holte / EG ByggSøk', 'Ja (svak)', 'Nei', 'Nei', 'Nei', 'Ja'],
        ['Cordel', 'Ja', 'Nei', 'Nei', 'Nei', 'Ja'],
        ['Visma Severa', 'Ja', 'Delvis', 'Nei', 'Nei', 'Ja'],
        ['SuperOffice + Holte', 'Ja', 'Ja', 'Nei', 'Nei', 'Delvis'],
        ['Memtime / Timely', 'Nei', 'Nei', 'JA', 'Nei', 'Nei'],
        ['Tripletex / Fiken', 'Delvis', 'Nei', 'Nei', 'Nei', 'Ja'],
        ['Procore (intl.)', 'Ja', 'Delvis', 'Nei', 'Delvis', 'Ja'],
        ['SAKSPILOT', 'Ja', 'Ja (kommer)', 'JA', 'Ja', 'Ja'],
      ].map((row, i) => new TableRow({ children: row.map((c, j) => CELL(c, {
        width: [2400, 1400, 1400, 1400, 1400, 1360][j],
        bold: i === 7,
        fill: i === 7 ? GOLD : (i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF'),
        center: j > 0,
        color: i === 7 ? 'FFFFFF' : '222222',
      })) })),
    ],
  }),

  SPACER(),
  CALLOUT('Sakspilot er den eneste norske løsningen som kombinerer passiv vinduslogging med sak-CRM. Risikoen er at Holte/SuperOffice kan kopiere på 12–18 mnd hvis de ser markedstraksjon — vi må kjøre fort og bygge moat via bredde (alle fag, ikke bare bygg) og fagsystem-agnostisme.', RED),

  H2('2.2  Markedsstørrelse (Norge)'),
  BUL('~12 000 enkeltpersonforetak i bygge- og rådgiverbransjen (SSB)'),
  BUL('~8 000 arkitekter, ingeniører, rådgivere i små firma'),
  BUL('~15 000 advokater og regnskapsførere som fakturerer per time'),
  BUL('TAM (total adresserbar marked): ~35 000 selvstendige som passer profilen'),
  BUL('Realistisk fangst i år 1: 0,1 % = 35 brukere (overkommelig)'),
  BUL('Realistisk fangst i år 3: 1 % = 350 brukere = ~225k kr/mnd MRR'),

  H2('2.3  Konkurransefortrinn'),
  NUM('Teknisk: passiv vinduslogging er ikke-trivielt (Windows accessibility API, regex/ML-matching, offline-kø). 6–12 mnd lead på etterkommere.'),
  NUM('Bredde: vi treffer alle fag som fakturerer per time — Holte er låst til byggebransjen.'),
  NUM('Agnostisk: vi krever ikke at brukeren bytter fagsystem. Sakspilot ligger oppå Holte/AutoCAD/Tripletex.'),
  NUM('Pris: 490–790 kr/mnd er under halvparten av Cordel + Memtime + SuperOffice kombinert.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 3 — Produktet
// ════════════════════════════════════════════════════════════════
const DEL3 = [
  H1('Del 3 — Produktet'),

  H2('3.1  To komplementære komponenter'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Desktop-agent (tray-app)', { width: 4680, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Web-app (nettleser)', { width: 4680, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      new TableRow({ children: [
        CELL('Passiv datafangst:\nLogger aktivt vindu hvert 15s i bakgrunnen. Kan "se" alle apper (Word, AutoCAD, Outlook, Holte i browser).\n\nKjører alltid. Ingen UI uten å høyreklikke tray-ikonet.\n\nStart/Stopp arbeidsøkt. Stopp gir Excel-rapport.', { width: 4680, size: 18 }),
        CELL('Datavisning og planlegging:\nViser saker, klienter, tidssammendrag. Setter opp matching-regler. Genererer rapporter for klient og regnskap.\n\nÅpnes ved behov — typisk 1–3 ganger per dag.', { width: 4680, size: 18, fill: GRAY_LIGHT }),
      ]}),
    ],
  }),

  SPACER(),
  CALLOUT('Brukeren trenger BÅDE. Desktop kan ikke kjøre i browser (kan ikke se andre apper). Web kan ikke kjøre som tray-app (begrenset av Chrome-API). De er to halve ting som sammen utgjør et helt produkt.'),

  H2('3.2  De syv hovedfunksjonene'),

  H3('1. Sak-CRM med statusoversikt'),
  P('Hver klientoppdrag er en "sak" med tittel, status, frist, sats, beskrivelse. Kanban-visning: Ikke påbegynt → Pågår → Venter på kunde → Venter på 3.part → Ferdig.'),

  H3('2. Passiv automatisk tidsregistrering ⭐'),
  P('Desktop-agenten logger vindusbytter. For hver "session" (kontinuerlig opphold i samme vindu) sjekker den om vinduet matcher en matching-regel. Match → tid kobles til riktig sak.'),

  H3('3. Outlook-integrasjon (planlagt fase 2)'),
  P('Via Microsoft Graph API: e-poster knyttet til sakens kontaktpersoner samles automatisk på saksvisningen. Svar fra Sakspilot uten å bytte til Outlook.'),

  H3('4. Faktura-grunnlag og eksport'),
  P('Per måned per sak: timer × sats = beløp. Excel-eksport via Stopp arbeidsøkt-knappen. Tripletex/Fiken-integrasjon planlagt fase 2.'),

  H3('5. Tidsfrister med varsler'),
  P('Hver sak har milepæler: innsendt søknad, naboklage-frist, ferdigattest. Varsler 7 + 1 dag før via e-post.'),

  H3('6. Klientregister'),
  P('Sentral oversikt over alle klienter. Standard timesats per klient. Kontaktinformasjon. Saker per klient.'),

  H3('7. Lag OVER eksisterende fagsystem'),
  P('Sakspilot erstatter ikke Holte/AutoCAD/eByggesøk. Den ligger som et workspace-lag oppå. Du fortsetter å levere via Holte, men hele klient- og tidsdimensjonen flyttes til Sakspilot.'),

  H2('3.3  Brukergrensesnitt'),

  H3('Web-app (http://localhost:3001)'),
  BUL('/                — landingsside med funksjonsoversikt'),
  BUL('/registrer       — opprett konto (auto-oppretter organisasjon)'),
  BUL('/login           — innlogging'),
  BUL('/saker           — kanban-oversikt over alle saker, 5 kolonner'),
  BUL('/saker/ny        — opprett ny sak (tittel, klient, frist, sats, mappe)'),
  BUL('/saker/[id]      — detaljvisning: tidssammendrag, matching-regler (med malsystem), frister, status'),
  BUL('/klienter        — tabell med alle klienter'),
  BUL('/klienter/ny     — opprett klient'),

  H3('Desktop-agent (tray-ikon)'),
  P('Høyreklikk-meny endrer seg basert på status:'),
  P('Når INGEN arbeidsøkt:', { italic: true }),
  BUL('📍 Brukernavn'),
  BUL('⏹  Ingen arbeidsøkt — klikk Start for å logge'),
  BUL('▶  Start arbeidsøkt'),
  BUL('Synk / Åpne web / Innstillinger / Logg ut / Avslutt'),
  P('Når ARBEIDSØKT AKTIV:', { italic: true }),
  BUL('📍 Brukernavn'),
  BUL('🟢 Arbeidsøkt aktiv — 23m 14s'),
  BUL('   🎯 Bygdøy 12 — rammetillatelse'),
  BUL('   8 sessions i denne økten'),
  BUL('■  Stopp arbeidsøkt + lag rapport'),
  BUL('⏸  Pause (kort avbrudd)'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 4 — Brukermanual
// ════════════════════════════════════════════════════════════════
const DEL4 = [
  H1('Del 4 — Brukermanual (how-to)'),

  H2('4.1  Førstegangsoppsett (sluttbruker)'),
  P('Når Sakspilot er ferdig som .exe-installer:'),
  NUM('Last ned Sakspilot-Setup-X.X.X.exe fra sakspilot.no'),
  NUM('Dobbeltklikk for å installere (per-user — ingen admin nødvendig)'),
  NUM('Sakspilot starter automatisk + dukker opp i system-tray'),
  NUM('Innstillinger-vindu åpner seg. Klikk "åpne sakspilot.no/registrer" for å opprette konto i nettleser'),
  NUM('Etter registrering: gå tilbake til desktop-vinduet, logg inn med samme e-post + passord'),
  NUM('Lukk vinduet — agenten kjører i bakgrunnen som tray-ikon'),

  H2('4.2  Daglig bruk — typisk arbeidsdag'),

  H3('Morgen — kom i gang'),
  NUM('Åpne sakspilot.no i nettleser (eller klikk "Åpne Sakspilot på web" i tray)'),
  NUM('Sjekk kanban: hvilke saker er aktive? Hva venter på kunde?'),
  NUM('Om du har en ny sak: klikk "+ Ny sak", fyll inn tittel + klient + frist + sats'),
  NUM('Når du er klar til å starte: høyreklikk tray-ikonet → "▶ Start arbeidsøkt"'),

  H3('Underveis — agenten jobber for deg'),
  P('Du fortsetter å jobbe normalt. Agenten logger i bakgrunnen. Hver gang du bytter mellom Word, Outlook, AutoCAD osv. registreres det.'),
  P('For sak-matching: agenten leser vindustittelen. Hvis tittelen matcher en av sakens matching-regler, kobles tiden til den saken.'),

  H3('Trenger en pause? (lunsj, privat-tlf)'),
  P('Høyreklikk tray → "⏸ Pause". Agenten stopper logging midlertidig. Klikk "▶ Fortsett" når du er tilbake. Arbeidsøkten kjører fortsatt — bare logging er pauset.'),

  H3('Slutt av dagen — generer rapport'),
  NUM('Høyreklikk tray → "■ Stopp arbeidsøkt + lag rapport"'),
  NUM('Velg hvor Excel-fila skal lagres (default: Dokumenter-mappa)'),
  NUM('Filnavn auto-genereres: Sakspilot-arbeidsokt-2026-05-27-0830.xlsx'),
  NUM('Etter lagring: klikk "Åpne fil" for å se den, eller "Vis i mappe"'),

  H2('4.3  Sette opp matching-regler — det viktigste steget'),

  P('Uten matching-regler blir all logging "ikke-matchet" og må kategoriseres manuelt. Reglene er det som gjør Sakspilot magisk.'),

  H3('Slik gjør du'),
  NUM('I web-appen, åpne sak-detaljvisningen (klikk på en sak i kanban)'),
  NUM('Scroll ned til seksjonen "Matching-regler for desktop-agent"'),
  NUM('Klikk "⚡ Velg mal" for å se en liste over typiske regler'),
  NUM('Klikk en mal — skjemaet pre-utfylles. Klikk "Lagre regel".'),

  H3('Vanlige maler'),
  BUL_RICH([{ text: '⚡ Auto: match dokumenter med sakens navn ', bold: true }, { text: '— anbefalt for alle saker. Genererer regex fra sakens tittel.' }]),
  BUL_RICH([{ text: '📁 Filer i lokal sak-mappe ', bold: true }, { text: '— hvis du har en dedikert mappe per sak på disk.' }]),
  BUL_RICH([{ text: '📧 Outlook (hele appen) ', bold: true }, { text: '— all tid i Outlook regnes som arbeid på denne saken.' }]),
  BUL_RICH([{ text: '🏢 Holte (smart.holte.no) ', bold: true }, { text: '— tid i Holte-portalen.' }]),

  H3('Eksempel: Bygdøy 12'),
  P('Sak: "Bygdøy 12 — rammetillatelse"'),
  P('Klikk "⚡ Velg mal" → "Auto: match dokumenter med sakens navn" → skjema fylles med:'),
  PRich([{ text: '  Type: Vindustittel', size: 20 }, { text: '\n  Mønster: bygd[øo]y[\\s\\-_]*12', size: 20 }]),
  P('Klikk Lagre. Når desktop-agenten ser et Word-vindu med tittel "Bygdoy-12.docx - Word" → tiden kobles automatisk til Bygdøy-saken. 🎯'),

  H2('4.4  Vanlige problemer og løsninger'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 6240],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Problem', { width: 3120, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Løsning', { width: 6240, bold: true, fill: NAVY, color: 'FFFFFF' }),
      ]}),
      ...[
        ['Tray-ikonet vises ikke', 'Sjekk under "↑ Vis skjulte ikoner" i Windows. Hvis fortsatt borte: restart Sakspilot.'],
        ['Tiden går til "ikke-matchet"', 'Du mangler matching-regler. Åpne saken i web, klikk Velg mal.'],
        ['Word-fil matches ikke', 'Sjekk at filnavnet ditt faktisk inneholder sakens nøkkelord. F.eks. lagre som "Bygdoy-12-notater.docx" istedenfor "notater.docx".'],
        ['Pengebeløp er 0 i sammendrag', 'Du har ikke satt timesats på saken. Åpne saken → endre Timesats.'],
        ['"Kunne ikke koble til serveren"', 'Sjekk at API-en kjører (åpne http://localhost:8001/health i browser).'],
        ['Rapporten er tom', 'Bare sessions ≥ 5 sekunder telles. Hvis du bytter vindu hvert sekund, blir alt filtrert vekk.'],
      ].map(([p, l], i) => new TableRow({ children: [
        CELL(p, { width: 3120, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(l, { width: 6240, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
      ]})),
    ],
  }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 5 — Arkitektur
// ════════════════════════════════════════════════════════════════
const DEL5 = [
  H1('Del 5 — Arkitektur og teknologi'),

  H2('5.1  Tre komponenter'),
  P('Sakspilot består av tre tjenester som snakker over HTTPS:'),
  BUL_RICH([{ text: 'Backend-API: ', bold: true }, { text: 'Express 4 + Prisma 5 + Postgres på Neon (EU/Frankfurt). JWT-auth. Multi-tenant via organizationId.' }]),
  BUL_RICH([{ text: 'Web-app: ', bold: true }, { text: 'Next.js 14 (App Router) + React 18 + TypeScript. Server-side rendering. Inline-styling med design-tokens.' }]),
  BUL_RICH([{ text: 'Desktop-agent: ', bold: true }, { text: 'Electron 30 + get-windows + electron-store + xlsx. Bygges som NSIS-installer for Windows via electron-builder.' }]),

  H2('5.2  Datamodell (Prisma)'),
  BUL('Organization (1) ←→ User (N) — hver bruker eier sin organisasjon ved registrering'),
  BUL('Organization (1) ←→ Client (N) — klientregister per organisasjon'),
  BUL('Client (1) ←→ Sak (N) — saker knyttet til klienter (kan også være interne uten klient)'),
  BUL('Sak (1) ←→ MatchingRule (N) — regex-mønstre som agenten matcher mot'),
  BUL('Sak (1) ←→ Milestone (N) — frister med 7+1 dagers varsel'),
  BUL('Sak (1) ←→ TimeEntry (N) — automatisk-loggede tidsperioder fra agent'),
  BUL('Sak (1) ←→ EmailLink (N) — Outlook-meldinger (kommer fase 2)'),
  BUL('User (1) ←→ AgentSession (N) — sporing av aktive desktop-installasjoner'),
  BUL('Org/User (1) ←→ AuditLog (N) — alle skrive-operasjoner logget'),

  H2('5.3  API-endepunkter (komplette)'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2400, 4680, 2280],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Endepunkt', { width: 2400, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Funksjon', { width: 4680, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Auth', { width: 2280, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      ...[
        ['GET /health', 'Liveness-sjekk (Railway, UptimeRobot)', 'Nei'],
        ['GET /health/db', 'Sjekker at DB svarer', 'Nei'],
        ['POST /auth/register', 'Opprett konto + organisasjon (auto-owner)', 'Nei'],
        ['POST /auth/login', 'E-post + passord → JWT', 'Nei'],
        ['GET  /auth/me', 'Hent innlogget bruker', 'JWT'],
        ['POST /auth/logout', 'Slett cookie', 'Nei'],
        ['POST /auth/change-password', 'Bytt eget passord', 'JWT'],
        ['GET  /saker', 'Liste, filtreres på status/klient', 'JWT'],
        ['POST /saker', 'Opprett ny sak', 'JWT'],
        ['GET  /saker/:id', 'Detaljer (incl. regler + frister)', 'JWT'],
        ['PATCH /saker/:id', 'Oppdater sak', 'JWT'],
        ['DELETE /saker/:id', 'Slett sak (time-entries frikobles)', 'JWT'],
        ['GET  /saker/:id/time-summary', 'Tidsaggregat for sak', 'JWT'],
        ['POST /saker/:id/matching-rules', 'Ny regex-regel for agent', 'JWT'],
        ['DELETE /saker/:id/matching-rules/:rId', 'Slett regel', 'JWT'],
        ['POST /saker/:id/milestones', 'Ny frist', 'JWT'],
        ['PATCH /saker/:id/milestones/:mId/complete', 'Toggle fullført', 'JWT'],
        ['DELETE /saker/:id/milestones/:mId', 'Slett frist', 'JWT'],
        ['GET  /klienter', 'Klientregister', 'JWT'],
        ['POST /klienter', 'Ny klient', 'JWT'],
        ['GET  /klienter/:id', 'Detaljer + tilknyttede saker', 'JWT'],
        ['PATCH /klienter/:id', 'Oppdater klient', 'JWT'],
        ['DELETE /klienter/:id', 'Slett (kun hvis 0 saker)', 'JWT'],
        ['GET  /agent/rules', 'Flat liste regler for desktop-agent', 'JWT'],
        ['POST /agent/sync', 'Batch-opplasting av TimeEntry', 'JWT'],
      ].map(([ep, fn, au], i) => new TableRow({ children: [
        CELL(ep, { width: 2400, size: 16, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(fn, { width: 4680, size: 18, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(au, { width: 2280, size: 16, center: true, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
      ]})),
    ],
  }),

  SPACER(),
  H2('5.4  Sikkerhet og GDPR'),
  BUL('Hosting: Postgres på Neon EU/Frankfurt — ingen data forlater EU/EØS'),
  BUL('Passord: bcrypt 12 rounds (samme som ByggPilot)'),
  BUL('Tokens: JWT 8t levetid, lagret i cookie + localStorage (fallback for cross-site)'),
  BUL('Transport: kun HTTPS/TLS 1.3 i prod, HSTS-headere'),
  BUL('Multi-tenant: alle queries filtreres på organizationId — agent kan ikke skrive til andres saker'),
  BUL('Vinduslogging: KUN tittel + app-navn. Ingen skjermbilder, ingen tastetrykk, ingen innhold'),
  BUL('Brukeren eier ALT — kan eksportere og slette komplett (GDPR art. 15 + 17 — endepunkter kommer fase 2)'),
  BUL('Audit-log på alle skrive-operasjoner'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 6 — Fremdriftsplan
// ════════════════════════════════════════════════════════════════
const DEL6 = [
  H1('Del 6 — Fremdriftsplan'),

  H2('6.1  Statusoversikt — hva er ferdig?'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [800, 5800, 2760],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('', { width: 800, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Funksjon / komponent', { width: 5800, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Status', { width: 2760, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      ...[
        ['1', 'Monorepo-bootstrap (npm workspaces, TypeScript, Prisma)', 'FERDIG'],
        ['2', 'Database-skjema (12 modeller, dekker hele scope)', 'FERDIG'],
        ['3', 'Backend: auth, saker, klienter, milepæler, regler', 'FERDIG'],
        ['4', 'Backend: /agent/rules + /agent/sync (kjernen for agent)', 'FERDIG'],
        ['5', 'Web: landing, login, signup, kanban, klient-CRUD', 'FERDIG'],
        ['6', 'Web: sak-detaljvisning med status-bytte', 'FERDIG'],
        ['7', 'Web: matching-regler med malsystem (Velg mal)', 'FERDIG'],
        ['8', 'Web: milepæler/frister med 7+1d varsler', 'FERDIG'],
        ['9', 'Desktop-POC: bevist at vinduslogging fungerer på Windows', 'FERDIG'],
        ['10', 'Desktop: Electron-app med tray-ikon + meny', 'FERDIG'],
        ['11', 'Desktop: innstillinger-vindu med login', 'FERDIG'],
        ['12', 'Desktop: auto-generert PNG-ikon (uten eksterne avh)', 'FERDIG'],
        ['13', 'Desktop: Start/Stopp arbeidsøkt-modus', 'FERDIG'],
        ['14', 'Desktop: Excel-rapport (xlsx) med 4 ark per arbeidsøkt', 'FERDIG'],
        ['15', 'Sync: desktop sender sessions til /agent/sync hvert 5. min', 'FERDIG'],
        ['16', '.bat-snarveier for én-klikks dev/start/installer', 'FERDIG'],
        ['—', '', ''],
        ['17', 'Bygg .exe-installer (NSIS, Windows x64)', 'PÅGÅR'],
        ['18', 'Frist-varsler via e-post (Brevo HTTP)', 'PLANLAGT (fase 2)'],
        ['19', 'Outlook-integrasjon via Microsoft Graph API', 'PLANLAGT (fase 2)'],
        ['20', 'Tripletex API-integrasjon (faktura-eksport)', 'PLANLAGT (fase 2)'],
        ['21', 'Fiken API-integrasjon (faktura-eksport)', 'PLANLAGT (fase 2)'],
        ['22', 'GDPR-endepunkter (innsyn art. 15, sletting art. 17)', 'PLANLAGT (fase 2)'],
        ['23', 'Sentry feillogging i web + desktop', 'PLANLAGT'],
        ['24', 'Drag-and-drop kanban for statusbytte', 'PLANLAGT'],
        ['25', 'Manuell justering av TimeEntry (omkategoriser)', 'PLANLAGT'],
        ['26', 'Code signing-sertifikat for .exe (ingen SmartScreen)', 'PLANLAGT'],
        ['27', 'Railway-deploy med custom domain (sakspilot.no)', 'PLANLAGT'],
        ['28', 'Pilot med 5 betalende brukere', 'IKKE STARTET'],
      ].map(([n, fn, s], i) => new TableRow({ children: [
        CELL(n, { width: 800, center: true, bold: true, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(fn, { width: 5800, size: 18, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(s, {
          width: 2760, center: true, bold: true, size: 16,
          fill: s === 'FERDIG' ? GREEN : s === 'PÅGÅR' ? GOLD : i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF',
          color: s === 'FERDIG' || s === 'PÅGÅR' ? 'FFFFFF' : GRAY_DARK,
        }),
      ]})),
    ],
  }),

  SPACER(),
  CALLOUT('Punkt 1–16 (16 av 28) = MVP-kjernen er ferdig. Sakspilot er kjørbar lokalt og kan demonstreres til pilotbrukere. Resten er fase 2 (Outlook + regnskap) + produksjonsmodning.', GREEN),

  H2('6.2  Tidslinje fra start til 25 betalende kunder'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [800, 2600, 2200, 1880, 1880],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Fase', { width: 800, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Innhold', { width: 2600, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Varighet', { width: 2200, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Sluttdato (est.)', { width: 1880, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Status', { width: 1880, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      ...[
        ['0', 'Validering — intervju 6–8 personer', '2 uker', '10. juni', 'IKKE STARTET'],
        ['1', 'MVP-kjerne (backend + web + desktop POC)', '6 uker', 'gjort tidlig', 'FERDIG'],
        ['2', 'Outlook + Tripletex/Fiken + polish', '4 uker', '8. juli', 'PÅGÅR'],
        ['3', 'Pilot med 5 betalende brukere (gratis pilotperiode)', '4 uker', '5. august', '—'],
        ['4', 'Soft launch + SEO + 25 kunder', '4 uker', '2. september', '—'],
      ].map((row, i) => new TableRow({ children: row.map((c, j) => CELL(c, {
        width: [800, 2600, 2200, 1880, 1880][j],
        center: j !== 1, bold: j === 0,
        fill: c === 'FERDIG' ? GREEN : c === 'PÅGÅR' ? GOLD : i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF',
        color: c === 'FERDIG' || c === 'PÅGÅR' ? 'FFFFFF' : '222222',
      })) })),
    ],
  }),

  SPACER(),
  P('Hardt GO/NO-GO-punkt etter Fase 0 (validering): minst 4 av 8 intervjuobjekter må si "ja, jeg ville betalt 500+ kr/mnd". Hvis ikke — stopp.'),
  P('Hardt GO/NO-GO-punkt etter Fase 3 (pilot): minst 3 av 5 piloter må konvertere til betalende. Hvis ikke — analyser og pivot.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 7 — Forretningsmodell
// ════════════════════════════════════════════════════════════════
const DEL7 = [
  H1('Del 7 — Forretningsmodell'),

  H2('7.1  Prismodell'),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Plan', { width: 2340, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Solo', { width: 2340, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Pro', { width: 2340, bold: true, fill: GOLD, color: 'FFFFFF', center: true }),
        CELL('Team (5+ brukere)', { width: 2340, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
      ]}),
      new TableRow({ children: [
        CELL('Pris', { width: 2340, bold: true }),
        CELL('490 kr/mnd', { width: 2340, center: true }),
        CELL('790 kr/mnd', { width: 2340, center: true, fill: GRAY_LIGHT }),
        CELL('690 kr/bruker/mnd', { width: 2340, center: true }),
      ]}),
      new TableRow({ children: [
        CELL('Inkludert', { width: 2340, bold: true }),
        CELL('Passiv timer\nSak-CRM\nFaktura CSV', { width: 2340 }),
        CELL('+ Outlook\n+ Regnskap-integrasjon\n+ Flere enheter', { width: 2340, fill: GRAY_LIGHT }),
        CELL('+ Delte saker\n+ Admin-konsoll\n+ SSO', { width: 2340 }),
      ]}),
    ],
  }),

  SPACER(),
  H2('7.2  Inntektsmål'),
  BUL('Mnd 1–4 (pilot): 5 brukere × 0 kr = 0 kr MRR (gratis pilotperiode)'),
  BUL('Mnd 4–8 (soft launch): 25 brukere × 590 kr = 14 750 kr MRR'),
  BUL('Mnd 8–12 (vekst): 75 brukere × 650 kr = 48 750 kr MRR'),
  BUL('Mål 12 mnd: 50 000 kr/mnd ≈ 600 000 kr ARR'),

  H2('7.3  Driftskostnader'),
  P('Estimert ved 100 betalende brukere:'),
  BUL('Hosting (Railway Hobby+): ~300 kr/mnd'),
  BUL('Database (Neon): 0 kr (free tier holder til ~500 brukere)'),
  BUL('E-post (Brevo): 0 kr (gratis 300/dag)'),
  BUL('Microsoft Graph: 0 kr (gratis-kvote)'),
  BUL('Domene: ~20 kr/mnd'),
  BUL('Totalt: ~320 kr/mnd. Bruttomargin: ~99 %.'),

  new Paragraph({ children: [new PageBreak()] }),
];

// ════════════════════════════════════════════════════════════════
// DEL 8 — Risiko
// ════════════════════════════════════════════════════════════════
const DEL8 = [
  H1('Del 8 — Risiko og avhengigheter'),

  H2('8.1  Risikomatrise'),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 1560, 4680],
    rows: [
      new TableRow({ tableHeader: true, children: [
        CELL('Risiko', { width: 3120, bold: true, fill: NAVY, color: 'FFFFFF' }),
        CELL('Sannsynlighet', { width: 1560, bold: true, fill: NAVY, color: 'FFFFFF', center: true }),
        CELL('Mitigasjon', { width: 4680, bold: true, fill: NAVY, color: 'FFFFFF' }),
      ]}),
      ...[
        ['Holte kopierer passiv tidsreg. på 12–18 mnd', 'Middels', 'Bygg moat: bredere markedsposisjon, agnostisk overfor fagsystem, bedre UX'],
        ['Validering (fase 0) feiler — <4/8 vil betale', 'Lav-middels', 'Stopp uten kodeskriving. Tap = 2 uker, ikke 5 mnd'],
        ['Pilot (fase 3) konverterer ikke', 'Middels', 'Sleng pilot 4 uker til, intervju hva som mangler, vurder pivot'],
        ['Windows SmartScreen blokkerer .exe', 'Høy (uten sertifikat)', 'Kjøp code signing-sertifikat (~3000 kr/år) etter første 10 betalende'],
        ['Vinduslogging mistolket som spionvare', 'Middels', 'Tydelig privacy-policy, åpen kildekode-agent, lokal kontroll'],
        ['Microsoft Graph endrer auth-flow', 'Lav', 'Standardisert OAuth, Microsoft bakoverkompatibel'],
        ['Neon free tier ikke nok ved vekst', 'Lav', 'Oppgrader til $19/mnd plan ved 500+ brukere'],
        ['Utvikler-burnout (Helene alene)', 'Middels', 'Hard 40t-grense, hold andre prosjekter på vent, sov 7h+'],
      ].map(([r, s, m], i) => new TableRow({ children: [
        CELL(r, { width: 3120, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(s, { width: 1560, center: true, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
        CELL(m, { width: 4680, fill: i % 2 === 0 ? GRAY_LIGHT : 'FFFFFF' }),
      ]})),
    ],
  }),

  H2('8.2  Forutsetninger som MÅ holde'),
  NUM('Nicole bekrefter interesse + introduserer 3–5 andre intervjuobjekter'),
  NUM('Minst 4/8 intervjuobjekter sier de vil betale 500+ kr/mnd'),
  NUM('Minst 3/5 piloter konverterer til betalende etter pilotperioden'),
  NUM('Helene kan jobbe ~30t/uke på Sakspilot i 5 mnd uten å gå tom'),

  H2('8.3  Hva som ikke er løst ennå'),
  BUL('Hva skjer hvis to brukere i samme org bruker desktop på samme tid? (multi-device-sync)'),
  BUL('Hva med Mac- og Linux-brukere? (kommer etter Windows)'),
  BUL('Hva med team-funksjoner (delte saker, godkjenning av timer)? (Team-plan, fase 3)'),
  BUL('Hva med mobile app for å se status / godkjenne tid? (vurderes fra fase 4)'),
];

// ── Bygg dokumentet ────────────────────────────────────────
const doc = new Document({
  creator: 'Helene Åsheim Grønberg',
  title: 'Sakspilot — Komplett dokumentasjon',
  styles: {
    default: { document: { run: { font: FONT_B, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, color: NAVY, font: FONT_H },
        paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, color: NAVY, font: FONT_H },
        paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: NAVY, font: FONT_H },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering,
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Sakspilot — Komplett dokumentasjon v1.0', size: 18, color: GRAY_DARK, font: FONT_B })] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Side ', size: 18, color: GRAY_DARK, font: FONT_B }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY_DARK, font: FONT_B }),
        new TextRun({ text: ' av ', size: 18, color: GRAY_DARK, font: FONT_B }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: GRAY_DARK, font: FONT_B }),
        new TextRun({ text: '   ·   27. mai 2026   ·   helene.cloud', size: 18, color: GRAY_DARK, font: FONT_B }),
      ]})]}),
    },
    children: [
      ...FORSIDE,
      ...TOC,
      ...DEL1,
      ...DEL2,
      ...DEL3,
      ...DEL4,
      ...DEL5,
      ...DEL6,
      ...DEL7,
      ...DEL8,
    ],
  }],
});

const out = path.join('C:', 'Users', 'helen', 'Desktop', 'sakspilot', 'Sakspilot-Komplett-Dokumentasjon-v1.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf);
  console.log('Skrevet:', out, '(', (buf.length / 1024).toFixed(1), 'KB)');
});
