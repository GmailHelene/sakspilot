/**
 * Auth-middleware.
 *
 *   authMiddleware  — leser JWT fra cookie eller Authorization-header,
 *                     setter req.session hvis gyldig
 *   requireAuth     — krev innlogget bruker (returnerer 401 hvis ikke)
 *   requireRole     — krev spesifikk rolle
 */
import { Request, Response, NextFunction } from "express";
import {
  verifySessionToken,
  verifyClientSessionToken,
  SakspilotSession,
  SakspilotClientSession,
} from "../services/auth";
import prisma from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SakspilotSession;
      clientSession?: SakspilotClientSession;
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
  // FAIL CLOSED ved manglende tokenVersion. Tidligere returnerte vi true for
  // "JWT fra før tv-feltet ble lagt til", men det betydde at gamle pre-tv
  // tokens kunne leve evig — selv etter passordbytte. Tokens uten tv-claim
  // tvinges nå å re-loginne (8h JWT TTL gjør at det er en engangshendelse).
  if (typeof session.tv !== "number") {
    console.warn(`[auth] Avviser legacy-token uten tv-claim for user=${session.userId} — må re-logge inn`);
    return false;
  }

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

// ─── Klient-portal-auth ───────────────────────────────────────────
//
// Klient-portal har EGNE tokens (scope=client). En vanlig User-token virker
// ikke her, og omvendt. Vi bruker en separat cookie-nøkkel for å unngå
// kollisjon dersom en frilanser og en klient deler nettleser.
//
// Token-versjons-sjekken er identisk i logikk som for User, men leser
// Client.tokenVersion. Egen cache for å hindre at User-cache invalidering
// påvirker klient-revokering og motsatt.

const clientTokenVersionCache = new Map<string, { v: number; expires: number }>();

async function isClientTokenStillValid(
  session: SakspilotClientSession
): Promise<boolean> {
  if (typeof session.tv !== "number") return false; // alltid krev tv på klient — nyere felt
  const cached = clientTokenVersionCache.get(session.clientId);
  if (cached && cached.expires > Date.now()) {
    return cached.v === session.tv;
  }
  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { tokenVersion: true, portalEnabled: true },
  });
  if (!client || !client.portalEnabled) return false;
  clientTokenVersionCache.set(session.clientId, {
    v: client.tokenVersion,
    expires: Date.now() + TV_CACHE_TTL,
  });
  return client.tokenVersion === session.tv;
}

export async function requireClientAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Klient-portalen sender token via Authorization-header (frontend lagrer i
  // localStorage som 'sakspilot_portal_token') ELLER egen cookie. Vi støtter
  // begge for fleksibilitet, men kollideres ikke med User-cookien.
  const token =
    req.cookies?.sakspilot_portal_session ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Ikke innlogget (klient-portal)" });
    return;
  }

  const session = verifyClientSessionToken(token);
  if (!session) {
    res.status(401).json({ error: "Ugyldig eller utløpt klient-token" });
    return;
  }

  if (!(await isClientTokenStillValid(session))) {
    res.status(401).json({ error: "Klient-sesjonen er ikke lenger gyldig" });
    return;
  }

  req.clientSession = session;
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
