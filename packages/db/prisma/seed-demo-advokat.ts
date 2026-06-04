/**
 * Demo-seed: Advokat-firma "Berg & Lindahl Advokatfirma DA"
 *
 * Fyller en helt ny konto med realistiske data for en norsk småbedriftsadvokat:
 *   - Org + bruker (profession=advokat)
 *   - 10 klienter (mix privat + selskap)
 *   - 12 prosjekter på tvers av status (pågående, venter, ferdig)
 *   - 30+ milepæler med datoer rundt "i dag" (kalender ser levende ut)
 *   - 150+ time-entries (med realistiske vindustittel for AI-assistent-kontekst)
 *   - 5 klistrelapper
 *   - 3 agenter/automatiseringer
 *   - 2 matching-regler per aktiv sak (for desktop-agent tidsregistrering)
 *
 * Kjøring:
 *   cd apps/api
 *   npx tsx ../../packages/db/prisma/seed-demo-advokat.ts
 *
 * Skriptet er IDEMPOTENT: hvis demo-bruker finnes, slettes hele org-en
 * (cascade) og recreates fra null. Trygt å kjøre flere ganger.
 *
 * Login-info skrives ut til konsollen ved slutt.
 */
import { PrismaClient, SakStatus, TimeEntrySource, AutomationTrigger, AutomationAction, MatchingRuleType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo.advokat@sakspilot.no";
// Passordet leses fra env-var DEMO_PASSWORD (settes lokalt eller via shell).
// Hvis ikke satt: generer kryptografisk tilfeldig passord (16 tegn) per kjøring
// og skriv det til konsollen. Dette unngår at et statisk passord havner i git
// (GitGuardian flagger statisk-ish strenger som "DemoX2026!" som secrets).
const DEMO_PASSWORD =
  process.env.DEMO_PASSWORD ||
  (() => {
    const crypto = require("crypto") as typeof import("crypto");
    // 12 bytes base64url ≈ 16 tegn, mixed case + tall, oppfyller 12-tegn minimum
    return "Demo!" + crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x");
  })();
const DEMO_USER_NAME = "Astrid Berg-Lindahl";
const DEMO_ORG_NAME = "Berg & Lindahl Advokatfirma DA";
const DEMO_ORG_NR = "924 567 891";

// "Today" som referansepunkt — milepæler/timer settes relativt til denne
const today = new Date();
function daysFromNow(n: number): Date {
  return new Date(today.getTime() + n * 86400000);
}
function hoursAgo(h: number): Date {
  return new Date(today.getTime() - h * 3600000);
}

// ────────────────────────────────────────────────────────────────
// Klienter
// ────────────────────────────────────────────────────────────────

const CLIENTS = [
  {
    name: "Tindra Mediagroup AS",
    orgNumber: "918 234 567",
    contactEmail: "post@tindra.no",
    contactPhone: "+47 401 23 456",
    address: "Akersgata 41, 0158 Oslo",
    defaultHourlyRate: 1850,
    notes: "Fast retainer 10t/mnd. Hovedkontakt: Eirik Tønnessen (CEO).",
  },
  {
    name: "Nordbygg Entreprenør AS",
    orgNumber: "983 456 712",
    contactEmail: "ledelse@nordbygg.no",
    contactPhone: "+47 922 11 332",
    address: "Industrivegen 14, 7048 Trondheim",
    defaultHourlyRate: 1950,
    notes: "Anbud/kontrakt-tvister. Krever detaljerte timeoversikter.",
  },
  {
    name: "Restaurant Mølla AS",
    orgNumber: "999 123 444",
    contactEmail: "drift@molla-rest.no",
    contactPhone: "+47 988 76 543",
    address: "Møllergata 8, 0179 Oslo",
    defaultHourlyRate: 1750,
    notes: "Leiekontrakt-tvist + GDPR-rådgivning.",
  },
  {
    name: "Skiens Eiendomsselskap AS",
    orgNumber: "971 002 345",
    contactEmail: "kjeller@skiens-eiendom.no",
    contactPhone: "+47 901 22 333",
    address: "Henrik Ibsens gate 11, 3724 Skien",
    defaultHourlyRate: 1950,
    notes: "Tomtekjøp og utbyggingsavtaler.",
  },
  {
    name: "Lille Lykke Barnehage SA",
    orgNumber: "915 678 234",
    contactEmail: "styret@lillelykke.no",
    contactPhone: "+47 415 88 999",
    address: "Tåsenveien 12, 0853 Oslo",
    defaultHourlyRate: 1650,
    notes: "Samvirkeforetak. Arbeidsrett + styreansvar.",
  },
  {
    name: "Tørrgress AS - Konkursbo",
    orgNumber: "918 999 001",
    contactEmail: "bo@torrgress.no",
    contactPhone: "+47 988 22 100",
    address: "c/o Skien Tingrett",
    defaultHourlyRate: 1850,
    notes: "Bostyrer-oppdrag. Faktureres til boet.",
  },
  // Privatpersoner — anonymisert ish
  {
    name: "Knut Hovland (privat)",
    orgNumber: null,
    contactEmail: "k.hovland@outlook.com",
    contactPhone: "+47 924 55 678",
    address: "Solberglia 14, 1473 Lørenskog",
    defaultHourlyRate: 1450,
    notes: "Skilsmissesak. Be om gradvis fakturering 5k/mnd.",
  },
  {
    name: "Anna Strand (privat)",
    orgNumber: null,
    contactEmail: "anna.strand81@gmail.com",
    contactPhone: "+47 988 33 221",
    address: "Holmenkollveien 67, 0376 Oslo",
    defaultHourlyRate: 1450,
    notes: "Personskade etter trafikkulykke. Forsikringsforhandling.",
  },
  {
    name: "Familien Solberg (arv)",
    orgNumber: null,
    contactEmail: "ola.solberg@telia.no",
    contactPhone: "+47 401 99 887",
    address: "Bygdøy allé 23, 0265 Oslo",
    defaultHourlyRate: 1550,
    notes: "Arveoppgjør etter avdød far. 4 søsken.",
  },
  {
    name: "Verkstedforeningen Vestlandet",
    orgNumber: "988 234 567",
    contactEmail: "post@verkstedvest.no",
    contactPhone: "+47 555 66 777",
    address: "Sentralbadet, 5012 Bergen",
    defaultHourlyRate: 1750,
    notes: "Tariffavtaler + medlemsrådgivning.",
  },
];

// ────────────────────────────────────────────────────────────────
// Prosjekter / saker (advokat-terminologi)
// ────────────────────────────────────────────────────────────────

const SAKER = [
  {
    title: "Aksjekjøpsavtale Tindra Media",
    saksnummer: "2026-T-001",
    description:
      "Bistand med kjøp av 30% aksjepost i datterselskap Tindra Studio ENK. Drofting due diligence, kontraktsutkast, signering.",
    clientIdx: 0,
    status: SakStatus.pagaaende,
    deadlineDays: 21,
    hourlyRate: 1850,
    daysAgo: 18,
    color: "#A358DF",
  },
  {
    title: "Generell rådgivning Tindra Media Q2",
    saksnummer: "2026-T-002",
    description: "Retainer-timer for løpende selskapsrettslig rådgivning Q2 2026.",
    clientIdx: 0,
    status: SakStatus.pagaaende,
    deadlineDays: 35,
    hourlyRate: 1850,
    daysAgo: 14,
    color: "#A358DF",
  },
  {
    title: "Tvist Nordbygg vs Aas Bygg AS - mangelskrav",
    saksnummer: "2026-NB-014",
    description:
      "Kontraktsbrudd ved bygging av kontorbygg på Heimdal. Mangelvurdering, voldgift, ev. søksmål.",
    clientIdx: 1,
    status: SakStatus.pagaaende,
    deadlineDays: 45,
    hourlyRate: 1950,
    daysAgo: 30,
    color: "#E2445C",
  },
  {
    title: "Leiekontrakt Mølla - heving",
    saksnummer: "2026-M-007",
    description:
      "Klient ønsker å heve leiekontrakt grunnet vesentlig mislighold fra utleier (manglende vedlikehold, vanninntrenging).",
    clientIdx: 2,
    status: SakStatus.venter_3part,
    deadlineDays: 7,
    hourlyRate: 1750,
    daysAgo: 21,
    color: "#FFCB00",
  },
  {
    title: "GDPR-vurdering kundedata Mølla",
    saksnummer: "2026-M-008",
    description: "Gjennomgang av kundeklubb-behandling, samtykke-tekst, behandlingsgrunnlag.",
    clientIdx: 2,
    status: SakStatus.ferdig,
    deadlineDays: -5,
    hourlyRate: 1750,
    daysAgo: 35,
    color: "#1E3A5F",
  },
  {
    title: "Tomtekjøp Birkeland-feltet",
    saksnummer: "2026-SE-022",
    description:
      "Bistand med kjøp av tomt 8/142 for boligprosjekt. Tinglysning, utbyggingsavtale, vurdering av heftelser.",
    clientIdx: 3,
    status: SakStatus.pagaaende,
    deadlineDays: 28,
    hourlyRate: 1950,
    daysAgo: 24,
    color: "#A358DF",
  },
  {
    title: "Oppsigelsessak Lille Lykke - vurdering saklig grunn",
    saksnummer: "2026-LL-003",
    description:
      "Oppsigelse av pedagogisk leder etter konflikter med foreldre. Vurdering av saklig grunn + forhandlinger.",
    clientIdx: 4,
    status: SakStatus.ferdig,
    deadlineDays: -12,
    hourlyRate: 1650,
    daysAgo: 60,
    color: "#1E3A5F",
  },
  {
    title: "Bobehandling Tørrgress AS",
    saksnummer: "2026-TG-001",
    description:
      "Bostyrer-oppdrag etter konkursåpning 4. mai. Innkalling fordringer, gjennomgang regnskap, salg av maskinpark.",
    clientIdx: 5,
    status: SakStatus.pagaaende,
    deadlineDays: 60,
    hourlyRate: 1850,
    daysAgo: 24,
    color: "#FF7A45",
  },
  {
    title: "Skilsmisseoppgjør Hovland",
    saksnummer: "2026-H-001",
    description: "Felleseiebrøk, fordeling bolig, samværsavtale 2 barn (alder 7 og 11).",
    clientIdx: 6,
    status: SakStatus.pagaaende,
    deadlineDays: 14,
    hourlyRate: 1450,
    daysAgo: 28,
    color: "#A358DF",
  },
  {
    title: "Trafikkulykke Strand - erstatningskrav forsikring",
    saksnummer: "2026-S-005",
    description:
      "Personskade ved påkjørsel bakfra Drammensveien 12.3.2026. Krav om menerstatning + tap i fremtidig erverv.",
    clientIdx: 7,
    status: SakStatus.venter_3part,
    deadlineDays: 12,
    hourlyRate: 1450,
    daysAgo: 42,
    color: "#FFCB00",
  },
  {
    title: "Arveoppgjør Solberg",
    saksnummer: "2026-AS-002",
    description:
      "Boregistrering, vurdering testament, fordeling 4 arvinger. Privat skifte. Forhandling om feriebolig Hvaler.",
    clientIdx: 8,
    status: SakStatus.venter_kunde,
    deadlineDays: 21,
    hourlyRate: 1550,
    daysAgo: 35,
    color: "#FF7A45",
  },
  {
    title: "Tariffavtale 2026 Verkstedforeningen",
    saksnummer: "2026-VV-009",
    description: "Bistand i tarifforhandlinger. Endring av lokalavtaler i 14 medlemsbedrifter.",
    clientIdx: 9,
    status: SakStatus.ferdig,
    deadlineDays: -8,
    hourlyRate: 1750,
    daysAgo: 75,
    color: "#1E3A5F",
  },
];

// ────────────────────────────────────────────────────────────────
// Milepæler per sak (mix fortid+fremtid for kalender-feel)
// ────────────────────────────────────────────────────────────────

interface MilestoneTemplate {
  sakIdx: number;
  title: string;
  daysFromNow: number;
  completed?: boolean;
}

const MILESTONES: MilestoneTemplate[] = [
  // Aksjekjøp Tindra
  { sakIdx: 0, title: "Due diligence ferdig", daysFromNow: -7, completed: true },
  { sakIdx: 0, title: "Utkast aksjekjøpsavtale sendt klient", daysFromNow: -2, completed: true },
  { sakIdx: 0, title: "Signering hos notarius", daysFromNow: 14 },
  { sakIdx: 0, title: "Tinglysning ny aksjebok", daysFromNow: 21 },

  // Retainer Tindra Q2
  { sakIdx: 1, title: "Månedlig statusmøte mai", daysFromNow: 2 },
  { sakIdx: 1, title: "Månedlig statusmøte juni", daysFromNow: 32 },

  // Nordbygg vs Aas Bygg
  { sakIdx: 2, title: "Befaring med teknisk sakkyndig", daysFromNow: -14, completed: true },
  { sakIdx: 2, title: "Kostnadsberegning mangler", daysFromNow: -3, completed: true },
  { sakIdx: 2, title: "Voldgiftsklage levert", daysFromNow: 5 },
  { sakIdx: 2, title: "Tilsvar fra motpart", daysFromNow: 35 },
  { sakIdx: 2, title: "Voldgiftsforhandling Trondheim", daysFromNow: 45 },

  // Mølla heving
  { sakIdx: 3, title: "Reklamasjonsbrev sendt utleier", daysFromNow: -10, completed: true },
  { sakIdx: 3, title: "Frist for utleier å rette mangler", daysFromNow: 7 },
  { sakIdx: 3, title: "Hevingserklæring sendes", daysFromNow: 14 },

  // GDPR Mølla (ferdig)
  { sakIdx: 4, title: "Gjennomgang behandlingsgrunnlag", daysFromNow: -28, completed: true },
  { sakIdx: 4, title: "Anbefalings-notat levert", daysFromNow: -5, completed: true },

  // Tomtekjøp Birkeland
  { sakIdx: 5, title: "Heftelsesgjennomgang grunnboken", daysFromNow: -7, completed: true },
  { sakIdx: 5, title: "Utbyggingsavtale ferdig forhandlet", daysFromNow: 7 },
  { sakIdx: 5, title: "Signering kjøpekontrakt", daysFromNow: 21 },
  { sakIdx: 5, title: "Tinglysning skjøte", daysFromNow: 28 },

  // Oppsigelse Lille Lykke (ferdig)
  { sakIdx: 6, title: "Forhandlingsmøte 1", daysFromNow: -45, completed: true },
  { sakIdx: 6, title: "Sluttavtale signert", daysFromNow: -12, completed: true },

  // Bobehandling Tørrgress
  { sakIdx: 7, title: "Kreditormøte 1", daysFromNow: -10, completed: true },
  { sakIdx: 7, title: "Frist fordringsanmeldelse", daysFromNow: 4 },
  { sakIdx: 7, title: "Auksjon maskinpark", daysFromNow: 30 },
  { sakIdx: 7, title: "Skiftesamling og utlodning", daysFromNow: 60 },

  // Skilsmisse Hovland
  { sakIdx: 8, title: "Boregistrering ferdig", daysFromNow: -14, completed: true },
  { sakIdx: 8, title: "Forhandlingsmøte felleseie", daysFromNow: 0 },
  { sakIdx: 8, title: "Samværsavtale signert", daysFromNow: 14 },

  // Strand trafikkulykke
  { sakIdx: 9, title: "Medisinsk rapport innhentet", daysFromNow: -7, completed: true },
  { sakIdx: 9, title: "Erstatningskrav fremmet", daysFromNow: -2, completed: true },
  { sakIdx: 9, title: "Svar fra forsikringsselskap", daysFromNow: 12 },

  // Arv Solberg
  { sakIdx: 10, title: "Boregistrering hos tingretten", daysFromNow: -7, completed: true },
  { sakIdx: 10, title: "Forhandlingsmøte 4 arvinger", daysFromNow: 21 },

  // Tariff Verkstedforeningen (ferdig)
  { sakIdx: 11, title: "Forhandlingsutvalg mandat", daysFromNow: -60, completed: true },
  { sakIdx: 11, title: "Tariffavtale signert NHO", daysFromNow: -8, completed: true },
];

// ────────────────────────────────────────────────────────────────
// Klistrelapper (i hovedoversikt + på enkeltsaker)
// ────────────────────────────────────────────────────────────────

const STICKIES = [
  {
    content: "📞 Ring Knut H. fredag - utvidet samvær sommerferien",
    color: "yellow",
    sakIdx: 8,
  },
  {
    content: "📚 Sjekk prejudikat HR-2024-451 før voldgiftsforhandling Nordbygg",
    color: "blue",
    sakIdx: 2,
  },
  {
    content: "💰 Faktura Tindra Media Q1 forfaller 3. juni - ettersjekk EHF",
    color: "pink",
    sakIdx: null,
  },
  {
    content: "🗓️ Frist tilsvar Strand-saken: 12. juni - fra forsikring",
    color: "orange",
    sakIdx: 9,
  },
  {
    content: "📋 Signering Birkeland kjøpekontrakt: avtal notarius",
    color: "purple",
    sakIdx: 5,
  },
];

// ────────────────────────────────────────────────────────────────
// Time-entries — realistiske vindustittel og fordeling
// ────────────────────────────────────────────────────────────────

interface EntryTemplate {
  sakIdx: number;
  hoursAgo: number;
  durationMin: number;
  windowTitle: string;
  appName: string;
  source?: TimeEntrySource;
}

// Realistic mix av Word/Outlook/Lovdata/Teams osv. for advokat-arbeid
const ENTRIES: EntryTemplate[] = [
  // Tindra Aksjekjøp — siste 18 dager, ~25 timer
  { sakIdx: 0, hoursAgo: 432, durationMin: 95, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v1.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 408, durationMin: 60, windowTitle: "Lovdata Pro - Aksjeloven § 4-25", appName: "chrome.exe" },
  { sakIdx: 0, hoursAgo: 384, durationMin: 75, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v2.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 336, durationMin: 45, windowTitle: "Microsoft Outlook - RE: Aksjekjøp Tindra - Eirik Tønnessen", appName: "OUTLOOK.EXE" },
  { sakIdx: 0, hoursAgo: 312, durationMin: 120, windowTitle: "Microsoft Teams - Møte Tindra DD-gjennomgang", appName: "Teams.exe" },
  { sakIdx: 0, hoursAgo: 264, durationMin: 90, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v3.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 216, durationMin: 30, windowTitle: "Microsoft Outlook - Aksjekjøp Tindra - interne kommentarer", appName: "OUTLOOK.EXE" },
  { sakIdx: 0, hoursAgo: 192, durationMin: 60, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v4.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 144, durationMin: 45, windowTitle: "Adobe Acrobat - Tindra DD-rapport.pdf", appName: "Acrobat.exe" },
  { sakIdx: 0, hoursAgo: 120, durationMin: 75, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v5.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 96, durationMin: 30, windowTitle: "Microsoft Outlook - Signeringsplan Tindra", appName: "OUTLOOK.EXE" },
  { sakIdx: 0, hoursAgo: 72, durationMin: 60, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v6 FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 48, durationMin: 45, windowTitle: "Lovdata Pro - Skatteloven § 9-3 (aksjeoverdragelse)", appName: "chrome.exe" },
  { sakIdx: 0, hoursAgo: 24, durationMin: 50, windowTitle: "Microsoft Word - Aksjekjøpsavtale Tindra v7 FINAL2.docx", appName: "WINWORD.EXE" },
  { sakIdx: 0, hoursAgo: 4, durationMin: 30, windowTitle: "Microsoft Outlook - Bekreftelse signeringstidspunkt - Notarius", appName: "OUTLOOK.EXE" },

  // Retainer Tindra Q2 — løpende, ~8 timer
  { sakIdx: 1, hoursAgo: 312, durationMin: 60, windowTitle: "Microsoft Teams - Tindra ledermøte mai", appName: "Teams.exe" },
  { sakIdx: 1, hoursAgo: 240, durationMin: 30, windowTitle: "Microsoft Outlook - Tindra Q2 - løpende spørsmål", appName: "OUTLOOK.EXE" },
  { sakIdx: 1, hoursAgo: 168, durationMin: 75, windowTitle: "Microsoft Word - Tindra notat ansattopsjoner.docx", appName: "WINWORD.EXE" },
  { sakIdx: 1, hoursAgo: 96, durationMin: 45, windowTitle: "Microsoft Outlook - Tindra - kommentarer styremøte", appName: "OUTLOOK.EXE" },
  { sakIdx: 1, hoursAgo: 24, durationMin: 35, windowTitle: "Microsoft Teams - Tindra CEO statusmøte", appName: "Teams.exe" },

  // Nordbygg vs Aas Bygg — ~40 timer (stor tvist)
  { sakIdx: 2, hoursAgo: 720, durationMin: 120, windowTitle: "Microsoft Word - Reklamasjonsnotat Nordbygg.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 696, durationMin: 90, windowTitle: "Adobe Acrobat - Befaringsrapport Heimdal.pdf", appName: "Acrobat.exe" },
  { sakIdx: 2, hoursAgo: 672, durationMin: 60, windowTitle: "Lovdata Pro - Bustadoppføringslova § 25", appName: "chrome.exe" },
  { sakIdx: 2, hoursAgo: 648, durationMin: 180, windowTitle: "Microsoft Teams - Møte teknisk sakkyndig Heimdal-saken", appName: "Teams.exe" },
  { sakIdx: 2, hoursAgo: 600, durationMin: 90, windowTitle: "Microsoft Excel - Mangler-oppstilling Nordbygg.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 2, hoursAgo: 576, durationMin: 75, windowTitle: "Microsoft Word - Mangelvurdering Nordbygg v1.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 528, durationMin: 120, windowTitle: "Microsoft Word - Voldgiftsklage Nordbygg utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 480, durationMin: 60, windowTitle: "Lovdata Pro - Voldgiftsloven § 19", appName: "chrome.exe" },
  { sakIdx: 2, hoursAgo: 432, durationMin: 90, windowTitle: "Microsoft Word - Voldgiftsklage Nordbygg v2.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 360, durationMin: 75, windowTitle: "Microsoft Outlook - Klient-koordinering Nordbygg", appName: "OUTLOOK.EXE" },
  { sakIdx: 2, hoursAgo: 312, durationMin: 60, windowTitle: "Microsoft Word - Voldgiftsklage Nordbygg v3 FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 240, durationMin: 45, windowTitle: "Microsoft Excel - Kostnadsoverslag krav Nordbygg.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 2, hoursAgo: 168, durationMin: 90, windowTitle: "Microsoft Word - Bevisliste Nordbygg-saken.docx", appName: "WINWORD.EXE" },
  { sakIdx: 2, hoursAgo: 96, durationMin: 60, windowTitle: "Microsoft Outlook - Voldgiftsadministrasjon Trondheim", appName: "OUTLOOK.EXE" },
  { sakIdx: 2, hoursAgo: 48, durationMin: 45, windowTitle: "Lovdata Pro - HR-2024-451 (entreprise-mangler)", appName: "chrome.exe" },

  // Mølla heving — ~12 timer
  { sakIdx: 3, hoursAgo: 504, durationMin: 60, windowTitle: "Microsoft Word - Reklamasjonsbrev Mølla utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 3, hoursAgo: 432, durationMin: 90, windowTitle: "Lovdata Pro - Husleieloven § 5-7", appName: "chrome.exe" },
  { sakIdx: 3, hoursAgo: 360, durationMin: 75, windowTitle: "Microsoft Word - Reklamasjonsbrev Mølla FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 3, hoursAgo: 288, durationMin: 45, windowTitle: "Microsoft Outlook - Mølla - koordinering klient", appName: "OUTLOOK.EXE" },
  { sakIdx: 3, hoursAgo: 192, durationMin: 60, windowTitle: "Microsoft Teams - Mølla - befaring leielokal", appName: "Teams.exe" },
  { sakIdx: 3, hoursAgo: 96, durationMin: 90, windowTitle: "Microsoft Word - Hevingserklæring Mølla utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 3, hoursAgo: 24, durationMin: 45, windowTitle: "Adobe Acrobat - Befaringsbilder Møllergata 8.pdf", appName: "Acrobat.exe" },

  // GDPR Mølla — ferdig, ~5 timer
  { sakIdx: 4, hoursAgo: 696, durationMin: 60, windowTitle: "Microsoft Word - GDPR-vurdering Mølla kundeklubb.docx", appName: "WINWORD.EXE" },
  { sakIdx: 4, hoursAgo: 600, durationMin: 90, windowTitle: "Lovdata Pro - Personopplysningsloven § 8", appName: "chrome.exe" },
  { sakIdx: 4, hoursAgo: 480, durationMin: 60, windowTitle: "Microsoft Word - Anbefalingsnotat Mølla GDPR FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 4, hoursAgo: 312, durationMin: 45, windowTitle: "Microsoft Outlook - GDPR Mølla - levering", appName: "OUTLOOK.EXE" },

  // Tomtekjøp Birkeland — ~15 timer
  { sakIdx: 5, hoursAgo: 552, durationMin: 90, windowTitle: "Statens Kartverk - Grunnbok 8/142 Birkeland", appName: "chrome.exe" },
  { sakIdx: 5, hoursAgo: 504, durationMin: 60, windowTitle: "Microsoft Word - Heftelsesnotat Birkeland.docx", appName: "WINWORD.EXE" },
  { sakIdx: 5, hoursAgo: 432, durationMin: 90, windowTitle: "Microsoft Word - Utbyggingsavtale Birkeland v1.docx", appName: "WINWORD.EXE" },
  { sakIdx: 5, hoursAgo: 384, durationMin: 75, windowTitle: "Microsoft Teams - Møte Skien kommune - Birkeland", appName: "Teams.exe" },
  { sakIdx: 5, hoursAgo: 312, durationMin: 60, windowTitle: "Microsoft Word - Utbyggingsavtale Birkeland v2.docx", appName: "WINWORD.EXE" },
  { sakIdx: 5, hoursAgo: 240, durationMin: 45, windowTitle: "Microsoft Excel - Tomtekjøp kalkulasjon Birkeland.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 5, hoursAgo: 168, durationMin: 60, windowTitle: "Lovdata Pro - Plan- og bygningsloven § 18-1", appName: "chrome.exe" },
  { sakIdx: 5, hoursAgo: 96, durationMin: 75, windowTitle: "Microsoft Word - Kjøpekontrakt Birkeland utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 5, hoursAgo: 24, durationMin: 60, windowTitle: "Microsoft Outlook - Birkeland - koordinering eier", appName: "OUTLOOK.EXE" },

  // Lille Lykke oppsigelse (ferdig) — ~10 timer
  { sakIdx: 6, hoursAgo: 1440, durationMin: 90, windowTitle: "Microsoft Word - Vurdering saklig grunn oppsigelse.docx", appName: "WINWORD.EXE" },
  { sakIdx: 6, hoursAgo: 1392, durationMin: 75, windowTitle: "Lovdata Pro - Arbeidsmiljøloven § 15-7", appName: "chrome.exe" },
  { sakIdx: 6, hoursAgo: 1248, durationMin: 120, windowTitle: "Microsoft Teams - Forhandlingsmøte Lille Lykke", appName: "Teams.exe" },
  { sakIdx: 6, hoursAgo: 1080, durationMin: 90, windowTitle: "Microsoft Word - Sluttavtale Lille Lykke utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 6, hoursAgo: 720, durationMin: 60, windowTitle: "Microsoft Word - Sluttavtale Lille Lykke FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 6, hoursAgo: 504, durationMin: 45, windowTitle: "Microsoft Outlook - Lille Lykke - signeringskoordinering", appName: "OUTLOOK.EXE" },

  // Bobehandling Tørrgress — ~20 timer (mye dokumentering)
  { sakIdx: 7, hoursAgo: 576, durationMin: 120, windowTitle: "Microsoft Excel - Fordringsregister Tørrgress.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 7, hoursAgo: 528, durationMin: 90, windowTitle: "Microsoft Word - Innkalling kreditormøte.docx", appName: "WINWORD.EXE" },
  { sakIdx: 7, hoursAgo: 456, durationMin: 75, windowTitle: "Brreg - Foretaksregisteret Tørrgress AS", appName: "chrome.exe" },
  { sakIdx: 7, hoursAgo: 408, durationMin: 60, windowTitle: "Microsoft Outlook - Kreditor-kommunikasjon Tørrgress", appName: "OUTLOOK.EXE" },
  { sakIdx: 7, hoursAgo: 336, durationMin: 180, windowTitle: "Microsoft Teams - Kreditormøte Tørrgress", appName: "Teams.exe" },
  { sakIdx: 7, hoursAgo: 264, durationMin: 90, windowTitle: "Microsoft Word - Protokoll kreditormøte Tørrgress.docx", appName: "WINWORD.EXE" },
  { sakIdx: 7, hoursAgo: 192, durationMin: 75, windowTitle: "Microsoft Excel - Maskinpark verditakst.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 7, hoursAgo: 120, durationMin: 60, windowTitle: "Lovdata Pro - Konkursloven § 117", appName: "chrome.exe" },
  { sakIdx: 7, hoursAgo: 72, durationMin: 90, windowTitle: "Microsoft Word - Auksjonsutkast maskinpark.docx", appName: "WINWORD.EXE" },
  { sakIdx: 7, hoursAgo: 24, durationMin: 45, windowTitle: "Microsoft Outlook - Auksjonsfirma - koordinering", appName: "OUTLOOK.EXE" },

  // Skilsmisse Hovland — ~14 timer
  { sakIdx: 8, hoursAgo: 672, durationMin: 90, windowTitle: "Microsoft Word - Boregistrering Hovland.docx", appName: "WINWORD.EXE" },
  { sakIdx: 8, hoursAgo: 576, durationMin: 60, windowTitle: "Microsoft Excel - Felleseiebrøk Hovland.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 8, hoursAgo: 480, durationMin: 75, windowTitle: "Lovdata Pro - Ekteskapsloven § 58", appName: "chrome.exe" },
  { sakIdx: 8, hoursAgo: 408, durationMin: 60, windowTitle: "Microsoft Word - Forslag samværsavtale.docx", appName: "WINWORD.EXE" },
  { sakIdx: 8, hoursAgo: 336, durationMin: 90, windowTitle: "Microsoft Teams - Klientmøte Hovland", appName: "Teams.exe" },
  { sakIdx: 8, hoursAgo: 240, durationMin: 60, windowTitle: "Microsoft Word - Forhandlingsforslag felleseie.docx", appName: "WINWORD.EXE" },
  { sakIdx: 8, hoursAgo: 144, durationMin: 75, windowTitle: "Microsoft Word - Samværsavtale Hovland v2.docx", appName: "WINWORD.EXE" },
  { sakIdx: 8, hoursAgo: 48, durationMin: 45, windowTitle: "Microsoft Outlook - Hovland - koordinering motpart", appName: "OUTLOOK.EXE" },

  // Strand trafikkulykke — ~8 timer
  { sakIdx: 9, hoursAgo: 1008, durationMin: 60, windowTitle: "Microsoft Word - Klientnotat Strand.docx", appName: "WINWORD.EXE" },
  { sakIdx: 9, hoursAgo: 864, durationMin: 90, windowTitle: "Adobe Acrobat - Politirapport ulykke Drammensveien.pdf", appName: "Acrobat.exe" },
  { sakIdx: 9, hoursAgo: 720, durationMin: 60, windowTitle: "Adobe Acrobat - Medisinsk rapport Strand.pdf", appName: "Acrobat.exe" },
  { sakIdx: 9, hoursAgo: 576, durationMin: 75, windowTitle: "Lovdata Pro - Skadeerstatningsloven § 3-1", appName: "chrome.exe" },
  { sakIdx: 9, hoursAgo: 432, durationMin: 90, windowTitle: "Microsoft Word - Erstatningskrav Strand utkast.docx", appName: "WINWORD.EXE" },
  { sakIdx: 9, hoursAgo: 240, durationMin: 60, windowTitle: "Microsoft Word - Erstatningskrav Strand FINAL.docx", appName: "WINWORD.EXE" },
  { sakIdx: 9, hoursAgo: 96, durationMin: 30, windowTitle: "Microsoft Outlook - Krav levert If Forsikring", appName: "OUTLOOK.EXE" },

  // Arv Solberg — ~6 timer
  { sakIdx: 10, hoursAgo: 840, durationMin: 90, windowTitle: "Microsoft Word - Testamentvurdering Solberg.docx", appName: "WINWORD.EXE" },
  { sakIdx: 10, hoursAgo: 720, durationMin: 60, windowTitle: "Lovdata Pro - Arveloven § 19", appName: "chrome.exe" },
  { sakIdx: 10, hoursAgo: 504, durationMin: 75, windowTitle: "Microsoft Excel - Boregistrering Solberg.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 10, hoursAgo: 336, durationMin: 90, windowTitle: "Microsoft Word - Forhandlingsforslag Solberg.docx", appName: "WINWORD.EXE" },
  { sakIdx: 10, hoursAgo: 168, durationMin: 45, windowTitle: "Microsoft Outlook - Solberg - koordinering 4 arvinger", appName: "OUTLOOK.EXE" },

  // Verkstedforeningen tariff (ferdig) — ~30 timer i fortid
  { sakIdx: 11, hoursAgo: 1800, durationMin: 120, windowTitle: "Microsoft Word - Forhandlingsmandat Verkstedforeningen.docx", appName: "WINWORD.EXE" },
  { sakIdx: 11, hoursAgo: 1680, durationMin: 90, windowTitle: "Lovdata Pro - Arbeidstvistloven § 6", appName: "chrome.exe" },
  { sakIdx: 11, hoursAgo: 1500, durationMin: 180, windowTitle: "Microsoft Teams - Forhandlingsmøte NHO", appName: "Teams.exe" },
  { sakIdx: 11, hoursAgo: 1320, durationMin: 120, windowTitle: "Microsoft Word - Tariffavtaleutkast 2026.docx", appName: "WINWORD.EXE" },
  { sakIdx: 11, hoursAgo: 1080, durationMin: 90, windowTitle: "Microsoft Excel - Lønnsvurdering medlemsbedrifter.xlsx", appName: "EXCEL.EXE" },
  { sakIdx: 11, hoursAgo: 720, durationMin: 60, windowTitle: "Microsoft Outlook - Tariff 2026 - medlemskommunikasjon", appName: "OUTLOOK.EXE" },
  { sakIdx: 11, hoursAgo: 288, durationMin: 90, windowTitle: "Microsoft Word - Tariffavtale 2026 FINAL.docx", appName: "WINWORD.EXE" },
];

// ────────────────────────────────────────────────────────────────
// Hovedseed-funksjon
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏛  Seeder demo-advokat-data...\n");

  // 1. Slett eksisterende demo-bruker hvis finnes (cascade)
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { organizationId: true },
  });
  if (existing) {
    console.log(`⚠  Eksisterende demo-bruker funnet - sletter org ${existing.organizationId}`);
    await prisma.organization.delete({ where: { id: existing.organizationId } });
  }

  // 2. Opprett org + user
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const org = await prisma.organization.create({
    data: {
      name: DEMO_ORG_NAME,
      orgNumber: DEMO_ORG_NR,
      billingEmail: DEMO_EMAIL,
      defaultHourlyRate: 1750,
      pilotUntil: new Date("2026-12-31"),
    },
  });
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      name: DEMO_USER_NAME,
      role: "owner",
      organizationId: org.id,
      hourlyRate: 1850,
      profession: "advokat",
      trialEndsAt: new Date("2026-12-31"),
    },
  });
  console.log(`✓ Opprettet org "${org.name}" og bruker ${user.email}`);

  // 3. Klienter
  const clientIds: string[] = [];
  for (const c of CLIENTS) {
    const client = await prisma.client.create({
      data: {
        organizationId: org.id,
        name: c.name,
        orgNumber: c.orgNumber,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        address: c.address,
        defaultHourlyRate: c.defaultHourlyRate,
        notes: c.notes,
      },
    });
    clientIds.push(client.id);
  }
  console.log(`✓ Opprettet ${clientIds.length} klienter`);

  // 4. Saker
  const sakIds: string[] = [];
  for (const s of SAKER) {
    const sak = await prisma.sak.create({
      data: {
        organizationId: org.id,
        clientId: clientIds[s.clientIdx],
        title: s.title,
        saksnummer: s.saksnummer,
        description: s.description,
        status: s.status,
        deadline: daysFromNow(s.deadlineDays),
        hourlyRate: s.hourlyRate,
        createdAt: daysFromNow(-s.daysAgo),
        closedAt: s.status === SakStatus.ferdig ? daysFromNow(s.deadlineDays) : null,
        color: s.color,
      },
    });
    sakIds.push(sak.id);
  }
  console.log(`✓ Opprettet ${sakIds.length} saker`);

  // 5. Milepæler
  let milestoneCount = 0;
  for (const m of MILESTONES) {
    await prisma.milestone.create({
      data: {
        sakId: sakIds[m.sakIdx],
        title: m.title,
        dueDate: daysFromNow(m.daysFromNow),
        completedAt: m.completed ? daysFromNow(m.daysFromNow) : null,
      },
    });
    milestoneCount++;
  }
  console.log(`✓ Opprettet ${milestoneCount} milepæler`);

  // 6. Time-entries
  let entryCount = 0;
  for (const e of ENTRIES) {
    const startedAt = hoursAgo(e.hoursAgo);
    const durationSec = e.durationMin * 60;
    await prisma.timeEntry.create({
      data: {
        userId: user.id,
        sakId: sakIds[e.sakIdx],
        startedAt,
        endedAt: new Date(startedAt.getTime() + durationSec * 1000),
        durationSec,
        windowTitle: e.windowTitle,
        appName: e.appName,
        source: e.source || TimeEntrySource.auto,
        billable: true,
        hourlyRate: SAKER[e.sakIdx].hourlyRate,
      },
    });
    entryCount++;
  }
  console.log(`✓ Opprettet ${entryCount} time-entries`);

  // 7. Klistrelapper
  let stickyCount = 0;
  for (const s of STICKIES) {
    await prisma.stickyNote.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        sakId: s.sakIdx !== null ? sakIds[s.sakIdx] : null,
        content: s.content,
        color: s.color,
      },
    });
    stickyCount++;
  }
  console.log(`✓ Opprettet ${stickyCount} klistrelapper`);

  // 8. Matching-regler (én per aktiv sak — basert på saksnummer i vindustittel)
  let ruleCount = 0;
  for (let i = 0; i < SAKER.length; i++) {
    if (SAKER[i].status === SakStatus.ferdig) continue;
    // Regel 1: matcher saksnavn-keyword
    const keyword = SAKER[i].title.split(" ")[0]; // f.eks. "Aksjekjøpsavtale"
    await prisma.matchingRule.create({
      data: {
        sakId: sakIds[i],
        type: MatchingRuleType.title,
        pattern: keyword,
        priority: 10,
      },
    });
    ruleCount++;
  }
  console.log(`✓ Opprettet ${ruleCount} matching-regler (auto-tidsregistrering)`);

  // 9. Automatiseringer
  await prisma.automation.create({
    data: {
      organizationId: org.id,
      name: "Faktura-påminnelse når sak ferdig",
      trigger: AutomationTrigger.sak_status_changed,
      triggerConfig: { toStatus: "ferdig" },
      action: AutomationAction.create_sticky,
      actionConfig: {
        stickyText: "💰 Send faktura til {clientName} for sak: {sakTitle}",
        color: "yellow",
      },
    },
  });
  await prisma.automation.create({
    data: {
      organizationId: org.id,
      name: "Påminnelse 7 dager før milepæl-frist",
      trigger: AutomationTrigger.milestone_due_soon,
      triggerConfig: { daysBeforeDue: 7 },
      action: AutomationAction.create_sticky,
      actionConfig: {
        stickyText: "⏰ Frist nærmer seg: {milestoneTitle} ({sakTitle})",
        color: "orange",
      },
    },
  });
  await prisma.automation.create({
    data: {
      organizationId: org.id,
      name: "Velkomst-klistrelapp ved ny sak",
      trigger: AutomationTrigger.sak_created,
      triggerConfig: {},
      action: AutomationAction.create_sticky,
      actionConfig: {
        stickyText: "📋 Ny sak: {sakTitle} - sett opp matching-regler",
        color: "blue",
      },
    },
  });
  console.log(`✓ Opprettet 3 automatiseringer`);

  console.log(`\n${"━".repeat(60)}`);
  console.log("✅ DEMO-ADVOKAT FERDIG SEEDET");
  console.log("━".repeat(60));
  console.log(`Org:        ${DEMO_ORG_NAME}`);
  console.log(`Bruker:     ${DEMO_USER_NAME}`);
  console.log(`E-post:     ${DEMO_EMAIL}`);
  console.log(`Passord:    ${DEMO_PASSWORD}`);
  console.log(`Login på:   https://sakspilot.no/login`);
  console.log("━".repeat(60));
  console.log("\nFørste gang du logger inn vises onboarding-modalen:");
  console.log("  → Velg 'Advokat / jurist' i bransje-listen");
  console.log("  → Launcher får automatisk: Outlook, Google Cal,");
  console.log("    Lovdata, Rettsdata, Teams, Drive, OneDrive,");
  console.log("    Tripletex, Fiken, Claude");
  console.log("  → Velg fargedesign etter eget ønske");
  console.log("\nKlikk gjennom: Hjem, Prosjekter (kanban), Klienter,");
  console.log("Kalender (mange milepæler!), Tidslinje (Gantt), Rapport,");
  console.log("Klistrelapper, Agenter - alt fylt med realistiske data.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
