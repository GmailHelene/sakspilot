/**
 * Forespørsler-routes — CRUD for Foresporsel (lead/inquiry).
 *
 *   GET    /foresporsler                — liste (filtrer på status / archived)
 *   GET    /foresporsler/:id            — detalj
 *   POST   /foresporsler                — opprett (status default = ny)
 *   PATCH  /foresporsler/:id            — oppdater felter / status
 *   DELETE /foresporsler/:id            — slett (myk = sett arkivert isf delete)
 *   POST   /foresporsler/:id/convert    — konverter til Client + Sak (status → vunnet)
 *
 * Multi-tenant: alle queries filtreres på organizationId fra session.
 *
 * NB: Norsk "Forespørsel" i UI, ASCII "Foresporsel" i Prisma/kode fordi
 * Prisma-identifikatorer ikke støtter æ/ø/å.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── Zod-skjema ───────────────────────────────────────────────────

const StatusSchema = z.enum(["ny", "i_dialog", "vunnet", "tapt", "arkivert"]);

const CreateForesporselSchema = z.object({
  name: z.string().min(1, "Navn kreves").max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  source: z.string().max(200).optional(),
  message: z.string().max(10000).optional(),
  status: StatusSchema.optional(),
  estimatedValue: z.number().int().min(0).max(100_000_000).nullable().optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(10000).optional(),
});

const UpdateForesporselSchema = CreateForesporselSchema.partial();

const ConvertSchema = z.object({
  /// Klient-navn — default: foresporsel.name. Kan overstyres hvis du
  /// vil at det skal hete noe annet i Klienter-listen.
  clientName: z.string().min(1).max(160).optional(),
  /// Org-nummer hvis det er et firma
  orgNumber: z.string().max(20).optional(),
  /// Skal vi automatisk opprette en startsak også?
  createSak: z.boolean().default(true),
  /// Tittel for startsaken — default: "Oppdrag fra ${name}"
  sakTitle: z.string().min(1).max(200).optional(),
});

// ── Routes ───────────────────────────────────────────────────────

/**
 * GET /foresporsler?status=ny&includeArchived=true
 * Liste forespørsler. Default: alle ikke-arkiverte. Filter på status valgfritt.
 */
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const statusFilter = StatusSchema.safeParse(req.query.status);
  const includeArchived = req.query.includeArchived === "true";

  const foresporsler = await prisma.foresporsel.findMany({
    where: {
      organizationId,
      ...(statusFilter.success ? { status: statusFilter.data } : {}),
      ...(includeArchived ? {} : { status: { not: "arkivert" } }),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  // Lett aggregering for header-KPIer (vises i UI uten ekstra round-trip)
  const counts = await prisma.foresporsel.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: true,
  });

  return res.json({
    foresporsler,
    total: foresporsler.length,
    countsByStatus: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const foresporsel = await prisma.foresporsel.findFirst({
    where: { id: req.params.id, organizationId },
  });
  if (!foresporsel) return res.status(404).json({ error: "Forespørsel ikke funnet" });
  return res.json(foresporsel);
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateForesporselSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const data = { ...parsed.data };
  if (data.email === "") delete (data as { email?: string }).email;

  const foresporsel = await prisma.foresporsel.create({
    data: {
      ...data,
      organizationId: session.organizationId,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "foresporsel.created",
      entityType: "foresporsel",
      entityId: foresporsel.id,
    },
  });

  return res.status(201).json(foresporsel);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateForesporselSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.foresporsel.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) return res.status(404).json({ error: "Forespørsel ikke funnet" });

  const data = { ...parsed.data };
  if (data.email === "") delete (data as { email?: string }).email;

  // Hvis status går til vunnet/tapt/arkivert og closedAt ikke er satt,
  // sett den automatisk. Hvis status går tilbake til ny/i_dialog, nullstill.
  const closingStatuses = ["vunnet", "tapt", "arkivert"] as const;
  let closedAt: Date | null | undefined;
  if (data.status && closingStatuses.includes(data.status as (typeof closingStatuses)[number])) {
    closedAt = new Date();
  } else if (data.status && ["ny", "i_dialog"].includes(data.status)) {
    closedAt = null;
  }

  const foresporsel = await prisma.foresporsel.update({
    where: { id: req.params.id },
    data: {
      ...data,
      ...(data.expectedCloseDate !== undefined && {
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      }),
      ...(closedAt !== undefined && { closedAt }),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "foresporsel.updated",
      entityType: "foresporsel",
      entityId: foresporsel.id,
    },
  });

  return res.json(foresporsel);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.foresporsel.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true, convertedToClientId: true },
  });
  if (!existing) return res.status(404).json({ error: "Forespørsel ikke funnet" });

  // Hvis konvertert til klient, ikke slett — bare arkiver (vi vil ikke
  // miste sporet av hvor klienten kom fra). Brukeren får tilbakemelding.
  if (existing.convertedToClientId) {
    await prisma.foresporsel.update({
      where: { id: req.params.id },
      data: { status: "arkivert", closedAt: new Date() },
    });
    return res.json({ ok: true, archived: true, reason: "konvertert til klient" });
  }

  await prisma.foresporsel.delete({ where: { id: req.params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "foresporsel.deleted",
      entityType: "foresporsel",
      entityId: req.params.id,
    },
  });

  return res.json({ ok: true });
});

/**
 * POST /foresporsler/:id/convert
 * Konverter en forespørsel til en Client (+ optional Sak).
 * Idempotent: hvis convertedToClientId allerede er satt, returner eksisterende.
 */
router.post("/:id/convert", async (req: Request, res: Response) => {
  const parsed = ConvertSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const opts = parsed.data;

  const session = req.session!;
  const foresporsel = await prisma.foresporsel.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
  });
  if (!foresporsel) return res.status(404).json({ error: "Forespørsel ikke funnet" });

  // Idempotent: allerede konvertert? Returner peker.
  if (foresporsel.convertedToClientId) {
    return res.json({
      alreadyConverted: true,
      clientId: foresporsel.convertedToClientId,
      sakId: foresporsel.convertedToSakId,
    });
  }

  // Opprett klient + (valgfritt) første sak i én transaksjon — alt-eller-ingenting,
  // så vi aldri ender opp med klient uten lead-link.
  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        organizationId: session.organizationId,
        name: opts.clientName || foresporsel.name,
        orgNumber: opts.orgNumber,
        contactEmail: foresporsel.email || undefined,
        contactPhone: foresporsel.phone || undefined,
        notes: foresporsel.message
          ? `Konvertert fra forespørsel ${foresporsel.id}\n\n${foresporsel.message}`
          : `Konvertert fra forespørsel ${foresporsel.id}`,
      },
    });

    let sak = null;
    if (opts.createSak) {
      sak = await tx.sak.create({
        data: {
          organizationId: session.organizationId,
          clientId: client.id,
          title: opts.sakTitle || `Oppdrag fra ${foresporsel.name}`,
          status: "pagaaende",
        },
      });
    }

    const updated = await tx.foresporsel.update({
      where: { id: foresporsel.id },
      data: {
        status: "vunnet",
        closedAt: new Date(),
        convertedToClientId: client.id,
        convertedToSakId: sak?.id ?? null,
      },
    });

    return { client, sak, foresporsel: updated };
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "foresporsel.converted",
      entityType: "foresporsel",
      entityId: foresporsel.id,
      metadata: {
        clientId: result.client.id,
        sakId: result.sak?.id ?? null,
      },
    },
  });

  return res.status(201).json(result);
});

export default router;
