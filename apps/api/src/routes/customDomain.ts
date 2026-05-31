/**
 * Custom domener (whitelabel) — egne domener som peker til frilanserens
 * klient-portal med deres egen branding.
 *
 * Flow:
 *   1. Frilanser legger til hostname via POST /custom-domains
 *      → vi genererer verificationToken (random hex), returnerer DNS-
 *        instruksjoner: TXT-record på _sakspilot-verify.{hostname}
 *   2. Frilanser legger til TXT-recorden hos sin DNS-leverandør
 *   3. Frilanser trykker "Verifiser nå" → POST /custom-domains/:id/verify
 *      → vi gjør dns.resolveTxt og sjekker om noen verdi matcher
 *      → hvis match: verified=true, verifiedAt=now, audit-log
 *   4. Frilanser oppdaterer branding via PATCH /custom-domains/:id/branding
 *   5. Helene legger til domenet manuelt i Vercel-prosjektet (utenfor scope
 *      for MVP — auto-SSL/Vercel API-integrasjon kommer senere)
 *   6. Klient-portal lastet på hostnamet leser branding via customDomain-
 *      middleware → /client-portal/me-respons inneholder branding-felter
 *
 * Sikkerhet:
 *   - requireAuth + organisasjons-scope på alle endpoints (cross-org-tilgang
 *     umulig fordi vi filtrerer på session.organizationId)
 *   - Owner-only på POST/PATCH/DELETE (verify kan member også gjøre — det
 *     er en sjekk, ikke en konfigurasjons-mutasjon)
 *   - Hostname-validering: lowercase, gyldig DNS-syntax (FQDN), ikke i
 *     blocked-liste (sakspilot.no, vercel.app, *.vercel.app etc.)
 *   - verificationToken bevares som ren tekst i DB (det er IKKE et secret —
 *     poenget er å bevise DNS-kontroll. Hvis noen leser DB-en har de allerede
 *     verifisert det andre domenet)
 *   - DNS-lookup har timeout via Promise.race (Node dns/promises har ikke
 *     innebygd timeout) for å forhindre at en treg DNS-server henger requesten
 *   - Cache invalideres ved verify, branding-edit, og delete
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import dns from "node:dns/promises";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { invalidateHostname, normalizeHostname } from "../lib/customDomainLookup";

const router = Router();
router.use(requireAuth);

// ── Schemas ─────────────────────────────────────────────────────

/**
 * DNS-hostname-validering. Tillater bokstaver, tall, bindestrek, prikk.
 * Ingen underscore (gyldig i record-navn, ikke i hostname).
 * Min 1 punktum (subdomain.tld), maks 253 chars (RFC 1035).
 */
const HOSTNAME_REGEX = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Domener vi nekter — egne brand-domener + kjente reserverte.
 * Forhindrer at noen "kaprer" sakspilot.no eller vercel.app-subdomener.
 */
const BLOCKED_SUFFIXES = [
  "sakspilot.no",
  "vercel.app",
  "vercel.com",
  "onrender.com",
  "render.com",
  "localhost",
  "local",
];

function isBlockedHostname(hostname: string): boolean {
  for (const blocked of BLOCKED_SUFFIXES) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return true;
    }
  }
  return false;
}

const AddDomainSchema = z.object({
  hostname: z
    .string()
    .min(4)
    .max(253)
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => HOSTNAME_REGEX.test(s), {
      message: "Ugyldig hostname. Bruk format som 'klienter.dittfirma.no'.",
    })
    .refine((s) => !isBlockedHostname(s), {
      message:
        "Dette domenet kan ikke brukes (egne Sakspilot-domener eller plattform-subdomener er reserverte).",
    }),
});

const BrandingSchema = z.object({
  brandName: z.string().max(80).nullable().optional(),
  brandTagline: z.string().max(120).nullable().optional(),
  brandPrimaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Bruk hex-farge på formen #RRGGBB")
    .nullable()
    .optional(),
  brandLogoUrl: z
    .string()
    .max(1000)
    .url("Logo-URL må være en gyldig URL")
    .nullable()
    .optional(),
});

