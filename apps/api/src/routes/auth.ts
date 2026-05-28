/**
 * Auth-routes — register, login, me, logout, change-password.
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

const router = Router();

// Cookie-innstillinger — SameSite=None+Secure kreves når API og web er
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
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: organizationName?.trim() || `${name.trim()} (Solo)`,
        plan: "solo",
        billingEmail: emailNorm,
      },
    });

    const user = await tx.user.create({
      data: {
        email: emailNorm,
        passwordHash,
        name: name.trim(),
        role: "owner",
        organizationId: org.id,
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
    // JWT er gyldig, men bruker er slettet — ugyldigjør sesjonen
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
 * POST /auth/logout — logger ut KUN denne enheten (sletter cookie).
 * Andre enheter beholder gyldig token til /auth/logout-all.
 */
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("sakspilot_session", COOKIE_OPTIONS);
  return res.json({ ok: true });
});

/**
 * POST /auth/logout-all — invaliderer ALLE eksisterende tokens for bruker.
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

export default router;
