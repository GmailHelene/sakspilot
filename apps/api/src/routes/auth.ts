/**
 * Auth-routes, register, login, me, logout, change-password.
 *
 * Forskjellig fra ByggPilot:
 *   - Ingen ID-porten (sluttbrukerne er privatpersoner/SMB-eiere, ikke kommune)
 *   - Hver bruker eier sin egen organization (auto-opprettes ved register)
 *   - "owner"-rolle gis automatisk til den som registrerer
 *   - Team-medlemmer legges til av eier (kommer i Pro+/Team-plan)
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  constantTimeDelay,
  SakspilotSession,
} from "../services/auth";
import { requireAuth } from "../middleware/auth";
import { sendEmail, passwordResetEmail, welcomeEmail } from "../lib/email";

const router = Router();

// Cookie-innstillinger, SameSite=None+Secure kreves når API og web er
// på ulike Railway-domener (cross-site). Trygt på localhost (browsers
// regner localhost som "trustworthy origin").
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  maxAge: 8 * 60 * 60 * 1000,
};

const RegisterSchema = z.object({
  email: z.string().email("Ugyldig e-postadresse"),
  password: z.string().min(8, "Passordet må være minst 8 tegn"),
  name: z.string().min(1, "Skriv inn navn").max(120),
  organizationName: z.string().min(1).max(160).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Nytt passord må være minst 8 tegn"),
});

/**
 * POST /auth/register
 * Selvregistrering. Oppretter både User og Organization i samme transaksjon.
 * Den nye brukeren blir "owner" av sin egen org.
 */
router.post("/register", async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, password, name, organizationName } = parsed.data;
  const emailNorm = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (existing) {
    await constantTimeDelay();
    return res.status(409).json({ error: "E-postadressen er allerede registrert" });
  }

  const passwordHash = await hashPassword(password);

  // Atomisk: opprett org + user samtidig. Hvis user-opprettelsen feiler,
  // rulles org-opprettelsen tilbake.
  // Pilot-perioden er gratis frem til denne datoen, alle nye orgs gratis.
  const PILOT_UNTIL = new Date("2026-12-31T23:59:59Z");
  // Trial 14 dager fra registrering, relevant ETTER pilotperioden slutter.
  const trialEnd = new Date(Date.now() + 14 * 86400000);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: organizationName?.trim() || `${name.trim()} (Solo)`,
        plan: "solo",
        billingEmail: emailNorm,
        pilotUntil: PILOT_UNTIL,
      },
    });

    const user = await tx.user.create({
      data: {
        email: emailNorm,
        passwordHash,
        name: name.trim(),
        role: "owner",
        organizationId: org.id,
        trialEndsAt: trialEnd,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        action: "user.registered",
        entityType: "user",
        entityId: user.id,
      },
    });

    return { user, org };
  });

  const session: SakspilotSession = {
    userId: result.user.id,
    organizationId: result.org.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role as SakspilotSession["role"],
    tv: result.user.tokenVersion,
  };

  const token = createSessionToken(session);
  res.cookie("sakspilot_session", token, COOKIE_OPTIONS);

  console.log(`[Auth] Registrert: ${result.user.email} (${result.org.name})`);

  // Velkomst-e-post (dag 0 i onboarding-drip). Skal IKKE blokkere registrering
  // hvis SMTP feiler, try/catch + ingen await på respons.
  // Cron-jobben jobs/onboardingDrip.ts håndterer dag 3/7/14.
  try {
    const emailResult = await sendEmail(
      welcomeEmail({ email: result.user.email, name: result.user.name })
    );
    if (!emailResult.ok) {
      console.warn(
        `[Auth] Velkomst-e-post kunne ikke sendes til ${result.user.email}: ${emailResult.error}`
      );
    }
  } catch (err) {
    console.error("[Auth] Velkomst-e-post feilet (ignorert):", err);
  }

  return res.status(201).json({
    ok: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      organizationId: result.org.id,
      organizationName: result.org.name,
    },
    token,
  });
});

/**
 * POST /auth/login
 * Innlogging med e-post + passord.
 * Returnerer JWT i cookie OG i body (sistnevnte som fallback for cross-site).
 */
