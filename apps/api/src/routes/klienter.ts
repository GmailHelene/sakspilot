/**
 * Klienter-routes — CRUD for Client.
 * Multi-tenant: alle queries filtreres på organizationId.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { hashPassword } from "../services/auth";
import { sendEmail, clientPortalInviteEmail } from "../lib/email";

const router = Router();
router.use(requireAuth);

const CreateClientSchema = z.object({
  name: z.string().min(1, "Navn kreves").max(160),
  orgNumber: z.string().max(20).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  defaultHourlyRate: z.number().int().min(0).max(100000).nullable().optional(),
  notes: z.string().max(5000).optional(),
});

const UpdateClientSchema = CreateClientSchema.partial().extend({
  archived: z.boolean().optional(),
});

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const includeArchived = req.query.includeArchived === "true";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      ...(includeArchived ? {} : { archived: false }),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { orgNumber: { contains: q, mode: "insensitive" as const } },
          { contactEmail: { contains: q, mode: "insensitive" as const } },
          { contactPhone: { contains: q, mode: "insensitive" as const } },
          { address: { contains: q, mode: "insensitive" as const } },
          { notes: { contains: q, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    include: { _count: { select: { saker: true } } },
    orderBy: { name: "asc" },
  });

  return res.json({ clients, total: clients.length });
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId },
    // Eksplisitt select — IKKE eksponer passwordHash/passwordResetTokenHash
    // selv om vi bare returnerer dette til frilanseren selv.
    select: {
      id: true,
      organizationId: true,
      name: true,
      orgNumber: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      defaultHourlyRate: true,
      notes: true,
      archived: true,
      email: true,
      portalEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      saker: {
        where: { archived: false },
        select: { id: true, title: true, status: true, deadline: true, archived: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) return res.status(404).json({ error: "Klient ikke funnet" });
  return res.json(client);
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const data = { ...parsed.data };
  if (data.contactEmail === "") delete data.contactEmail;

  const client = await prisma.client.create({
    data: { ...data, organizationId: session.organizationId },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "client.created",
      entityType: "client",
      entityId: client.id,
    },
  });

  return res.status(201).json(client);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Klient ikke funnet" });

  const data = { ...parsed.data };
  if (data.contactEmail === "") delete data.contactEmail;

  const client = await prisma.client.update({
    where: { id: req.params.id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "client.updated",
      entityType: "client",
      entityId: client.id,
    },
  });

  return res.json(client);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    include: { _count: { select: { saker: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Klient ikke funnet" });

  if (existing._count.saker > 0) {
    return res.status(400).json({
      error: "Klienten har prosjekter - arkiver istedenfor å slette",
      saker: existing._count.saker,
    });
  }

  await prisma.client.delete({ where: { id: req.params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "client.deleted",
      entityType: "client",
      entityId: req.params.id,
    },
  });

  return res.json({ ok: true });
});

// ── POST /klienter/:id/invite-to-portal ─────────────────────────
//
// Frilanseren sender en invitasjon til klienten om å aktivere klient-portalen.
// Genererer kryptografisk tilfeldig engangstoken (32 bytes hex), bcrypt-hasher
// hashen i DB (selve tokenet kun i e-posten — DB-lekkasje gir ikke aksept).
// Én aktiv invite per klient (clientId @unique). Ny invitasjon overskriver
// (upsert) — så frilanseren kan trygt re-sende.
//
// Sikkerhet:
//   - Tilgangskontroll: krever User-auth + at klienten tilhører samme org
//   - Token-hash i DB (bcrypt 12 rounds), klartekst aldri lagret
//   - 7 dagers utløp
//   - Krever contactEmail på klient — eposten må sendes et sted
router.post("/:id/invite-to-portal", async (req: Request, res: Response) => {
  const session = req.session!;
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    include: { organization: { select: { name: true } } },
  });
  if (!client) return res.status(404).json({ error: "Klient ikke funnet" });

  if (!client.contactEmail) {
    return res.status(400).json({
      error: "Klienten mangler kontakt-e-post. Fyll inn denne først.",
    });
  }

  // Hent frilanserens navn for e-posten
  const inviter = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await hashPassword(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 86400000); // 7 dager

  // Upsert — én aktiv invite per klient. Hvis det finnes en gammel, overskrives.
  await prisma.clientPortalInvite.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      tokenHash,
      expiresAt,
    },
    update: {
      tokenHash,
      expiresAt,
      acceptedAt: null, // reset hvis re-invitert
      createdAt: new Date(),
    },
  });

  const webOrigin = process.env.WEB_ORIGIN || "https://sakspilot.no";
  const acceptUrl = `${webOrigin}/portal/accept-invite?token=${rawToken}`;

  let emailSent = false;
  const result = await sendEmail(
    clientPortalInviteEmail({
      clientName: client.name,
      freelancerName: inviter?.name || session.name,
      recipientEmail: client.contactEmail,
      acceptUrl,
      expiresAt,
    })
  );
  emailSent = result.ok;
  if (!result.ok) {
    console.log(
      `[client-portal invite] SMTP fallback - invite-lenke for ${client.contactEmail}: ${acceptUrl}`
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "client_portal.invited",
      entityType: "client",
      entityId: client.id,
      metadata: { email: client.contactEmail, expiresAt: expiresAt.toISOString() },
    },
  });

  const isDev = process.env.NODE_ENV !== "production";

  return res.json({
    ok: true,
    message: emailSent
      ? `Invitasjon sendt til ${client.contactEmail}`
      : `Invitasjon opprettet. SMTP ikke konfigurert - lenken er logget på serveren.`,
    expiresAt,
    // I dev / SMTP-fail: returner lenken så frilanseren kan kopiere manuelt
    ...(isDev || !emailSent ? { _devInviteUrl: acceptUrl } : {}),
  });
});

export default router;
