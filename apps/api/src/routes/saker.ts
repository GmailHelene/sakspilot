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

export default router;
