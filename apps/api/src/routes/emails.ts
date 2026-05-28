/**
 * E-post-routes — manuell synk + visning per sak.
 *
 *   POST /emails/sync          — trigger manuell synk fra Outlook
 *   GET  /saker/:id/emails     — liste e-poster knyttet til en sak
 *   PATCH /emails/:id/link     — manuelt knytt e-post til en sak
 *   DELETE /emails/:id/link    — fjern kobling (sletter ikke e-posten i Outlook)
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { syncMessagesForAccount, isMicrosoftConfigured } from "../services/microsoftGraph";

const router = Router();
router.use(requireAuth);

// ── Sync ────────────────────────────────────────────────────────
router.post("/sync", async (req: Request, res: Response) => {
  if (!isMicrosoftConfigured()) {
    return res.status(503).json({ error: "Microsoft Graph er ikke konfigurert." });
  }

  const session = req.session!;
  const account = await prisma.graphAccount.findUnique({
    where: { userId: session.userId },
    select: { id: true },
  });
  if (!account) {
    return res.status(400).json({ error: "Outlook er ikke koblet til kontoen din." });
  }

  try {
    const result = await syncMessagesForAccount(account.id);
    return res.json(result);
  } catch (err) {
    console.error("[emails/sync]", err);
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Synk feilet" });
  }
});

// ── Liste per sak ───────────────────────────────────────────────
router.get("/sak/:sakId", async (req: Request, res: Response) => {
  const session = req.session!;
  const sak = await prisma.sak.findFirst({
    where: { id: req.params.sakId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!sak) return res.status(404).json({ error: "Sak ikke funnet" });

  const emails = await prisma.emailLink.findMany({
    where: { sakId: sak.id },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });
  return res.json({ emails });
});

// ── Manuell kobling ─────────────────────────────────────────────
const LinkSchema = z.object({ sakId: z.string().uuid() });

router.patch("/:id/link", async (req: Request, res: Response) => {
  const parsed = LinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Mangler sakId" });
  }

  const session = req.session!;
  const sak = await prisma.sak.findFirst({
    where: { id: parsed.data.sakId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!sak) return res.status(404).json({ error: "Sak ikke funnet" });

  // Bekreft at e-posten tilhører innloggets org (via gammel sak)
  const existing = await prisma.emailLink.findUnique({
    where: { id: req.params.id },
    include: { sak: { select: { organizationId: true } } },
  });
  if (!existing || existing.sak.organizationId !== session.organizationId) {
    return res.status(404).json({ error: "E-post ikke funnet" });
  }

  const updated = await prisma.emailLink.update({
    where: { id: req.params.id },
    data: { sakId: sak.id },
  });
  return res.json(updated);
});

router.delete("/:id/link", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.emailLink.findUnique({
    where: { id: req.params.id },
    include: { sak: { select: { organizationId: true } } },
  });
  if (!existing || existing.sak.organizationId !== session.organizationId) {
    return res.status(404).json({ error: "E-post ikke funnet" });
  }

  await prisma.emailLink.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

export default router;
