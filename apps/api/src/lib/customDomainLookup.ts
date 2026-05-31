/**
 * Hostname → organisasjon-resolver med in-memory cache.
 *
 * Brukes av customDomain-middleware på HVER request. Slår opp om Host-headeren
 * matcher et verifisert CustomDomain, og returnerer org-id + branding-overrides.
 *
 * Cache:
 *   - TTL 5 min — custom-domener endrer seg sjelden (kun ved add/verify/branding-
 *     edit). Vi inverterer cachen ved mutasjon via invalidateHostname() så
 *     branding-endringer slår gjennom umiddelbart, men feilet/utløpt opplaste
 *     domener gir maks 5 min stale-window.
 *   - Negative cache (null-resultat) lagres også — uten dette vil hver request
 *     mot Host: sakspilot.no (vanligste case!) gå mot DB.
 *   - Map<string, { value, expires }>. Bevisst ingen LRU — antall unike
 *     custom-domener forventet < 100 i pilot, ikke verdt kompleksiteten.
 */
import prisma from "./prisma";

export interface CustomDomainInfo {
  organizationId: string;
  hostname: string;
  brandName: string | null;
  brandTagline: string | null;
  brandPrimaryColor: string | null;
  brandLogoUrl: string | null;
}

interface CacheEntry {
  value: CustomDomainInfo | null;
  expires: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, CacheEntry>();

/**
 * Normaliser hostname for konsistent oppslag/lagring. Strip port (host kan
 * være "klienter.helenetech.no:443" via x-forwarded-host i edge-tilfeller),
 * lowercase, trim.
 */
export function normalizeHostname(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip port
  const noPort = trimmed.split(":")[0];
  // Strip ev. trailing dot (FQDN)
  return noPort.replace(/\.$/, "");
}

export async function getOrgByHostname(
  hostname: string
): Promise<CustomDomainInfo | null> {
  const cached = cache.get(hostname);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const domain = await prisma.customDomain.findUnique({
    where: { hostname },
    select: {
      organizationId: true,
      hostname: true,
      verified: true,
      brandName: true,
      brandTagline: true,
      brandPrimaryColor: true,
      brandLogoUrl: true,
    },
  });

  let value: CustomDomainInfo | null = null;
  if (domain && domain.verified) {
    value = {
      organizationId: domain.organizationId,
      hostname: domain.hostname,
      brandName: domain.brandName,
      brandTagline: domain.brandTagline,
      brandPrimaryColor: domain.brandPrimaryColor,
      brandLogoUrl: domain.brandLogoUrl,
    };
  }

  cache.set(hostname, { value, expires: Date.now() + TTL_MS });
  return value;
}

/**
 * Tvinger cache-invalidering for et hostname. Kalles fra customDomain-routene
 * etter verify, branding-edit, og delete så endringer slår gjennom umiddelbart.
 */
export function invalidateHostname(hostname: string): void {
  cache.delete(hostname);
}

/**
 * Tøm hele cachen. Brukes i tester og ved migreringer.
 */
export function clearCustomDomainCache(): void {
  cache.clear();
}
