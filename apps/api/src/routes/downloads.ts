/**
 * Download-lead capture (offentlig, ingen auth).
 *
 * POST /downloads/lead { email, name?, platform }
 *   - Logger leaden i audit-log med action "download.lead_submitted"
 *   - Sender velkomst-mail (samme som registrering, men markert som
 *     "download-lead" sa pilot-status kan skille)
 *   - Returnerer { ok: true } slik at frontend kan vise download-knappen
 *
 * Hensikt: Helene som operator skal kunne se hvem som har lastet ned
 * EXE selv om de ikke har registrert seg. Dagens GitHub Releases gir
 * bare totalantall, ikke per-bruker. Med denne email-gate-en faar vi:
 *   - Email + valgfritt navn
 *   - Plattform (win/mac/linux)
 *   - Timestamp
 *   - IP + User-Agent (for spam-deteksjon)
 *
 * Plassert som offentlig endepunkt under publicLimiter sa det ikke
 * gjelder authWriteLimiter (som ville feilet for utloggede besokende).
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { sendEmail, downloadLeadFollowupEmail } from "../lib/email";

// Maskerer e-post for logging (GDPR/PII): "kari.normann@example.com" -> "kar***@example.com".
function maskEmail(e: string): string {
  if (!e || typeof e !== "string") return "***@unknown";
  const [l, d] = e.split("@");
  return (l.slice(0, 3) + "***@" + (d || "unknown"));
}

const router = Router();

const PLATFORMS = ["win", "mac-arm", "mac-intel", "linux"] as const;

const LeadSchema = z.object({
  email: z.string().email("Ugyldig e-postadresse").max(200),
  name: z.string().max(120).optional(),
  platform: z.enum(PLATFORMS),
  /** Hvor leaden kom fra (optional, frontend kan setter "landing" eller "co-pilot") */
  source: z.string().max(60).optional(),
});

router.post("/lead", async (req: Request, res: Response) => {
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, name, platform, source } = parsed.data;
  const emailNorm = email.toLowerCase().trim();

  // Sjekk om det allerede finnes en bruker med denne e-posten. Hvis ja,
  // hopp over lead-loggingen (vi har dem allerede i system) men gi
  // dem download-tilgang.
  const existingUser = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true },
  });

  if (!existingUser) {
    // Logg i audit som "download.lead_submitted". userId og organizationId
    // er null fordi dette er et offentlig lead - vi har ingen tenant enda.
    await prisma.auditLog.create({
      data: {
        userId: null,
        organizationId: null,
        action: "download.lead_submitted",
        entityType: "download_lead",
        entityId: null,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        metadata: {
          email: emailNorm,
          name: name ?? null,
          platform,
          source: source ?? "last-ned-side",
        },
      },
    });

    // Send oppfolgings-epost. Ikke-blokkerende, hvis Brevo er nede skal
    // download fortsatt funke.
    sendEmail(downloadLeadFollowupEmail({ email: emailNorm, name: name ?? null, platform }))
      .catch((err) => console.warn("[downloads/lead] Email send feilet:", err));

    console.log(`[downloads/lead] Ny download-lead: ${maskEmail(emailNorm)} (${platform})`);
  } else {
    console.log(`[downloads/lead] Eksisterende bruker laster ned: ${maskEmail(emailNorm)} (${platform}) - hopper over lead-logging`);
  }

  return res.json({ ok: true });
});

export default router;
