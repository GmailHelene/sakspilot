import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

/**
 * GET /health, enkel liveness-sjekk (Railway, UptimeRobot)
 */
router.get("/", (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    service: "sakspilot-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/db, sjekker at databasen svarer
 */
router.get("/db", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, db: "ok" });
  } catch (err) {
    console.error("[Health] DB-sjekk feilet:", err);
    return res.status(503).json({
      ok: false,
      db: "feil",
      error: err instanceof Error ? err.message : "ukjent",
    });
  }
});

/**
 * GET /health/email, debug-endpoint som viser hvilken epost-metode
 * API'en bruker, basert på env-vars. Lekker IKKE selve verdiene.
 *
 * Brukes til å diagnostisere "hvorfor sendes ikke epost"-problemer.
 */
router.get("/email", (_req: Request, res: Response) => {
  const brevoKey = process.env.BREVO_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM;

  const willUse = brevoKey
    ? "brevo_api"
    : (smtpHost && smtpUser && smtpPass)
      ? "smtp_relay"
      : "ingen (stub-modus)";

  return res.json({
    ok: true,
    method: willUse,
    config: {
      BREVO_API_KEY: brevoKey
        ? `set (${brevoKey.length} tegn, starter med "${brevoKey.slice(0, 8)}...")`
        : "ikke satt",
      SMTP_HOST: smtpHost || "ikke satt",
      SMTP_PORT: smtpPort || "ikke satt (default 587)",
      SMTP_USER: smtpUser ? `set (${smtpUser.slice(0, 3)}...)` : "ikke satt",
      SMTP_PASS: smtpPass ? `set (${smtpPass.length} tegn)` : "ikke satt",
      EMAIL_FROM: emailFrom || "ikke satt (default noreply@sakspilot.no)",
    },
    note: "method=brevo_api betyr Brevo HTTP API brukes. method=smtp_relay betyr nodemailer/SMTP.",
  });
});

export default router;
