/**
 * Auth-middleware.
 *
 *   authMiddleware  — leser JWT fra cookie eller Authorization-header,
 *                     setter req.session hvis gyldig
 *   requireAuth     — krev innlogget bruker (returnerer 401 hvis ikke)
 *   requireRole     — krev spesifikk rolle
 */
import { Request, Response, NextFunction } from "express";
import { verifySessionToken, SakspilotSession } from "../services/auth";
import prisma from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SakspilotSession;
    }
  }
}

/**
 * Liten cache for User.tokenVersion. Sparer DB-lookup ved hver request.
 * Invalidating: TTL 30 sek — etter logg-ut tar det opp til 30 sek før
 * gamle tokens faktisk avvises. Trade-off mellom DB-belastning og
 * revocation-latency.
 */
const tokenVersionCache = new Map<string, { v: number; expires: number }>();
const TV_CACHE_TTL = 30_000;

async function isTokenStillValid(session: SakspilotSession): Promise<boolean> {
  // Hvis JWT er fra før vi la til tv-feltet (undefined), godta — men kun en kort
  // overgang. Etter alle har logget inn på nytt kan vi gjøre dette strengt.
  if (typeof session.tv !== "number") return true;

  const cached = tokenVersionCache.get(session.userId);
  if (cached && cached.expires > Date.now()) {
    return cached.v === session.tv;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tokenVersion: true },
  });
  if (!user) return false;
  tokenVersionCache.set(session.userId, {
    v: user.tokenVersion,
    expires: Date.now() + TV_CACHE_TTL,
  });
  return user.tokenVersion === session.tv;
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    req.cookies?.sakspilot_session ||
    req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const session = verifySessionToken(token);
    if (session && (await isTokenStillValid(session))) {
      req.session = session;
    }
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session) {
    res.status(401).json({ error: "Ikke innlogget" });
    return;
  }
  next();
}

export function requireRole(...roles: Array<"owner" | "member" | "admin">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: "Ikke innlogget" });
      return;
    }
    if (!roles.includes(req.session.role)) {
      res.status(403).json({
        error: "Ingen tilgang",
        message: `Krever rolle: ${roles.join(" eller ")}`,
      });
      return;
    }
    next();
  };
}