// ── Hjelpere ────────────────────────────────────────────────────

function generateVerificationToken(): string {
  // 16 bytes = 32 hex tegn = 128 bits entropi — mer enn nok for et offentlig
  // verifiserings-token (det er IKKE et secret — alle som kan lese DNS kan se
  // det. Poenget er å bevise DNS-kontroll).
  return crypto.randomBytes(16).toString("hex");
}

function buildDnsInstructions(hostname: string, token: string) {
  return {
    txt: {
      record: `_sakspilot-verify.${hostname}`,
      value: token,
      description:
        "Legg til en TXT-record hos din DNS-leverandør med disse verdiene. Etter at den er propagert (vanligvis 5–60 min), trykk 'Verifiser nå'.",
    },
    cname: {
      record: hostname,
      value: "sakspilot.no",
      description:
        "I tillegg til TXT-recorden trenger du en CNAME som peker selve domenet til Sakspilot. NB: rot-domener (uten subdomain, f.eks. 'firma.no') krever A-record i stedet — kontakt support hvis du ikke vet hvilken type du trenger.",
    },
  };
}

/**
 * DNS TXT-lookup med timeout. Node dns/promises kaster ENODATA/ENOTFOUND
 * hvis recorden ikke finnes — vi normaliserer til tom array.
 */
async function resolveTxtWithTimeout(
  recordName: string,
  timeoutMs = 5000
): Promise<string[][]> {
  const lookup = dns.resolveTxt(recordName).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENODATA" || err.code === "ENOTFOUND") return [];
    throw err;
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DNS-lookup tok for lang tid (timeout 5s)")), timeoutMs)
  );
  return Promise.race([lookup, timeout]);
}

// ── GET /custom-domains ─────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const domains = await prisma.customDomain.findMany({
    where: { organizationId },
    select: {
      id: true,
      hostname: true,
      verified: true,
      verificationToken: true,
      verifiedAt: true,
      brandName: true,
      brandTagline: true,
      brandPrimaryColor: true,
      brandLogoUrl: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = domains.map((d) => ({
    ...d,
    dnsInstructions: buildDnsInstructions(d.hostname, d.verificationToken),
    portalUrl: d.verified ? `https://${d.hostname}/portal` : null,
  }));

  return res.json({ domains: enriched, total: enriched.length });
});

// ── POST /custom-domains ────────────────────────────────────────

router.post("/", requireRole("owner"), async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const parsed = AddDomainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig hostname",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const hostname = parsed.data.hostname;

  // Sjekk konflikt — hostname @unique globalt
  const conflict = await prisma.customDomain.findUnique({
    where: { hostname },
    select: { id: true, organizationId: true },
  });
  if (conflict) {
    if (conflict.organizationId === organizationId) {
      return res.status(409).json({
        error: "Dette domenet er allerede lagt til hos dere.",
      });
    }
    return res.status(409).json({
      error:
        "Dette domenet er allerede i bruk av en annen Sakspilot-konto. Kontakt support hvis dette ikke stemmer.",
    });
  }

  const verificationToken = generateVerificationToken();
  const domain = await prisma.customDomain.create({
    data: {
      organizationId,
      hostname,
      verificationToken,
    },
    select: {
      id: true,
      hostname: true,
      verified: true,
      verificationToken: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action: "custom_domain.added",
      entityType: "custom_domain",
      entityId: domain.id,
      metadata: { hostname },
    },
  });

  // Invalider eventuell negativ cache så ny verifisering kan slå gjennom
  invalidateHostname(hostname);

  return res.status(201).json({
    domain: {
      ...domain,
      dnsInstructions: buildDnsInstructions(hostname, verificationToken),
    },
  });
});

// ── POST /custom-domains/:id/verify ─────────────────────────────

