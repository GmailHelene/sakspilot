/**
 * Demo-seed for Sakspilot.
 *
 * Brukes til å fylle en konto med realistiske dummy-data så man kan
 * demonstrere produktet uten å måtte registrere klienter/saker manuelt.
 *
 * Kjøring:
 *   ORG_ID=<din-org-id> npx tsx packages/db/prisma/seed-demo.ts
 *
 * eller med USER_EMAIL:
 *   USER_EMAIL=du@example.com npx tsx packages/db/prisma/seed-demo.ts
 *
 * Scriptet:
 *   - finner org-id via email eller miljøvariabel
 *   - oppretter 4 klienter, 8 saker (på tvers av status), 12 milepæler,
 *     ~40 time-entries, 5 klistrelapper, 2 agenter
 *   - sletter ingenting — kan kjøres flere ganger trygt (idempotent på navn)
 */
import { PrismaClient, SakStatus, TimeEntrySource, AutomationTrigger, AutomationAction } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_CLIENTS = [
  {
    name: "Nordvik & Co. AS",
    orgNumber: "923 456 789",
    contactEmail: "post@nordvik.no",
    contactPhone: "+47 401 23 456",
    address: "Storgata 12, 0184 Oslo",
    defaultHourlyRate: 1450,
    notes: "Fast retainer-klient. Faktureres siste uke i måneden.",
  },
  {
    name: "Berg Eiendom AS",
    orgNumber: "987 654 321",
    contactEmail: "kontakt@berg-eiendom.no",
    contactPhone: "+47 922 33 444",
    address: "Sjøfronten 7, 4006 Stavanger",
    defaultHourlyRate: 1650,
    notes: "Stor portefølje. Krever detaljerte timeoversikter.",
  },
  {
    name: "Solveig Hansen (privat)",
    orgNumber: null,
    contactEmail: "solveig.hansen@gmail.com",
    contactPhone: "+47 988 77 665",
    address: "Lykkelia 3, 5005 Bergen",
    defaultHourlyRate: 1200,
    notes: "Privatperson. Betaler punktlig.",
  },
  {
    name: "Tindra Studio ENK",
    orgNumber: "918 273 645",
    contactEmail: "hei@tindrastudio.no",
    contactPhone: "+47 478 12 345",
    address: "Verkstedveien 21, 7042 Trondheim",
    defaultHourlyRate: 1350,
    notes: null,
  },
];

const DEMO_SAKER = [
  // Aktive
  { title: "Rebranding 2026", status: SakStatus.pagaaende, clientIdx: 0, days: -14, hourlyRate: null, color: "#3B82F6", desc: "Helhetlig rebranding inkl. logo, retningslinjer og nettside." },
  { title: "Skatteoppgjør 2025", status: SakStatus.pagaaende, clientIdx: 1, days: -7, hourlyRate: 1800, color: "#10B981", desc: "Årlig skatteoppgjør for konsernet." },
  { title: "Webshop-relansering", status: SakStatus.pagaaende, clientIdx: 3, days: -3, hourlyRate: null, color: "#F59E0B", desc: "Migrering fra Shopify til egen WooCommerce." },
  // Ikke påbegynt
  { title: "Kontraktsgjennomgang Q2", status: SakStatus.ikke_pabegynt, clientIdx: 0, days: -1, hourlyRate: null, color: "#8B5CF6", desc: "Gjennomgå nye leverandøravtaler." },
  // Venter
  { title: "Tomtekjøp Bjørgvin", status: SakStatus.venter_kunde, clientIdx: 1, days: -21, hourlyRate: null, color: "#EC4899", desc: "Venter på finansieringstilsagn fra kunde." },
  { title: "Testamente og fremtidsfullmakt", status: SakStatus.venter_3part, clientIdx: 2, days: -30, hourlyRate: null, color: "#F97316", desc: "Sendt til notarius for stempling." },
  // Ferdig
  { title: "Selvangivelse 2025", status: SakStatus.ferdig, clientIdx: 2, days: -45, hourlyRate: null, color: "#06B6D4", desc: "Sluttført. Faktura sendt." },
  { title: "Logo + visittkort", status: SakStatus.ferdig, clientIdx: 3, days: -60, hourlyRate: null, color: "#A855F7", desc: "Levert og fakturert." },
];

