/**
 * Klistrelapper (sticky notes) — quick post-it-style notater.
 * Knyttet til organisasjon, valgfritt til sak eller bruker.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const COLORS = ["yellow", "pink", "blue", "green", "purple", "orange"] as const;

const CreateSchema = z.object({
  content: z.string().min(0).max(5000).default(""),
  color: z.enum(COLORS).optional(),
  sakId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
});

const UpdateSchema = z.object({
  content: z.string().min(0).max(5000).optional(),
  color: z.enum(COLORS).optional(),
  sakId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * GET /stickies — alle klistrelapper for innloggets org.
 * Sortert: pinned først, deretter sist oppdatert.
 * Filter: ?sakId=... for å hente notater knyttet til en sak.
 */
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const { sakId } = req.query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { organizationId };
  if (sakId && typeof sakId === "string") where.sakId = sakId;

  const notes = await prisma.stickyNote.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return res.json({ notes });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;

  // Bekreft sakId tilhører org hvis oppgitt
  if (parsed.data.sakId) {
    const sak = await prisma.sak.findFirst({
      where: { id: parsed.data.sakId, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!sak) return res.status(400).json({ error: "Sak finnes ikke i din organisasjon" });
  }

  const note = await prisma.stickyNote.create({
    data: {
      ...parsed.data,
      organizationId: session.organizationId,
      userId: session.userId,
    },
  });

  return res.status(201).json(note);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.stickyNote.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Klistrelapp ikke funnet" });

  if (parsed.data.sakId) {
    const sak = await prisma.sak.findFirst({
      where: { id: parsed.data.sakId, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!sak) return res.status(400).json({ error: "Sak finnes ikke i din organisasjon" });
  }

  const note = await prisma.stickyNote.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  return res.json(note);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.stickyNote.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Klistrelapp ikke funnet" });

  await prisma.stickyNote.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

export default router;