router.post("/:id/verify", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const domain = await prisma.customDomain.findFirst({
    where: { id: req.params.id, organizationId },
  });
  if (!domain) return res.status(404).json({ error: "Domene ikke funnet" });

  if (domain.verified) {
    return res.json({
      ok: true,
      verified: true,
      message: "Domenet er allerede verifisert.",
      verifiedAt: domain.verifiedAt,
    });
  }

  const recordName = `_sakspilot-verify.${domain.hostname}`;
  let records: string[][] = [];
  try {
    records = await resolveTxtWithTimeout(recordName);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ukjent DNS-feil";
    return res.status(424).json({
      error: "DNS-oppslag feilet",
      message,
      hint: `Sjekk at TXT-recorden er lagt til på ${recordName} og at DNS er propagert (kan ta 5–60 min).`,
    });
  }

  // Flat ut: TXT kan returneres som ["abc", "def"] om verdien er chunket
  const flat = records.map((r) => r.join("")).map((s) => s.trim());
  const match = flat.includes(domain.verificationToken);

  if (!match) {
    return res.status(424).json({
      error: "TXT-record stemmer ikke",
      message:
        "Vi fant ingen TXT-record som matcher verifikasjonstoken. Sjekk at verdien er lagt inn riktig og at DNS er propagert.",
      expected: domain.verificationToken,
      foundCount: flat.length,
    });
  }

  const updated = await prisma.customDomain.update({
    where: { id: domain.id },
    data: { verified: true, verifiedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      organizationId,
      action: "custom_domain.verified",
      entityType: "custom_domain",
      entityId: domain.id,
      metadata: { hostname: domain.hostname },
    },
  });

  invalidateHostname(domain.hostname);

  return res.json({
    ok: true,
    verified: true,
    verifiedAt: updated.verifiedAt,
    message:
      "Domenet er verifisert. Du må også legge til CNAME-record og kontakte support@sakspilot.no for å aktivere domenet på Vercel.",
  });
});

// ── PATCH /custom-domains/:id/branding ──────────────────────────

router.patch(
  "/:id/branding",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = req.session!;
    const domain = await prisma.customDomain.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!domain) return res.status(404).json({ error: "Domene ikke funnet" });

    const parsed = BrandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Ugyldig branding",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Tom streng → null (frontend kan sende "" når brukeren tømmer feltet).
    // Vi setter kun felter brukeren faktisk sendte med — udefinerte felter
    // forblir uendret i DB.
    const norm = (v: string | null): string | null => {
      if (v === null) return null;
      const t = v.trim();
      return t === "" ? null : t;
    };

    const data: Record<string, string | null> = {};
    if (parsed.data.brandName !== undefined) data.brandName = norm(parsed.data.brandName);
    if (parsed.data.brandTagline !== undefined) data.brandTagline = norm(parsed.data.brandTagline);
    if (parsed.data.brandPrimaryColor !== undefined) data.brandPrimaryColor = norm(parsed.data.brandPrimaryColor);
    if (parsed.data.brandLogoUrl !== undefined) data.brandLogoUrl = norm(parsed.data.brandLogoUrl);

    const updated = await prisma.customDomain.update({
      where: { id: domain.id },
      data,
      select: {
        id: true,
        hostname: true,
        brandName: true,
        brandTagline: true,
        brandPrimaryColor: true,
        brandLogoUrl: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action: "custom_domain.branding_updated",
        entityType: "custom_domain",
        entityId: domain.id,
        metadata: { hostname: domain.hostname, fields: Object.keys(data) },
      },
    });

    invalidateHostname(domain.hostname);

    return res.json({ domain: updated });
  }
);

// ── DELETE /custom-domains/:id ──────────────────────────────────

router.delete(
  "/:id",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = req.session!;
    const domain = await prisma.customDomain.findFirst({
      where: { id: req.params.id, organizationId },
      select: { id: true, hostname: true },
    });
    if (!domain) return res.status(404).json({ error: "Domene ikke funnet" });

    await prisma.customDomain.delete({ where: { id: domain.id } });

    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action: "custom_domain.removed",
        entityType: "custom_domain",
        entityId: domain.id,
        metadata: { hostname: domain.hostname },
      },
    });

    invalidateHostname(domain.hostname);

    return res.json({ ok: true });
  }
);

// Re-export normalizeHostname for tests
export { normalizeHostname };

export default router;