router.post("/login", async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    await constantTimeDelay();
    return res.status(400).json({ error: "Fyll inn e-post og passord" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { organization: true },
  });

  if (!user || !user.passwordHash) {
    await constantTimeDelay();
    return res.status(401).json({ error: "Feil e-post eller passord" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Feil e-post eller passord" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const session: SakspilotSession = {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role as SakspilotSession["role"],
    tv: user.tokenVersion,
  };

  const token = createSessionToken(session);
  res.cookie("sakspilot_session", token, COOKIE_OPTIONS);

  console.log(`[Auth] Innlogget: ${user.email}`);

  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
    },
    token,
  });
});

/**
 * GET /auth/me
 * Returnerer innlogget bruker. 401 hvis ikke innlogget.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const session = req.session!;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { organization: true },
  });

  if (!user) {
    // JWT er gyldig, men bruker er slettet, ugyldigjør sesjonen
    res.clearCookie("sakspilot_session", COOKIE_OPTIONS);
    return res.status(401).json({ error: "Brukeren finnes ikke lenger" });
  }

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hourlyRate: user.hourlyRate,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    organizationPlan: user.organization.plan,
  });
});

/**
 * POST /auth/logout, logger ut KUN denne enheten (sletter cookie).
 * Andre enheter beholder gyldig token til /auth/logout-all.
 */
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("sakspilot_session", COOKIE_OPTIONS);
  return res.json({ ok: true });
});

/**
 * POST /auth/logout-all, invaliderer ALLE eksisterende tokens for bruker.
 * Bumper User.tokenVersion → middleware avviser alle gamle JWTer.
 * Krever innlogging (du må ha en gyldig token for å si "logg meg ut alle steder").
 */
router.post("/logout-all", requireAuth, async (req: Request, res: Response) => {
  const session = req.session!;
  await prisma.user.update({
    where: { id: session.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "user.logout_all_devices",
      entityType: "user",
      entityId: session.userId,
    },
  });
  res.clearCookie("sakspilot_session", COOKIE_OPTIONS);
  return res.json({ ok: true, message: "Logget ut fra alle enheter" });
});

/**
 * POST /auth/change-password
 */
router.post(
  "/change-password",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Ugyldig input",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const session = req.session!;
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) {
      return res.status(400).json({ error: "Kontoen mangler passord" });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Feil nåværende passord" });
    }

    const newHash = await hashPassword(newPassword);
    // Bump tokenVersion → invaliderer alle eksisterende tokens overalt.
    // Brukeren må logge inn på nytt på alle enheter (god sikkerhetspraksis
    // ved passordbytte).
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: session.organizationId,
        action: "user.password_changed",
        entityType: "user",
        entityId: user.id,
      },
    });

    return res.json({ ok: true, message: "Passord oppdatert" });
  }
);

// ── Glemt passord ───────────────────────────────────────────────

/**
 * POST /auth/forgot-password
 *
 * Genererer et engangstoken, lagrer SHA-256-hashen + utløp på User, og
 * logger reset-lenken til server-logg. I pilotfase sender vi IKKE e-post
 * (krever Postmark/SendGrid/Resend-oppsett), Helene videresender lenken
 * manuelt eller får brukeren til å sjekke logger.
 *
 * Returnerer alltid 200 ok (selv hvis e-post ikke finnes), så vi ikke
 * lekker hvilke e-poster som har konto.
 *
 * I dev/pilot: returnerer resetToken og resetUrl i response så Helene kan
 * sende manuelt. Dette skal IKKE skje i prod, fjernes når SMTP er på plass.
 */
const ForgotSchema = z.object({
  email: z.string().email().max(200),
});

// Konstant-tid sentinel: dummy bcrypt-hash som vi sammenligner mot for
// brukere som IKKE finnes. Gir oss ~80-100ms CPU-arbeid (samme som
// en ekte bcrypt.compare på prod-runden) så timing-forskjellen mellom
// "user finnes" og "user finnes ikke" forsvinner. Hashen er "doesnotexist"
// kryptert med bcrypt cost-faktor 12 (samme som vi bruker for prod-passord).
const TIMING_PAD_HASH = "$2b$12$Wn1.Z7ScJxNmRSqWaIu/MumPHnNFYsX0wjWX3pHJtPiwzMt4UbWAi";

