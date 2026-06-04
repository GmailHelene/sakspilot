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
  // kvitteringUrl godtar BÅDE http(s)-URLs og data:image/...-URLs (base64-encodet).
  // Vi lar Postgres TEXT-feltet håndtere det. Max 8 MB string-lengde (≈ 6 MB binær)
  // for å hindre at noen poster en 100MB-fil.
  kvitteringUrl: z.string()
    .max(8_000_000, "Kvittering for stor - max ~6 MB")
    .refine(
      (s) => /^(https?:\/\/|data:(image|application)\/)/i.test(s),
      "Må være http(s)://-URL eller data:image/...|data:application/pdf",
    )
    .nullable()
    .optional(),
  notes: z.string().max(5000).optional(),
});

const UpdateUtgiftSchema = CreateUtgiftSchema.partial();

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  const kategori = (req.query.kategori as string) || null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

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
    ...(q ? {
      OR: [
        { beskrivelse: { contains: q, mode: "insensitive" as const } },
        { leverandor: { contains: q, mode: "insensitive" as const } },
        { kategori: { contains: q, mode: "insensitive" as const } },
        { notes: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
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

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "utgift.updated",
      entityType: "utgift",
      entityId: utgift.id,
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

// ── Bulk-import fra bank-CSV ─────────────────────────────────────
const BulkUtgiftSchema = z.array(
  z.object({
    dato: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    beskrivelse: z.string().min(1).max(500),
    belopInkMva: z.number().min(-10_000_000).max(10_000_000),
    mvaSats: z.number().int().min(0).max(100).nullable().optional(),
    kategori: z.string().max(100).optional(),
    leverandor: z.string().max(200).optional(),
    /** Bank-referanse / arkiv-id - brukes til idempotens */
    externalId: z.string().max(200).optional(),
  })
).min(1).max(1000);

/**
 * POST /utgifter/bulk-import
 * Importer flere utgifter samtidig fra bank-CSV.
 *
 * Idempotent via externalId: hvis en rad allerede finnes med samme
 * externalId, hopper vi over (returnerer { skipped: N }).
 *
 * Frontend parser CSV og kaller dette endepunktet — backend er format-
 * agnostic, vi bryr oss ikke om DNB vs Sparebank1.
 *
 * Returner: { created, skipped, errors[] }
 */
router.post("/bulk-import", async (req: Request, res: Response) => {
  const parsed = BulkUtgiftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  let created = 0;
  let skipped = 0;
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    try {
      // Idempotens: hvis externalId allerede finnes, hopp over
      if (row.externalId) {
        const existing = await prisma.utgift.findUnique({
          where: {
            organizationId_externalId: {
              organizationId: session.organizationId,
              externalId: row.externalId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      await prisma.utgift.create({
        data: {
          organizationId: session.organizationId,
          externalId: row.externalId ?? null,
          dato: new Date(row.dato),
          beskrivelse: row.beskrivelse,
          belopInkMva: row.belopInkMva,
          mvaSats: row.mvaSats ?? null,
          kategori: row.kategori || null,
          leverandor: row.leverandor || null,
        },
      });
      created++;
    } catch (err) {
      errors.push({
        index: i,
        error: err instanceof Error ? err.message : "Ukjent feil",
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "utgift.bulk_imported",
      entityType: "utgift",
      metadata: { created, skipped, errorCount: errors.length },
    },
  });

  return res.json({ created, skipped, errors });
});

export default router;
