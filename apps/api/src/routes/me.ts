/**
 * /me-routes — bruker-konto, GDPR, sikkerhet.
 *
 *   GET    /me/export   — full data-eksport (GDPR art. 15 — innsynsrett)
 *   POST   /me/delete   — slett konto + all data (GDPR art. 17 — sletteplikt)
 *   GET    /me/sessions — aktive desktop-agent-sesjoner
 *   GET    /me/audit    — siste 50 audit-log-entries for innloggings-bruker
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { verifyPassword } from "../services/auth";

const router = Router();
router.use(requireAuth);

// ── Profession (bransje) — settes ved onboarding ─────────────────

const ProfessionSchema = z.enum([
  "it_konsulent",
  "konsulent_annet",
  "ansvarlig_soker",
  "advokat",
  "regnskap",
  "designer",
  "arkitekt",
  "lege_psykolog",
  "annet",
]);

router.get("/profile", async (req: Request, res: Response) => {
  const session = req.session!;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      profession: true,
      trialEndsAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          plan: true,
          pilotUntil: true,
        },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "Bruker ikke funnet" });
  return res.json(user);
});

router.patch("/profile", async (req: Request, res: Response) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(120).optional(),
      profession: ProfessionSchema.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input" });
  }
  const session = req.session!;
  const user = await prisma.user.update({
    where: { id: session.userId },
    data: parsed.data,
    select: { id: true, name: true, profession: true },
  });
  return res.json(user);
});

/**
 * GET /me/export
 * Returnerer ALL data om innloggets bruker som strukturert JSON.
 * Brukes som "Last ned mine data"-knapp i Sikkerhet-fanen.
 */
router.get("/export", async (req: Request, res: Response) => {
  const { userId, organizationId } = req.session!;

  const [
    user, organization, clients, saker, timeEntries, stickyNotes,
    agentSessions, auditLogs, foresporsler, invoices, utgifter,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.client.findMany({ where: { organizationId } }),
    prisma.sak.findMany({
      where: { organizationId },
      include: { matchingRules: true, milestones: true },
    }),
    prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 5000, // grense — eksporter siste 5000 entries
    }),
    prisma.stickyNote.findMany({ where: { organizationId } }),
    prisma.agentSession.findMany({ where: { userId } }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    // ── Modeller lagt til i juni 2026 ───────────────────────────
    prisma.foresporsel.findMany({ where: { organizationId } }),
    prisma.invoice.findMany({
      where: { organizationId },
      include: { timeEntries: { select: { id: true } } },  // bare ID-er — full timeEntry-data er allerede i seksjonen over
    }),
    prisma.utgift.findMany({ where: { organizationId } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    notice: "Dette er en komplett eksport av dine data fra Sakspilot, generert i henhold til GDPR art. 15 (innsynsrett).",
    user: user ? { ...user, passwordHash: "[redacted]" } : null,
    organization,
    clients,
    saker,
    timeEntries,
    stickyNotes,
    agentSessions,
    auditLogs,
    foresporsler,
    invoices,
    utgifter,
    counts: {
      clients: clients.length,
      saker: saker.length,
      timeEntries: timeEntries.length,
      stickyNotes: stickyNotes.length,
      agentSessions: agentSessions.length,
      auditLogs: auditLogs.length,
      foresporsler: foresporsler.length,
      invoices: invoices.length,
      utgifter: utgifter.length,
    },
  };

  // Audit-log eksporten
  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action: "user.data_exported",
      entityType: "user",
      entityId: userId,
    },
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sakspilot-data-eksport-${new Date().toISOString().slice(0, 10)}.json"`
  );
  return res.send(JSON.stringify(exportData, null, 2));
});

/**
 * POST /me/delete
 * Sletter all data tilknyttet brukeren — irreversibelt.
 * Krever bekreftelse i body: { password, confirm: "SLETT MIN KONTO" }
 */
const DeleteSchema = z.object({
  password: z.string().min(1),
  confirm: z.literal("SLETT MIN KONTO"),
});

