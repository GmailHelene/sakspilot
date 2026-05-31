/**
 * customDomain-middleware.
 *
 * Leser Host-header (eller x-forwarded-host bak Vercel/Render proxy) og slår
 * opp i CustomDomain-tabellen. Hvis verifisert match: setter req.customDomain
 * = { organizationId, branding } så routes (særlig clientPortal) kan inkludere
 * branding i responsen og frontend kan whitelabele portal-UI.
 *
 * Hvis ingen match: req.customDomain forblir undefined → default sakspilot.no-
 * branding brukes.
 *
 * Plassering: monteres GLOBALT i index.ts FØR rutene, slik at alle routes har
 * tilgang til req.customDomain. Authmiddleware kjører fortsatt uavhengig —
 * customDomain forteller bare "denne requesten kom inn på et whitelabel-
 * domene", IKKE "denne brukeren tilhører denne orgen". Auth-scope baseres
 * fortsatt på JWT.
 */
import { Request, Response, NextFunction } from "express";
import { getOrgByHostname, normalizeHostname, CustomDomainInfo } from "../lib/customDomainLookup";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customDomain?: CustomDomainInfo;
    }
  }
}

export async function customDomainMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Forwarded-host fra reverse proxy (Vercel/Render setter denne).
  // Tar første verdi hvis kommaseparert (X-Forwarded-Host: a, b → a).
  const forwarded = req.headers["x-forwarded-host"];
  const fwdRaw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const fwdHost = fwdRaw ? fwdRaw.split(",")[0].trim() : null;
  const rawHost = fwdHost || req.headers.host || null;

  const hostname = normalizeHostname(rawHost);

  // Default-domener vi vet ikke skal slå opp i custom-tabellen (mikrooptimalisering
  // som også gjør at lokale dev-requests aldri treffer DB unødvendig).
  if (
    !hostname ||
    hostname === "sakspilot.no" ||
    hostname === "www.sakspilot.no" ||
    hostname.startsWith("localhost") ||
    hostname.endsWith(".vercel.app") ||
    hostname.endsWith(".onrender.com")
  ) {
    return next();
  }

  try {
    const match = await getOrgByHostname(hostname);
    if (match) {
      req.customDomain = match;
    }
  } catch (err) {
    // Ikke krasje requesten hvis DB-oppslag feiler — fall tilbake til
    // default-branding. Logg for synlighet.
    console.warn(`[customDomain] lookup feilet for ${hostname}:`, err);
  }

  next();
}
