/**
 * Sakspilot API — Express bootstrap.
 *
 * Mønster portet fra ByggPilot:
 *   - helmet for sikkerhets-headere
 *   - cors med credentials for cross-site frontend
 *   - cookie-parser for JWT-cookies
 *   - rate-limiter på /auth-rutene
 *   - express-async-errors for at thrown errors i async-handlers
 *     fanges av error-middleware uten try/catch overalt
 */
import "dotenv/config";
import "express-async-errors";

// ⚠ Sentry MÅ initialiseres før Express importeres for at v8 auto-instrumentation
// skal funke. Kalles bare hvis SENTRY_DSN er satt — krasjer ikke uten.
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 10% av requests sampled
    // PII filtreres ut — vi vil ikke ha klient-emails/navn i error-rapporter
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip ev. token-headere fra requests
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });
  console.log("[Sentry] Aktivert for environment:", process.env.NODE_ENV);
}

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { authMiddleware } from "./middleware/auth";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import sakerRouter from "./routes/saker";
import klienterRouter from "./routes/klienter";
import agentRouter from "./routes/agent";
import stickiesRouter from "./routes/stickies";
import meRouter from "./routes/me";
import automationsRouter from "./routes/automations";
import reportsRouter from "./routes/reports";
import { authRouter as shareAuthRouter, publicRouter as sharePublicRouter } from "./routes/share";
import aiRouter from "./routes/ai";
import oauthRouter from "./routes/oauth";
import emailsRouter from "./routes/emails";
import accountingRouter from "./routes/accounting";
import billingRouter from "./routes/billing";

const app = express();
const PORT = Number(process.env.PORT) || 8001;

// ── Sikkerhets-headere ──────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // satt på frontend istedenfor
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ── CORS ────────────────────────────────────────────────────────
// FRONTEND_URL kan være kommaseparert liste (dev + prod)
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3001")
  .split(",")
  .map((s) => s.trim());

const isDev = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl, server-til-server
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // I dev: tillat alle localhost-origins (Electron, ulike porter,
      // Next.js rewrites som proxer fra port 3001 → 8001 osv.)
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // I prod: tillat alle Vercel-deploy-URLer (sakspilot-web-*.vercel.app)
      // og alle Render-genererte URLer (sakspilot*.onrender.com).
      // Dette dekker preview-deploys uten å måtte oppdatere env-vars.
      // VIKTIG: strengt regex — kun [a-z0-9-] mellom "sakspilot" og ".vercel.app"
      // for å unngå at sakspilotXevil.vercel.app passerer.
      if (/^https:\/\/sakspilot(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      if (/^https:\/\/sakspilot(-[a-z0-9-]+)?\.onrender\.com$/.test(origin)) {
        return callback(null, true);
      }
      // Custom domain (apex + www)
      if (/^https:\/\/(www\.)?sakspilot\.no$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS: origin ikke tillatt: ${origin}`));
    },
    credentials: true,
  })
);

// ── Body + cookies + logging ────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));

// ── Auth (leser JWT hvis tilstede, setter req.session) ──────────
app.use(authMiddleware);

// ── Rate-limit på /auth ─────────────────────────────────────────
// Splittet i 'write' (login/register/forgot/reset — streng, mot brute-force)
// og 'read' (me/logout — løs, kalles automatisk på hver page-load).
// Tidligere brukte begge typer samme 30/15min-limit, som lett ble brukt opp
// av normal navigasjon (Helene rapporterte: 'For mange forsøk' uten å ha
// gjort noe spesielt). Skill nå tydelig på sikkerhetsbehov.
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                     // 30 login/register/forgot/reset per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange påloggings-forsøk — prøv igjen om 15 minutter." },
});

const authReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,                    // 120 /auth/me + /auth/logout per minutt per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange sesjons-sjekker — vent et minutt." },
});

// AI er dyrt — strammere limit per IP (forhindrer "API-tyveri" ved
// stjålet JWT og forhindrer kostnads-bomb hvis bot misbruker)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,                     // 20 AI-kall per minutt per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange AI-forespørsler — vent et minutt." },
});

// OAuth init: bot-resistent
const oauthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endepunkter (delte saker) — sikrer mot enumeration
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Ruter ───────────────────────────────────────────────────────
app.use("/health", healthRouter);
// Auth-routes må appliseres med riktig limiter avhengig av handling.
// Vi monter routeren med en wrapper-handler som velger limiter basert på path.
app.use("/auth", (req, res, next) => {
  // Skrive-handlinger (bruteforce-utsatt): login, register, forgot, reset, change-password, logout-all
  const writePaths = ['/login', '/register', '/forgot-password', '/reset-password', '/change-password', '/logout-all'];
  const isWrite = writePaths.some((p) => req.path === p);
  if (isWrite) {
    return authWriteLimiter(req, res, () => authRouter(req, res, next));
  }
  // /auth/me, /auth/logout og andre lese-handlinger: løs limit
  return authReadLimiter(req, res, () => authRouter(req, res, next));
});
app.use("/saker", sakerRouter);
app.use("/klienter", klienterRouter);
app.use("/agent", agentRouter);
app.use("/stickies", stickiesRouter);
app.use("/me", meRouter);
app.use("/automations", automationsRouter);
app.use("/reports", reportsRouter);
app.use("/saker", shareAuthRouter);   // /saker/:sakId/share (delt prefix med sakerRouter — fungerer)
app.use("/public", publicLimiter, sharePublicRouter); // /public/sak/:token
app.use("/ai", aiLimiter, aiRouter);
app.use("/oauth", oauthLimiter, oauthRouter);
app.use("/emails", emailsRouter);
app.use("/accounting", accountingRouter);
app.use("/billing", billingRouter);

// ── Root ────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  return res.json({
    service: "Sakspilot API",
    version: "0.1.0",
    docs: "https://github.com/[brukernavn]/sakspilot",
  });
});

// ── Error-handler — fanger thrown errors fra async handlers ─────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Send til Sentry hvis aktivert
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { method: req.method, path: req.path },
      extra: {
        body: typeof req.body === "object" ? JSON.stringify(req.body).slice(0, 500) : req.body,
      },
    });
  }

  // Logg alltid full feil til konsoll (med rute + body for kontekst)
  console.error(
    `\n[API-feil] ${req.method} ${req.path}\n`,
    `  message: ${err.message}\n`,
    `  body:    ${JSON.stringify(req.body)?.slice(0, 200)}\n`,
    err.stack
  );

  // I ikke-produksjon: eksponer feilmelding + Prisma-detaljer i responsen.
  // Standardiserer på NODE_ENV !== "production" så vi alltid får debug-info
  // lokalt selv om NODE_ENV ikke er satt eller blir "development" vs udefinert.
  const isProd = process.env.NODE_ENV === "production";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaErr = err as any;
  res.status(500).json({
    error: "Internfeil",
    message: isProd ? undefined : err.message,
    code: isProd ? undefined : prismaErr.code,
    meta: isProd ? undefined : prismaErr.meta,
  });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Sakspilot API kjører på http://localhost:${PORT}`);
  console.log(`   Miljø: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Frontend-origins: ${allowedOrigins.join(", ")}\n`);
});