const DEMO_MILEPAELER = [
  // For "Rebranding 2026" (sak 0)
  { sakIdx: 0, title: "Levere logo-utkast", offsetDays: 3 },
  { sakIdx: 0, title: "Designreview med kunde", offsetDays: 10 },
  { sakIdx: 0, title: "Endelig levering", offsetDays: 21 },
  // For "Skatteoppgjør 2025" (sak 1)
  { sakIdx: 1, title: "Innhente bilag", offsetDays: 5 },
  { sakIdx: 1, title: "Forelegg utkast til kunde", offsetDays: 12 },
  // For "Webshop-relansering" (sak 2)
  { sakIdx: 2, title: "Produktimport ferdig", offsetDays: 7 },
  { sakIdx: 2, title: "Betalingsløsning testet", offsetDays: 14 },
  { sakIdx: 2, title: "Go-live", offsetDays: 28 },
  // For "Kontraktsgjennomgang Q2" (sak 3)
  { sakIdx: 3, title: "Første utkast", offsetDays: 4 },
  // For "Tomtekjøp Bjørgvin" (sak 4)
  { sakIdx: 4, title: "Underskrift kontrakt", offsetDays: 14 },
  { sakIdx: 4, title: "Overtakelse", offsetDays: 60 },
  // For "Testamente" (sak 5)
  { sakIdx: 5, title: "Notarius-bekreftelse mottatt", offsetDays: 3 },
];

const DEMO_STICKIES = [
  { content: "💡 Husk å spørre Berg om Q2-bilag før møtet onsdag", color: "yellow" },
  { content: "📞 Ring Tindra ang. domeneoverføring", color: "pink" },
  { content: "🎨 Inspirasjon til Nordvik-logo: brutalisme + jordtoner", color: "purple" },
  { content: "📋 Sjekklista for nye klienter:\n☐ NDA\n☐ Engasjementsavtale\n☐ Timesats\n☐ Faktureringsfrekvens", color: "blue" },
  { content: "✅ Sett av tid til skattegrunnlag fredag formiddag", color: "green" },
];

const DEMO_AGENTS = [
  {
    name: "Faktura-påminnelse når sak ferdig",
    trigger: AutomationTrigger.sak_status_changed,
    triggerConfig: { toStatus: "ferdig" },
    action: AutomationAction.create_sticky,
    actionConfig: {
      stickyText: "💰 Send faktura til {clientName} for «{sakTitle}»",
      color: "green",
    },
  },
  {
    name: "Klistrelapp ved ny sak",
    trigger: AutomationTrigger.sak_created,
    triggerConfig: {},
    action: AutomationAction.create_sticky,
    actionConfig: {
      stickyText: "Ny sak: {sakTitle}\n\n☐ Sett timesats\n☐ Lag matching-regel\n☐ Sett frist\n☐ Avtal første møte",
      color: "blue",
    },
  },
];

