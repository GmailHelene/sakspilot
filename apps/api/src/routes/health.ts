import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

/**
 * GET /health — enkel liveness-sjekk (Railway, UptimeRobot)
 */
router.get("/", (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    service: "sakspilot-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/db — sjekker at databasen svarer
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

export default router;
