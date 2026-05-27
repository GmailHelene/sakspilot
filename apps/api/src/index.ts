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

// ── Rate-limit på /auth (mot brute-force) ───────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                     // 30 forsøk per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange forsøk — prøv igjen om 15 minutter." },
});

// ── Ruter ───────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/auth", authLimiter, authRouter);
app.use("/saker", sakerRouter);
app.use("/klienter", klienterRouter);

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
