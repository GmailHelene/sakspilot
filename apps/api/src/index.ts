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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl, server-til-server
      if (allowedOrigins.includes(origin)) return callback(null, true);
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[API-feil]", err.message, err.stack);
  res.status(500).json({
    error: "Internfeil",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Sakspilot API kjører på http://localhost:${PORT}`);
  console.log(`   Miljø: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Frontend-origins: ${allowedOrigins.join(", ")}\n`);
});
