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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SakspilotSession;
    }
  }
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token =
    req.cookies?.sakspilot_session ||
    req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    const session = verifySessionToken(token);
    if (session) req.session = session;
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
