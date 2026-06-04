/**
 * /feedback, pilot-feedback fra brukere som tester Sakspilot.
 *
 *   POST /feedback , opprett feedback knyttet til innlogget bruker + org
 *
 * Helene leser via Prisma Studio (eller liten admin-side senere).
 * Rate-limit: maks 5 innsendinger per døgn per bruker.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const FeedbackSchema = z.object({
  whatWorksBest: z.string().trim().max(1000).optional().nullable(),
  whatFrustrates: z.string().trim().max(1000).optional().nullable(),
  whatIsMissing: z.string().trim().max(1000).optional().nullable(),
  wantsVideoCall: z.boolean().optional().default(false),
});

/**
 * POST /feedback
 * Oppretter en ny feedback-rad for innlogget bruker.
 * Krever at minst ett av tekst-feltene eller wantsVideoCall=true er satt,
 * slik at vi ikke får tomme rader fra dobbelttrykk.
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten(),
    });
  }

  const { userId, organizationId } = req.session!;

  // Normaliser tomme strenger til null så DB-en holdes ren
  const normalize = (s: string | null | undefined): string | null => {
    if (s === undefined || s === null) return null;
    const trimmed = s.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const data = {
    whatWorksBest: normalize(parsed.data.whatWorksBest),
    whatFrustrates: normalize(parsed.data.whatFrustrates),
    whatIsMissing: normalize(parsed.data.whatIsMissing),
    wantsVideoCall: parsed.data.wantsVideoCall ?? false,
  };

  // Krev at noe substansielt er fylt inn
  if (
    !data.whatWorksBest &&
    !data.whatFrustrates &&
    !data.whatIsMissing &&
    !data.wantsVideoCall
  ) {
    return res.status(400).json({
      error: "Tom tilbakemelding",
      message: "Skriv minst én kommentar eller huk av for video-samtale.",
    });
  }

  // Rate-limit: maks 5 per døgn per bruker
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.feedback.count({
    where: {
      userId,
      submittedAt: { gt: dayAgo },
    },
  });
  if (recentCount >= 5) {
    return res.status(429).json({
      error: "For mange innsendinger",
      message:
        "Du har allerede sendt inn 5 tilbakemeldinger det siste døgnet. Vent litt før du sender flere.",
    });
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId,
      organizationId,
      ...data,
    },
    select: {
      id: true,
      submittedAt: true,
    },
  });

  return res.status(201).json(feedback);
});

export default router;
