/**
 * Saker-routes — CRUD for Sak (klientoppdrag).
 *
 * Multi-tenant: alle queries filtreres på organizationId fra JWT.
 * Brukere ser KUN saker som tilhører deres organisasjon.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { runAutomationsForTrigger } from "../services/automationEngine";

const router = Router();

router.use(requireAuth);

const SakStatusEnum = z.enum([
  "ikke_pabegynt",
  "pagaaende",
  "venter_kunde",
  "venter_3part",
  "ferdig",
  "arkivert",
]);

const CreateSakSchema = z.object({
  title: z.string().min(1, "Tittel kreves").max(200),
  clientId: z.string().uuid().nullable().optional(),
  saksnummer: z.string().max(60).optional(),
  description: z.string().max(5000).optional(),
  status: SakStatusEnum.optional(),
  deadline: z.coerce.date().nullable().optional(),
  hourlyRate: z.number().int().min(0).max(100000).nullable().optional(),
  folderPath: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

const UpdateSakSchema = CreateSakSchema.partial();

/**
 * GET /saker
 * Liste over saker i innlogget brukers organisasjon.
 * Query: ?status=pagaaende&clientId=...&includeArchived=true
 */
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const { status, clientId, includeArchived } = req.query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId };
  if (status && typeof status === "string") where.status = status;
  if (clientId && typeof clientId === "string") where.clientId = clientId;
  if (includeArchived !== "true") where.archived = false;

  const saker = await prisma.sak.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { timeEntries: true, milestones: true } },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });

  return res.json({ saker, total: saker.length });
});

/**
 * GET /saker/:id
 * Hent én sak med full kontekst.
 */
router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const sak = await prisma.sak.findFirst({
    where: { id: req.params.id, organizationId },
    include: {
      client: true,
      matchingRules: { orderBy: { priority: "desc" } },
      milestones: { orderBy: { dueDate: "asc" } },
      _count: { select: { timeEntries: true, emailLinks: true } },
    },
  });

  if (!sak) return res.status(404).json({ error: "Sak ikke funnet" });
  return res.json(sak);
});

/**
 * POST /saker
 * Opprett ny sak.
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSakSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;

  // Hvis clientId er oppgitt — verifiser at den tilhører samme org
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!client) {
      return res.status(400).json({ error: "Klient finnes ikke i din organisasjon" });
    }
  }

  const sak = await prisma.sak.create({
    data: {
      ...parsed.data,
      organizationId: session.organizationId,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "sak.created",
      entityType: "sak",
      entityId: sak.id,
    },
  });

  // Trigger automatiseringer (fire-and-forget — feiler ikke selve opprettelsen)
  runAutomationsForTrigger("sak_created", {
    organizationId: session.organizationId,
    userId: session.userId,
    sak: { id: sak.id, title: sak.title, status: sak.status, client: sak.client },
  }).catch((err) => console.error("[automation] sak_created feilet:", err));

  return res.status(201).json(sak);
});

/**
 * PATCH /saker/:id
 * Oppdater sak. Bare felt som er med i body endres.
 */
router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateSakSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.sak.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) return res.status(404).json({ error: "Sak ikke funnet" });

  // Verifiser klient hvis clientId er oppgitt
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!client) {
      return res.status(400).json({ error: "Klient finnes ikke i din organisasjon" });
    }
  }

  // Sett closedAt automatisk når status skifter til ferdig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { ...parsed.data };
  if (parsed.data.status === "ferdig" && existing.status !== "ferdig") {
    updateData.closedAt = new Date();
  }

  const sak = await prisma.sak.update({
    where: { id: req.params.id },
    data: updateData,
    include: { client: { select: { id: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "sak.updated",
      entityType: "sak",
      entityId: sak.id,
      // Prisma Json-felt — caster via JSON-roundtrip for å sikre serialiserbarhet
      metadata: JSON.parse(JSON.stringify(parsed.data)),
    },
  });

  // Trigger automatiseringer hvis status har endret seg
  if (parsed.data.status && parsed.data.status !== existing.status) {
    runAutomationsForTrigger("sak_status_changed", {
      organizationId: session.organizationId,
      userId: session.userId,
      sak: {
        id: sak.id,
        title: sak.title,
        status: sak.status,
        previousStatus: existing.status,
        client: sak.client,
      },
    }).catch((err) => console.error("[automation] sak_status_changed feilet:", err));
  }

  return res.json(sak);
});

