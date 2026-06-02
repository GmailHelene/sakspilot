/**
 * Utgifter-routes — CRUD for bedriftsutgifter (regnskap).
 *
 *   GET    /utgifter?year=2026&kategori=drift   — liste + KPI-summary
 *   GET    /utgifter/:id                        — detalj
 *   POST   /utgifter                            — opprett
 *   PATCH  /utgifter/:id                        — oppdater
 *   DELETE /utgifter/:id                        — slett
 *
 * Brukes av /regnskap-siden + statistikk-siden.
 * Multi-tenant: organizationId fra session.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const CreateUtgiftSchema = z.object({
  dato: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  beskrivelse: z.string().min(1).max(500),
  belopInkMva: z.number().min(-10_000_000).max(10_000_000),
  mvaSats: z.number().int().min(0).max(100).nullable().optional(),
  kategori: z.string().max(100).optional(),
  leverandor: z.string().max(200).optional(),
  kvitteringUrl: z.string().url().nullable().optional(),
  notes: z.string().max(5000).optional(),
});

const UpdateUtgiftSchema = CreateUtgiftSchema.partial();

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  const kategori = (req.query.kategori as string) || null;

  let dateRange: { gte: Date; lt: Date } | undefined;
  if (year && !isNaN(year)) {
    dateRange = {
      gte: new Date(`${year}-01-01T00:00:00Z`),
      lt: new Date(`${year + 1}-01-01T00:00:00Z`),
    };
  }

  const where = {
    organizationId,
    ...(dateRange ? { dato: dateRange } : {}),
    ...(kategori ? { kategori } : {}),
  };

  const utgifter = await prisma.utgift.findMany({
    where,
    orderBy: { dato: "desc" },
  });

  // KPI-summary: total + per-kategori for vist år
  const summaryRaw = await prisma.utgift.groupBy({
    by: ["kategori"],
    where: { organizationId, ...(dateRange ? { dato: dateRange } : {}) },
    _sum: { belopInkMva: true },
    _count: true,
  });

  const summary = {
    total: utgifter.length,
    totalAmount: utgifter.reduce((s, u) => s + Number(u.belopInkMva), 0),
    byKategori: summaryRaw.map((r) => ({
      kategori: r.kategori || "(uten kategori)",
      count: r._count,
      sum: Number(r._sum.belopInkMva || 0),
    })),
  };

  return res.json({ utgifter, summary });
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const utgift = await prisma.utgift.findFirst({
    where: { id: req.params.id, organizationId },
  });
  if (!utgift) return res.status(404).json({ error: "Utgift ikke funnet" });
  return res.json(utgift);
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateUtgiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const utgift = await prisma.utgift.create({
    data: {
      ...parsed.data,
      dato: new Date(parsed.data.dato),
      organizationId: session.organizationId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "utgift.created",
      entityType: "utgift",
      entityId: utgift.id,
    },
  });

  return res.status(201).json(utgift);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateUtgiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.utgift.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Utgift ikke funnet" });

  const utgift = await prisma.utgift.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      ...(parsed.data.dato && { dato: new Date(parsed.data.dato) }),
    },
  });

  return res.json(utgift);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.utgift.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Utgift ikke funnet" });

  await prisma.utgift.delete({ where: { id: req.params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "utgift.deleted",
      entityType: "utgift",
      entityId: req.params.id,
    },
  });

  return res.json({ ok: true });
});

export default router;