// Minimum total responstid for forgot-password. Den ekte flyten
// (DB-write + auditLog + Brevo HTTP-API) tar 300-700ms i prod. Vi padder
// derfor opp til 500ms minimum så "user finnes ikke"-grenen ikke kan
// avsløres via timing-måling.
const FORGOT_MIN_MS = 500;

router.post("/forgot-password", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const parsed = ForgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig e-post" });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email } });
  // Genererer alltid token (selv om user ikke finnes) for å unngå timing-leak
  const crypto = await import("crypto");
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 time

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: "user.password_reset_requested",
        entityType: "user",
        entityId: user.id,
      },
    });
  }

  const webOrigin = process.env.WEB_ORIGIN || "https://sakspilot.no";
  const resetUrl = `${webOrigin}/reset-passord?token=${rawToken}`;

  // Send e-post hvis SMTP er konfigurert. Hvis ikke (eller send feiler),
  // logges lenken til konsollen og returneres i _devResetUrl-feltet for fallback.
  let emailSent = false;
  if (user) {
    const result = await sendEmail(passwordResetEmail(email, resetUrl));
    emailSent = result.ok;
    if (!result.ok) {
      console.log(
        `[forgot-password] SMTP fallback - reset-lenke for ${email}: ${resetUrl}` +
          (result.error ? ` (årsak: ${result.error})` : "")
      );
    } else {
      console.log(`[forgot-password] Reset-lenke sendt til ${email} (msg: ${result.messageId})`);
    }
  } else {
    // CPU-arbeid for konstant timing: ekvivalent med verifyPassword i login-flyten.
    // Uten dette returnerer "user finnes ikke"-grenen i 5ms vs ~500ms for "finnes",
    // som angriper kan bruke til bruker-enumerering via repeated POSTs.
    await verifyPassword("dummy-passord-for-timing-pad", TIMING_PAD_HASH);
    console.log(`[forgot-password] Ingen bruker med e-post ${email} (ignorert)`);
  }

  // _devResetUrl returneres BARE i lokal dev (NODE_ENV='development').
  // Tidligere falt vi tilbake til å lekke URL-en hvis emailSent=false selv i
  // prod ("siste utvei for piloter"), det er en bruker-enumerering-vektor og
  // potensielt en konto-overtakelsesvektor hvis noen sniffer responser.
  // Logger fortsatt URLen til API-konsollen for prod-fallback (du må logge inn
  // på Render Logs for å hente den), men eksponerer den IKKE i HTTP-respons.
  const showDevUrl = user && process.env.NODE_ENV === "development";
  if (user && !emailSent && process.env.NODE_ENV !== "development") {
    console.warn(`[forgot-password] SMTP feilet for ${email}. Reset-URL: ${resetUrl}`);
  }

  // Tidskonstant respons: padd opp til FORGOT_MIN_MS slik at både
  // "user finnes" og "user finnes ikke" tar minst like lang tid.
  const elapsed = Date.now() - startedAt;
  if (elapsed < FORGOT_MIN_MS) {
    await new Promise((r) => setTimeout(r, FORGOT_MIN_MS - elapsed));
  }

  return res.json({
    ok: true,
    message:
      "Hvis kontoen finnes, har vi sendt en reset-lenke til e-postadressen. Sjekk innboksen.",
    ...(showDevUrl ? { _devResetUrl: resetUrl } : {}),
  });
});

/**
 * POST /auth/reset-password
 *
 * Verifiserer at tokenet matcher en bruker og ikke er utløpt, setter nytt
 * passord, bumper tokenVersion (invaliderer alle eksisterende sesjoner).
 */
const ResetSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: z.string().min(12).max(200),
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input - passordet må være minst 12 tegn",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const { token, newPassword } = parsed.data;
  const crypto = await import("crypto");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gte: new Date() },
    },
  });
  if (!user) {
    return res.status(400).json({
      error: "Lenken er ugyldig eller utløpt. Be om ny reset-lenke.",
    });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId,
      action: "user.password_reset_completed",
      entityType: "user",
      entityId: user.id,
    },
  });

  return res.json({
    ok: true,
    message: "Passord oppdatert. Logg inn med det nye passordet.",
  });
});

export default router;
