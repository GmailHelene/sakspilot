/**
 * Share-routes — administrer offentlige delte lenker for saker.
 *
 *   GET    /saker/:sakId/share        — hent eksisterende aktiv lenke
 *   POST   /saker/:sakId/share        — opprett ny lenke (revokerer gamle)
 *   DELETE /saker/:sakId/share        — revoker aktiv lenke
 *
 *   GET    /public/sak/:token         — offentlig (uten auth!), read-only
 *
 * Sikkerhet:
 *   - Token genereres med crypto.randomBytes(24).toString("base64url") = 32 tegn
 *   - Lenker kan settes til å utløpe (expiresAt)
 *   - Revokerte lenker (revokedAt != null) gir 404
 *   - Public-endepunkt eksponerer KUN ufarlig data:
 *     title, status, deadline, milestones (uten interne notater), klientnavn
 *     IKKE: matching-regler, time-entries (med mindre eksplisitt valgt),
 *           audit-logg, klistrelapper, hourlyRate
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── Hjelpefunksjoner ────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

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
    res.status(404).json({ error: "Prosjekt ikke funnet" });
    return null;
  }
  return sak.id;
}

// ── Autentiserte ruter (admin) ──────────────────────────────────

const authRouter = Router();
authRouter.use(requireAuth);

authRouter.get("/:sakId/share", async (req: Request, res: Response) => {
  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  const link = await prisma.sharedSakLink.findFirst({
    where: { sakId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!link) return res.json({ link: null });

  // Hvis utløpt — marker som revokert
  if (link.expiresAt && link.expiresAt < new Date()) {
    await prisma.sharedSakLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    return res.json({ link: null });
  }

  return res.json({ link });
});

const CreateLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  showTimeEntries: z.boolean().optional(),
});

authRouter.post("/:sakId/share", async (req: Request, res: Response) => {
  const parsed = CreateLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  const session = req.session!;

  // Revoker eksisterende aktive lenker for denne saken (én aktiv ad gangen)
  await prisma.sharedSakLink.updateMany({
    where: { sakId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
    : null;

  const link = await prisma.sharedSakLink.create({
    data: {
      sakId,
      token: generateToken(),
      createdById: session.userId,
      expiresAt,
      showTimeEntries: parsed.data.showTimeEntries ?? false,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "shared_link.created",
      entityType: "sak",
      entityId: sakId,
      metadata: { tokenPrefix: link.token.slice(0, 8), expiresAt: expiresAt?.toISOString() },
    },
  });

  return res.status(201).json({ link });
});

authRouter.delete("/:sakId/share", async (req: Request, res: Response) => {
  const sakId = await ensureSakOwnership(req, res);
  if (!sakId) return;

  const session = req.session!;
  const result = await prisma.sharedSakLink.updateMany({
    where: { sakId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "shared_link.revoked",
      entityType: "sak",
      entityId: sakId,
      metadata: { count: result.count },
    },
  });

  return res.json({ ok: true, revoked: result.count });
});

// ── Offentlig rute (UTEN auth!) ─────────────────────────────────

const publicRouter = Router();

publicRouter.get("/sak/:token", async (req: Request, res: Response) => {
  const token = req.params.token;

  // Basic validering — unngå at vi treffer DB med absurde input
  if (!token || token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return res.status(404).json({ error: "Lenken er ugyldig" });
  }

  const link = await prisma.sharedSakLink.findUnique({
    where: { token },
    include: {
      sak: {
        include: {
          client: { select: { name: true } },
          milestones: {
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              title: true,
              dueDate: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

  if (!link || link.revokedAt) {
    return res.status(404).json({ error: "Lenken er ikke lenger gyldig" });
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(410).json({ error: "Lenken har utløpt" });
  }

  // Inkrementer telleren (fire-and-forget — feiler ikke responsen)
  prisma.sharedSakLink
    .update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch((err) => console.error("[share] viewCount-oppdatering feilet:", err));

  // Bygg minimal payload — eksponerer KUN nødvendig info
  const milestones = link.sak.milestones.map((m) => ({
    id: m.id,
    title: m.title,
    dueDate: m.dueDate,
    completed: !!m.completedAt,
  }));

  const milestonesCompleted = milestones.filter((m) => m.completed).length;
  const progressPct =
    milestones.length > 0
      ? Math.round((milestonesCompleted / milestones.length) * 100)
      : null;

  // Hvis showTimeEntries er på, ta med en sammendrags-statistikk (ikke entries)
  let timeStats: { totalHours: number; lastUpdate: string | null } | null = null;
  if (link.showTimeEntries) {
    const entries = await prisma.timeEntry.findMany({
      where: { sakId: link.sakId },
      select: { durationSec: true, startedAt: true },
      orderBy: { startedAt: "desc" },
      take: 1000,
    });
    if (entries.length > 0) {
      const total = entries.reduce((s, e) => s + e.durationSec, 0);
      timeStats = {
        totalHours: Math.round((total / 3600) * 10) / 10,
        lastUpdate: entries[0].startedAt.toISOString(),
      };
    } else {
      timeStats = { totalHours: 0, lastUpdate: null };
    }
  }

  return res.json({
    sak: {
      title: link.sak.title,
      status: link.sak.status,
      deadline: link.sak.deadline,
      description: link.sak.description,
      clientName: link.sak.client?.name ?? null,
      createdAt: link.sak.createdAt,
      closedAt: link.sak.closedAt,
    },
    milestones,
    progressPct,
    timeStats,
    sharedAt: link.createdAt,
    expiresAt: link.expiresAt,
  });
});

export { authRouter, publicRouter };
