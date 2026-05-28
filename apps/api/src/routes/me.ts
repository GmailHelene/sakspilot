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

  const [user, organization, clients, saker, timeEntries, stickyNotes, agentSessions, auditLogs] = await Promise.all([
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
    counts: {
      clients: clients.length,
      saker: saker.length,
      timeEntries: timeEntries.length,
      stickyNotes: stickyNotes.length,
      agentSessions: agentSessions.length,
      auditLogs: auditLogs.length,
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

export default router;
