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

// remindAt aksepterer ISO-string, null (fjern påminnelse) eller utelat (uendret).
// Tom string normaliseres til null så frontend kan sende "" fra et datetime-local
// input som ble tømt.
const RemindAtSchema = z
  .union([z.string().datetime(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v));

const CreateSchema = z.object({
  content: z.string().min(0).max(5000).default(""),
  color: z.enum(COLORS).optional(),
  sakId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  remindAt: RemindAtSchema,
});

const UpdateSchema = z.object({
  content: z.string().min(0).max(5000).optional(),
  color: z.enum(COLORS).optional(),
  sakId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  remindAt: RemindAtSchema,
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

  const { remindAt, ...rest } = parsed.data;
  const note = await prisma.stickyNote.create({
    data: {
      ...rest,
      organizationId: session.organizationId,
      userId: session.userId,
      // remindAt kommer som ISO-string fra zod; Prisma godtar string for DateTime?
      remindAt: remindAt ? new Date(remindAt) : null,
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

  // Hvis remindAt eksplisitt settes (ny tid eller null) → nullstill notifiedAt
  // så bruker får et nytt varsel for den nye tiden. "remindAt" finnes som key i
  // parsed.data kun når frontend sendte den (zod fjerner ikke optional-keys som
  // ble eksplisitt med); transform gir null hvis "" eller null ble sendt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { ...parsed.data };
  if ("remindAt" in parsed.data) {
    data.remindAt = parsed.data.remindAt ? new Date(parsed.data.remindAt) : null;
    data.notifiedAt = null;
  }

  const note = await prisma.stickyNote.update({
    where: { id: req.params.id },
    data,
  });

  return res.json(note);
});

/**
 * GET /stickies/due-reminders — klistrelapper for innlogget bruker som har
 * en remindAt <= now og enda ikke er varslet (notifiedAt = null).
 *
 * Begrenset til req.session.userId — påminnelser er personlige selv om
 * notatet ligger på org-nivå. Filtreres på userId for å hindre at brukere
 * i samme team får hverandres påminnelser.
 */
router.get("/due-reminders", async (req: Request, res: Response) => {
  const session = req.session!;
  const notes = await prisma.stickyNote.findMany({
    where: {
      organizationId: session.organizationId,
      userId: session.userId,
      remindAt: { lte: new Date() },
      notifiedAt: null,
    },
    orderBy: { remindAt: "asc" },
    take: 50,
  });
  return res.json({ notes });
});

/**
 * POST /stickies/:id/mark-notified — markerer en klistrelapp som "varslet"
 * så samme påminnelse ikke kommer igjen ved neste poll. Idempotent.
 */
router.post("/:id/mark-notified", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.stickyNote.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Klistrelapp ikke funnet" });

  const note = await prisma.stickyNote.update({
    where: { id: req.params.id },
    data: { notifiedAt: new Date() },
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