router.post("/delete", async (req: Request, res: Response) => {
  const parsed = DeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Bekreftelse mangler",
      message: 'Send med password og confirm = "SLETT MIN KONTO"',
    });
  }

  const session = req.session!;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.passwordHash) {
    return res.status(400).json({ error: "Konto mangler passord" });
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Feil passord" });
  }

  // Sjekk om brukeren er eneste eier i organisasjonen
  const orgUsers = await prisma.user.count({ where: { organizationId: session.organizationId } });

  // Slett bruker — Cascade slettinger i schemaet tar resten:
  //   - user → cascade → timeEntries, agentSessions, graphAccount
  //   - I tillegg: sletter org hvis dette er siste bruker (annet ville etterlate spøkelsesorg)
  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: session.userId } });
    if (orgUsers === 1) {
      // Cascade fjerner clients, saker, sticky notes, invoices, audit logs
      await tx.organization.delete({ where: { id: session.organizationId } });
    }
  });

  // Logg det IKKE (brukeren er borte). Bare svar.
  return res.json({
    ok: true,
    message: "Konto og all tilknyttet data er slettet. Vi takker for tiden — du er velkommen tilbake senere.",
    organizationDeleted: orgUsers === 1,
  });
});

/**
 * GET /me/sessions
 * Liste over desktop-agent-installasjoner registrert for denne brukeren.
 * Brukes til "Mine enheter"-visningen i Sikkerhet-fanen.
 */
router.get("/sessions", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const sessions = await prisma.agentSession.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });
  return res.json({ sessions, count: sessions.length });
});

/**
 * DELETE /me/sessions/:id
 * Fjern en spesifikk desktop-installasjon (brukes hvis pc ble stjålet).
 */
router.delete("/sessions/:id", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const session = await prisma.agentSession.findFirst({
    where: { id: req.params.id, userId },
    select: { id: true },
  });
  if (!session) return res.status(404).json({ error: "Enhet ikke funnet" });

  await prisma.agentSession.delete({ where: { id: session.id } });
  return res.json({ ok: true });
});

/**
 * GET /me/audit
 * Siste 50 hendelser logget mot denne brukeren.
 */
router.get("/audit", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return res.json({ logs, count: logs.length });
});

// ──────────────────────────────────────────────────────────────
// UI-preferanser — cloud-synket localStorage-erstatning
// Lagrer snarveier, sites, mapper, tema, hidden-nav osv per bruker
// så data overlever ny .exe-installasjon, browser-bytte, cache-wipe.
// ──────────────────────────────────────────────────────────────

/**
 * GET /me/preferences
 * Returnerer bruker-preferanser som JSON-objekt.
 * Format: { "sakspilot_my_sites": "[...]", "sakspilot_shortcuts": "[...]", ... }
 * Tom respons hvis bruker ikke har noen preferanser ennå.
 */
router.get("/preferences", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const row = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { preferences: true, updatedAt: true },
  });
  if (!row) return res.json({});
  return res.json(row.preferences || {});
});

/**
 * PUT /me/preferences
 * Erstatter hele preferanse-blobben. Frontend sender alle sakspilot_*-verdier
 * fra localStorage hver gang noe endres (debounced 5s).
 *
 * Body: { sakspilot_my_sites: "[...]", sakspilot_shortcuts: "[...]", ... }
 *       — alle verdier må være strings (matcher localStorage-format).
 */
router.put("/preferences", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const body = req.body;

  // Validér: må være et flat objekt med string-verdier, max 100 KB totalt
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Body må være et objekt" });
  }
  const json = JSON.stringify(body);
  if (json.length > 100_000) {
    return res.status(413).json({ error: "Preferanser for store (max 100 KB)" });
  }
  for (const [k, v] of Object.entries(body)) {
    if (!k.startsWith("sakspilot_")) {
      return res.status(400).json({ error: `Ugyldig nøkkel: ${k} (må starte med sakspilot_)` });
    }
    if (typeof v !== "string") {
      return res.status(400).json({ error: `Verdi for ${k} må være string` });
    }
  }

  await prisma.userPreferences.upsert({
    where: { userId },
    update: { preferences: body },
    create: { userId, preferences: body },
  });
  return res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────
// Tidsmål — uke/mnd-mål for fakturerbare (eller totale) timer
// Brukes til progress-widget på /hjem og varsler hvis brukeren henger etter.
// ──────────────────────────────────────────────────────────────