async function main() {
  console.log("🌱 Sakspilot demo-seed starter…\n");

  // ── Finn org-id ─────────────────────────────────────────────────
  let organizationId = process.env.ORG_ID;
  let userId: string | undefined;

  if (!organizationId && process.env.USER_EMAIL) {
    const user = await prisma.user.findUnique({
      where: { email: process.env.USER_EMAIL },
      select: { id: true, organizationId: true },
    });
    if (!user) throw new Error(`Bruker ikke funnet: ${process.env.USER_EMAIL}`);
    organizationId = user.organizationId;
    userId = user.id;
    console.log(`✓ Fant org via email ${process.env.USER_EMAIL}: ${organizationId}`);
  }

  if (!organizationId) {
    throw new Error(
      "Mangler ORG_ID eller USER_EMAIL miljøvariabel.\n" +
        "Eksempel: USER_EMAIL=du@example.com npx tsx packages/db/prisma/seed-demo.ts"
    );
  }

  // Hent en bruker i org hvis ikke userId er satt
  if (!userId) {
    const u = await prisma.user.findFirst({ where: { organizationId }, select: { id: true } });
    if (!u) throw new Error("Ingen bruker i organisasjonen — kan ikke seede.");
    userId = u.id;
  }

  // ── Klienter ────────────────────────────────────────────────────
  const clientIds: string[] = [];
  for (const c of DEMO_CLIENTS) {
    const existing = await prisma.client.findFirst({
      where: { organizationId, name: c.name },
      select: { id: true },
    });
    if (existing) {
      clientIds.push(existing.id);
      console.log(`  → klient finnes: ${c.name}`);
      continue;
    }
    const created = await prisma.client.create({
      data: { ...c, organizationId },
    });
    clientIds.push(created.id);
    console.log(`  + klient: ${c.name}`);
  }

  // ── Saker ───────────────────────────────────────────────────────
  const sakIds: string[] = [];
  for (const s of DEMO_SAKER) {
    const existing = await prisma.sak.findFirst({
      where: { organizationId, title: s.title },
      select: { id: true },
    });
    if (existing) {
      sakIds.push(existing.id);
      console.log(`  → sak finnes: ${s.title}`);
      continue;
    }
    const createdAt = new Date(Date.now() + s.days * 86400000);
    const closedAt = s.status === SakStatus.ferdig
      ? new Date(createdAt.getTime() + 5 * 86400000)
      : null;
    const created = await prisma.sak.create({
      data: {
        organizationId,
        clientId: clientIds[s.clientIdx],
        title: s.title,
        description: s.desc,
        status: s.status,
        hourlyRate: s.hourlyRate,
        color: s.color,
        createdAt,
        closedAt,
      },
    });
    sakIds.push(created.id);
    console.log(`  + sak: ${s.title} (${s.status})`);
  }

  // ── Milepæler ───────────────────────────────────────────────────
  for (const m of DEMO_MILEPAELER) {
    const existing = await prisma.milestone.findFirst({
      where: { sakId: sakIds[m.sakIdx], title: m.title },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.milestone.create({
      data: {
        sakId: sakIds[m.sakIdx],
        title: m.title,
        dueDate: new Date(Date.now() + m.offsetDays * 86400000),
      },
    });
    console.log(`  + milepæl: ${m.title} (om ${m.offsetDays}d)`);
  }

  // ── Time-entries ────────────────────────────────────────────────
  // Lag ~5 entries per aktive sak (de 3 første) over de siste 14 dagene
  const activeSakIds = sakIds.slice(0, 3);
  const existingEntries = await prisma.timeEntry.count({
    where: { userId, sakId: { in: activeSakIds } },
  });
  if (existingEntries === 0) {
    let added = 0;
    for (const sakId of activeSakIds) {
      for (let i = 0; i < 5; i++) {
        const dayOffset = -Math.floor(Math.random() * 14);
        const startHour = 9 + Math.floor(Math.random() * 6); // 09-15
        const durationMin = 30 + Math.floor(Math.random() * 120); // 30-150 min
        const startedAt = new Date();
        startedAt.setDate(startedAt.getDate() + dayOffset);
        startedAt.setHours(startHour, 0, 0, 0);
        const endedAt = new Date(startedAt.getTime() + durationMin * 60_000);

        await prisma.timeEntry.create({
          data: {
            sakId,
            userId,
            startedAt,
            endedAt,
            durationSec: durationMin * 60,
            source: TimeEntrySource.auto,
            windowTitle: ["VS Code — sak.ts", "Figma — design", "Outlook — Berg Eiendom"][i % 3],
            appName: ["Code.exe", "Figma.exe", "OUTLOOK.EXE"][i % 3],
            billable: true,
            hourlyRate: 1450,
          },
        });
        added++;
      }
    }
    console.log(`  + ${added} time-entries fordelt på ${activeSakIds.length} saker`);
  } else {
    console.log(`  → time-entries finnes (${existingEntries})`);
  }

  // ── Klistrelapper ───────────────────────────────────────────────
  for (const s of DEMO_STICKIES) {
    const existing = await prisma.stickyNote.findFirst({
      where: { organizationId, content: s.content },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.stickyNote.create({
      data: {
        organizationId,
        userId,
        content: s.content,
        color: s.color,
        pinned: false,
      },
    });
    console.log(`  + sticky: ${s.content.split("\n")[0].slice(0, 40)}…`);
  }

  // ── Agenter ─────────────────────────────────────────────────────
  for (const a of DEMO_AGENTS) {
    const existing = await prisma.automation.findFirst({
      where: { organizationId, name: a.name },
      select: { id: true },
    });
    if (existing) {
      console.log(`  → agent finnes: ${a.name}`);
      continue;
    }
    await prisma.automation.create({
      data: {
        organizationId,
        name: a.name,
        trigger: a.trigger,
        triggerConfig: a.triggerConfig,
        action: a.action,
        actionConfig: a.actionConfig,
        enabled: true,
      },
    });
    console.log(`  + agent: ${a.name}`);
  }

  console.log("\n✅ Demo-seed ferdig.");
  console.log(`   Organisasjon: ${organizationId}`);
  console.log(`   Logg inn på sakspilot.no for å se data.`);
}

main()
  .catch((e) => {
    console.error("\n❌ Seed feilet:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