/**
 * DELETE /saker/:id
 * Sletter en sak. Time-entries beholdes men frikobles (sakId blir null).
 * Ekte arkivering — bruk PATCH med archived=true istedenfor for å beholde
 * historikken i kanban.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.sak.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Sak ikke funnet" });

  await prisma.sak.delete({ where: { id: req.params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "sak.deleted",
      entityType: "sak",
      entityId: req.params.id,
    },
  });

  return res.json({ ok: true });
});

// ────────────────────────────────────────────────────────────────
// Nested: matching-regler (per sak)
//
// Disse er kjernen i passiv tidsregistrering: desktop-agenten henter
// reglene via GET /agent/rules og evaluerer dem lokalt på hver
// vinduslogging. Hvis tittel/sti matcher → tid kobles til sak.
// ────────────────────────────────────────────────────────────────

const MatchingRuleTypeEnum = z.enum(["title", "path", "app", "email"]);

const CreateMatchingRuleSchema = z.object({
  type: MatchingRuleTypeEnum,
  pattern: z.string().min(1, "Mønster kreves").max(500),
  priority: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
});

// Hjelpefunksjon: bekreft at saken eksisterer i innloggets organisasjon
async function ensureSakOwnership(
  req: Request,
  res: Response
): Promise<string | null> {
  const session = req.session!;
  const sak = await prisma.sak.findFirst({
    where: { id: req.params.sakId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!sak) {
    res.status(404).json({ error: "Sak ikke funnet" });
    return null;
  }
  return sak.id;
}

router.post("/:sakId/matching-rules", async (req: Request, res: Response) => {
  const parsed = CreateMatchingRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  // Valider at regex-mønsteret er gyldig — vi gjør det også i agent,
  // men best å fange feil her så brukeren ikke får knust desktop-agent.
  try {
    // eslint-disable-next-line no-new
    new RegExp(parsed.data.pattern, "i");
  } catch {
    return res
      .status(400)
      .json({ error: "Mønsteret er ikke et gyldig regex-uttrykk" });
  }

  const rule = await prisma.matchingRule.create({
    data: { ...parsed.data, sakId },
  });

  return res.status(201).json(rule);
});

router.delete(
  "/:sakId/matching-rules/:ruleId",
  async (req: Request, res: Response) => {
    const sakId = await ensureSakOwnership(req, res);
    if (!sakId) return;

    const rule = await prisma.matchingRule.findFirst({
      where: { id: req.params.ruleId, sakId },
      select: { id: true },
    });
    if (!rule) return res.status(404).json({ error: "Regel ikke funnet" });

    await prisma.matchingRule.delete({ where: { id: rule.id } });
    return res.json({ ok: true });
  }
);

// ────────────────────────────────────────────────────────────────
// Nested: milepæler/frister (per sak)
// ────────────────────────────────────────────────────────────────

const CreateMilestoneSchema = z.object({
  title: z.string().min(1, "Tittel kreves").max(200),
  dueDate: z.coerce.date(),
  notifyDaysBefore: z.number().int().min(0).max(60).optional(),
});

router.post("/:sakId/milestones", async (req: Request, res: Response) => {
  const parsed = CreateMilestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  const milestone = await prisma.milestone.create({
    data: { ...parsed.data, sakId },
  });

  return res.status(201).json(milestone);
});

router.patch(
  "/:sakId/milestones/:milestoneId/complete",
  async (req: Request, res: Response) => {
    const sakId = await ensureSakOwnership(req, res);
    if (!sakId) return;

    const session = req.session!;
    const milestone = await prisma.milestone.findFirst({
      where: { id: req.params.milestoneId, sakId },
      include: { sak: { include: { client: { select: { id: true, name: true } } } } },
    });
    if (!milestone) return res.status(404).json({ error: "Frist ikke funnet" });

    const wasCompleted = !!milestone.completedAt;
    const updated = await prisma.milestone.update({
      where: { id: milestone.id },
      data: { completedAt: wasCompleted ? null : new Date() },
    });

    // Trigger kun ved overgang fra ufullført → fullført
    if (!wasCompleted) {
      runAutomationsForTrigger("milestone_completed", {
        organizationId: session.organizationId,
        userId: session.userId,
        sak: {
          id: milestone.sak.id,
          title: milestone.sak.title,
          status: milestone.sak.status,
          client: milestone.sak.client,
        },
        milestone: {
          id: milestone.id,
          title: milestone.title,
          sakId: milestone.sakId,
          sakTitle: milestone.sak.title,
          dueDate: milestone.dueDate,
        },
      }).catch((err) => console.error("[automation] milestone_completed feilet:", err));
    }

    return res.json(updated);
  }
);

router.delete(
  "/:sakId/milestones/:milestoneId",
  async (req: Request, res: Response) => {
    const sakId = await ensureSakOwnership(req, res);
    if (!sakId) return;

    const milestone = await prisma.milestone.findFirst({
      where: { id: req.params.milestoneId, sakId },
      select: { id: true },
    });
    if (!milestone) return res.status(404).json({ error: "Frist ikke funnet" });

    await prisma.milestone.delete({ where: { id: milestone.id } });
    return res.json({ ok: true });
  }
);

// ────────────────────────────────────────────────────────────────
// Tidssammendrag per sak (lett rapport)
// ────────────────────────────────────────────────────────────────

router.get("/:sakId/time-summary", async (req: Request, res: Response) => {
  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  // Aggregate i Postgres — billig selv ved 100k+ entries
  const entries = await prisma.timeEntry.findMany({
    where: { sakId },
    select: { durationSec: true, billable: true, hourlyRate: true, startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 1000, // siste 1000 — mer enn nok for visning
  });

  const totalSec = entries.reduce((s, e) => s + e.durationSec, 0);
  const billableSec = entries
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.durationSec, 0);
  const totalAmount = entries
    .filter((e) => e.billable && e.hourlyRate)
    .reduce((s, e) => s + (e.durationSec / 3600) * (e.hourlyRate || 0), 0);

  return res.json({
    entryCount: entries.length,
    totalHours: +(totalSec / 3600).toFixed(2),
    billableHours: +(billableSec / 3600).toFixed(2),
    totalAmount: Math.round(totalAmount),
    lastEntryAt: entries[0]?.startedAt ?? null,
  });
});

export default router;