const GoalsSchema = z.object({
  // null = nullstill målet, undefined = ikke endre.
  weeklyHoursGoal: z.number().int().min(0).max(168).nullable().optional(),
  monthlyHoursGoal: z.number().int().min(0).max(744).nullable().optional(),
  goalType: z.enum(["billable", "total"]).optional(),
});

/**
 * PATCH /me/goals
 * Oppdater personlige tidsmål. Felter som ikke sendes forblir uendret.
 * Send null for å fjerne et mål.
 */
router.patch("/goals", async (req: Request, res: Response) => {
  const parsed = GoalsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input", details: parsed.error.flatten() });
  }
  const { userId } = req.session!;
  const data: {
    weeklyHoursGoal?: number | null;
    monthlyHoursGoal?: number | null;
    goalType?: string;
  } = {};
  if (parsed.data.weeklyHoursGoal !== undefined) data.weeklyHoursGoal = parsed.data.weeklyHoursGoal;
  if (parsed.data.monthlyHoursGoal !== undefined) data.monthlyHoursGoal = parsed.data.monthlyHoursGoal;
  if (parsed.data.goalType !== undefined) data.goalType = parsed.data.goalType;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      weeklyHoursGoal: true,
      monthlyHoursGoal: true,
      goalType: true,
    },
  });
  return res.json(user);
});

/**
 * GET /me/goals/progress
 * Returnerer fremdrift mot uke- og månedsmål. Uke = mandag-søndag,
 * måned = 1. til siste dag i kalendermåneden. Tidssone: Europe/Oslo
 * (vi bruker server-lokal tid via Date — Render-servere er UTC, men siden
 * pro-rata bare regnes på dager og ikke timer-i-døgnet er det robust nok).
 *
 * prorataTarget = hvor mange timer brukeren BURDE ha logget akkurat nå
 * hvis hen er i rute (lineær progresjon gjennom perioden).
 */
router.get("/goals/progress", async (req: Request, res: Response) => {
  const { userId } = req.session!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { weeklyHoursGoal: true, monthlyHoursGoal: true, goalType: true },
  });
  if (!user) return res.status(404).json({ error: "Bruker ikke funnet" });

  const now = new Date();

  // Ukestart = mandag 00:00 lokal tid (samme mønster som /reports/home).
  // Søn=0 → -6, ellers 1 - day.
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() + (dow === 0 ? -6 : 1 - dow));
  weekStart.setHours(0, 0, 0, 0);

  // Månedsstart = 1. i måneden 00:00. Måneds-slutt håndteres av JS
  // automatisk når vi setter dato=0 i NESTE måned.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();

  // Pro-rata: hvor langt inn i perioden er vi? Bruker ms for nøyaktighet
  // (håndterer halve dager / desimaler), men eksponerer daysIn som heltall.
  const weekElapsedMs = now.getTime() - weekStart.getTime();
  const weekTotalMs = 7 * 86_400_000;
  // daysIn = antall fulle eller delvis startede dager (mandag = 1).
  const weekDaysIn = Math.min(7, Math.floor(weekElapsedMs / 86_400_000) + 1);

  const monthElapsedMs = now.getTime() - monthStart.getTime();
  const monthTotalMs = monthEnd.getTime() - monthStart.getTime();
  const monthDaysIn = Math.min(daysInMonth, now.getDate());

  // Hent alle TimeEntry-rader for begge periodene i ett kall (måneden
  // dekker uka i 6 av 7 dager — vi henter alt månedens og filtrerer).
  // Edge case: ved månedsskifte (f.eks. torsdag 1. november) går uka delvis
  // tilbake i forrige måned. Da må vi hente fra MIN(weekStart, monthStart).
  const fetchFrom = weekStart < monthStart ? weekStart : monthStart;

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { gte: fetchFrom },
      ...(user.goalType === "billable" ? { billable: true } : {}),
    },
    select: { startedAt: true, durationSec: true },
  });

  let weekSec = 0;
  let monthSec = 0;
  for (const e of entries) {
    if (e.startedAt >= weekStart) weekSec += e.durationSec;
    if (e.startedAt >= monthStart) monthSec += e.durationSec;
  }
  const weekLogged = Math.round((weekSec / 3600) * 10) / 10;
  const monthLogged = Math.round((monthSec / 3600) * 10) / 10;

  function buildPeriod(
    goal: number | null,
    logged: number,
    elapsedMs: number,
    totalMs: number,
    daysIn: number,
    daysTotal: number,
  ) {
    return {
      goal,
      logged,
      percentage: goal && goal > 0 ? Math.round((logged / goal) * 100) : null,
      prorataTarget:
        goal && goal > 0 && totalMs > 0
          ? Math.round((goal * (elapsedMs / totalMs)) * 10) / 10
          : null,
      daysIn,
      daysTotal,
    };
  }

  return res.json({
    week: buildPeriod(user.weeklyHoursGoal, weekLogged, weekElapsedMs, weekTotalMs, weekDaysIn, 7),
    month: buildPeriod(user.monthlyHoursGoal, monthLogged, monthElapsedMs, monthTotalMs, monthDaysIn, daysInMonth),
    goalType: user.goalType,
  });
});

