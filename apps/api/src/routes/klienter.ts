/**
 * Klienter-routes — CRUD for Client.
 * Multi-tenant: alle queries filtreres på organizationId.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

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

  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      ...(includeArchived ? {} : { archived: false }),
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
    include: {
      saker: {
        where: { archived: false },
        select: { id: true, title: true, status: true, deadline: true },
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
      error: "Klienten har saker — arkiver istedenfor å slette",
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

export default router;