// ──────────────────────────────────────────────────────────────
// iCal-feed — brukeren kan abonnere på sine frister/milepæler
// fra Google Calendar / Apple Calendar / Outlook via en URL.
// Token er random hex (16 bytes = 128 bits entropy), unikt per user.
// Selve feeden serveres av PUBLIC routen /ical/:token (icalFeed.ts).
// ──────────────────────────────────────────────────────────────

/**
 * Bygg den offentlige iCal-URL-en. Bruker API_PUBLIC_URL hvis satt
 * (prod: https://api.sakspilot.no), fallback til request-origin
 * for dev/lokal kjøring.
 */
function buildIcalUrl(req: Request, token: string): string {
  const base =
    process.env.API_PUBLIC_URL?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  return `${base}/ical/${token}`;
}

/**
 * GET /me/ical
 * Returnerer status på brukerens iCal-feed. Vi sender med selve URL-en
 * hvis aktivert — den er ikke hemmelig på samme måte som passord-hash,
 * og brukeren trenger den for å vise i UI / kopiere på nytt.
 */
router.get("/ical", async (req: Request, res: Response) => {
  const { userId } = req.session!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { icalToken: true },
  });
  if (!user) return res.status(404).json({ error: "Bruker ikke funnet" });
  if (!user.icalToken) {
    return res.json({ hasToken: false });
  }
  return res.json({
    hasToken: true,
    icalUrl: buildIcalUrl(req, user.icalToken),
  });
});

/**
 * POST /me/ical/generate
 * Genererer (eller regenererer) iCal-token. Hvis brukeren allerede har
 * en URL aktivert blir den UGYLDIG umiddelbart — gammelt token erstattes.
 * Returnerer full URL + advarsel om at hvem som helst med lenken kan se
 * brukerens frister.
 *
 * Vi logger handlingen i audit-loggen (skrive-handling) — men IKKE selve
 * tokenet. Bare "ical.generated" + userId.
 */
router.post("/ical/generate", async (req: Request, res: Response) => {
  const { userId, organizationId } = req.session!;
  // 16 bytes = 32 hex tegn = 128 bits entropy → upraktisk å brute-force.
  const newToken = crypto.randomBytes(16).toString("hex");

  await prisma.user.update({
    where: { id: userId },
    data: { icalToken: newToken },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action: "ical.generated",
      entityType: "user",
      entityId: userId,
    },
  });

  return res.json({
    icalUrl: buildIcalUrl(req, newToken),
    warning:
      "Hvem som helst med denne URL-en kan se dine åpne frister og saksnavn. Ikke del med uvedkommende.",
  });
});

/**
 * DELETE /me/ical
 * Nullstiller tokenet — kalender-abonnement slutter umiddelbart å virke
 * (neste poll fra Google/Apple/Outlook får 404). Brukes hvis URL-en har
 * lekket eller brukeren vil deaktivere feeden.
 */
router.delete("/ical", async (req: Request, res: Response) => {
  const { userId, organizationId } = req.session!;
  // Sett til null direkte — Prisma håndterer unique-constraint korrekt
  // (flere brukere kan ha null icalToken siden NULL ikke regnes som dupe
  // i Postgres unique-indekser).
  await prisma.user.update({
    where: { id: userId },
    data: { icalToken: null },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action: "ical.revoked",
      entityType: "user",
      entityId: userId,
    },
  });

  return res.json({ ok: true });
});

export default router;
