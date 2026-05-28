/**
 * Regnskap-integrasjon — Tripletex / Fiken direkte API.
 *
 *   GET  /accounting/fiken/status          — viser om integrasjon er aktiv
 *   POST /accounting/fiken/connect         — lagrer PAT + company-slug + verifiserer
 *   POST /accounting/fiken/disconnect      — sletter integrasjonen
 *   POST /accounting/fiken/create-invoice  — oppretter faktura fra sak (billable timer)
 *
 *   GET  /accounting/tripletex/status      — stub (krever partner-status)
 *
 * Fiken-strategi: personal access token (PAT) per bruker, ikke OAuth.
 * Hver Sakspilot-bruker kobler til sin egen Fiken-konto. Tokenet lagres
 * kryptert (AES-256-GCM) i FikenIntegration-tabellen.
 *
 * Tripletex krever fortsatt partner-status (3-5 dagers godkjenning) — stubben
 * blir værende.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/crypto";

const router = Router();
router.use(requireAuth);

const FIKEN_BASE = "https://api.fiken.no/api/v2";

// ── Hjelpefunksjoner ────────────────────────────────────────────

async function fikenFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(`${FIKEN_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 500) || res.statusText,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Nettverksfeil mot Fiken",
    };
  }
}

// ── Fiken: status ────────────────────────────────────────────────

router.get("/fiken/status", async (req: Request, res: Response) => {
  const session = req.session!;
  const integ = await prisma.fikenIntegration.findUnique({
    where: { organizationId: session.organizationId },
    select: {
      companySlug: true,
      lastVerifiedAt: true,
      invoicesCreated: true,
      createdAt: true,
    },
  });
  if (!integ) {
    return res.json({
      connected: false,
      method: "personal_access_token",
      docsUrl: "https://fiken.no/api/docs/",
      hint: "Generer et token i Fiken under Innstillinger → API/integrasjoner → Personlig API-token.",
    });
  }
  return res.json({
    connected: true,
    method: "personal_access_token",
    companySlug: integ.companySlug,
    lastVerifiedAt: integ.lastVerifiedAt,
    invoicesCreated: integ.invoicesCreated,
    connectedAt: integ.createdAt,
  });
});

// ── Fiken: connect ───────────────────────────────────────────────

const ConnectSchema = z.object({
  token: z.string().min(20).max(500),
  companySlug: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-]+$/),
});

router.post("/fiken/connect", async (req: Request, res: Response) => {
  const parsed = ConnectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten(),
    });
  }
  const { token, companySlug } = parsed.data;

  // Verifiser tokenet ved å hente company-info
  const verify = await fikenFetch<{ name: string; slug: string }>(
    token,
    `/companies/${encodeURIComponent(companySlug)}`
  );
  if (!verify.ok) {
    if (verify.status === 401) {
      return res.status(400).json({
        error: "Tokenet ble avvist av Fiken (401). Sjekk at det er riktig.",
      });
    }
    if (verify.status === 404) {
      return res.status(400).json({
        error: `Fant ingen bedrift med slug "${companySlug}". Sjekk URL-en i Fiken (mellom //fiken.no/foretak/ og /).`,
      });
    }
    return res.status(502).json({
      error: `Fiken svarte med ${verify.status}: ${verify.error}`,
    });
  }

  const session = req.session!;
  const encryptedToken = encrypt(token);

  await prisma.fikenIntegration.upsert({
    where: { organizationId: session.organizationId },
    update: {
      companySlug,
      encryptedToken,
      lastVerifiedAt: new Date(),
    },
    create: {
      organizationId: session.organizationId,
      companySlug,
      encryptedToken,
      lastVerifiedAt: new Date(),
    },
  });

  return res.json({
    ok: true,
    companyName: verify.data?.name,
    companySlug,
  });
});

// ── Fiken: disconnect ────────────────────────────────────────────

router.post("/fiken/disconnect", async (req: Request, res: Response) => {
  const session = req.session!;
  await prisma.fikenIntegration.deleteMany({
    where: { organizationId: session.organizationId },
  });
  return res.json({ ok: true });
});

// ── Fiken: create invoice fra sak ────────────────────────────────

const CreateInvoiceSchema = z.object({
  sakId: z.string().uuid(),
  /// Kun fakturerbare timer som ikke allerede er fakturert? Default true.
  onlyBillable: z.boolean().optional().default(true),
  /// Antall dager til forfall fra i dag (default 14)
  daysUntilDue: z.number().int().min(0).max(180).optional().default(14),
});

router.post("/fiken/create-invoice", async (req: Request, res: Response) => {
  const parsed = CreateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input", details: parsed.error.flatten() });
  }
  const { sakId, onlyBillable, daysUntilDue } = parsed.data;
  const session = req.session!;

  // Hent integrasjon
  const integ = await prisma.fikenIntegration.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!integ) {
    return res.status(412).json({
      error: "Fiken-integrasjon mangler. Koble til først via /innstillinger/integrasjoner.",
    });
  }
  const token = decrypt(integ.encryptedToken);

  // Hent sak + klient + timer
  const sak = await prisma.sak.findFirst({
    where: { id: sakId, organizationId: session.organizationId },
    include: {
      client: true,
      timeEntries: {
        where: onlyBillable ? { billable: true } : {},
        orderBy: { startedAt: "asc" },
      },
    },
  });
  if (!sak) return res.status(404).json({ error: "Sak ikke funnet" });
  if (!sak.client) {
    return res.status(400).json({
      error: "Saken har ingen klient — kan ikke opprette faktura uten mottaker.",
    });
  }
  if (sak.timeEntries.length === 0) {
    return res.status(400).json({
      error: onlyBillable
        ? "Ingen fakturerbare timer på saken."
        : "Ingen timeregistreringer på saken.",
    });
  }

  // Aggreger timer
  const totalSec = sak.timeEntries.reduce((s, e) => s + e.durationSec, 0);
  const totalHours = +(totalSec / 3600).toFixed(2);
  const hourlyRate =
    sak.hourlyRate ??
    sak.timeEntries.find((e) => e.hourlyRate)?.hourlyRate ??
    1200;

  // Slå opp / opprett kontakt i Fiken
  // (Fiken krever contactId for faktura — vi prøver å gjenbruke existerende
  // basert på epost, ellers opprette ny.)
  const contactSearch = await fikenFetch<
    Array<{ contactId: number; name: string; email: string | null }>
  >(
    token,
    `/companies/${integ.companySlug}/contacts?email=${encodeURIComponent(
      sak.client.contactEmail || ""
    )}`
  );

  let contactId: number | null = null;
  if (contactSearch.ok && Array.isArray(contactSearch.data) && contactSearch.data.length > 0) {
    contactId = contactSearch.data[0].contactId;
  } else {
    const createContact = await fikenFetch<{ contactId: number }>(
      token,
      `/companies/${integ.companySlug}/contacts`,
      {
        method: "POST",
        body: JSON.stringify({
          name: sak.client.name,
          email: sak.client.contactEmail || undefined,
          phoneNumber: sak.client.contactPhone || undefined,
          customer: true,
        }),
      }
    );
    if (!createContact.ok) {
      return res.status(502).json({
        error: `Kunne ikke opprette kontakt i Fiken: ${createContact.error}`,
      });
    }
    contactId = createContact.data?.contactId ?? null;
  }
  if (!contactId) {
    return res.status(502).json({ error: "Mangler contactId fra Fiken." });
  }

  // Opprett fakturadraft
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + daysUntilDue * 86400000)
    .toISOString()
    .slice(0, 10);

  const invoiceBody = {
    issueDate,
    dueDate,
    customerId: contactId,
    bankAccountCode: "1920:10001", // standard — bruker må evt endre i Fiken
    cash: false,
    lines: [
      {
        description: `${sak.title}${sak.saksnummer ? ` (saksnr ${sak.saksnummer})` : ""} — ${totalHours} timer`,
        unitPrice: Math.round(hourlyRate * 100), // Fiken bruker øre
        quantity: totalHours,
        vatType: "HIGH", // 25% — bruker må endre hvis tjenesten er fritatt
        incomeAccount: "3000",
      },
    ],
  };

  const invoiceRes = await fikenFetch<{ invoiceId: number; invoiceNumber: string }>(
    token,
    `/companies/${integ.companySlug}/invoices/drafts`,
    {
      method: "POST",
      body: JSON.stringify(invoiceBody),
    }
  );
  if (!invoiceRes.ok) {
    return res.status(502).json({
      error: `Fiken godtok ikke faktura: ${invoiceRes.error}`,
    });
  }

  // Oppdater teller + lagre lokal Invoice-record
  await prisma.fikenIntegration.update({
    where: { id: integ.id },
    data: {
      invoicesCreated: { increment: 1 },
      lastVerifiedAt: new Date(),
    },
  });

  return res.json({
    ok: true,
    fikenInvoiceId: invoiceRes.data?.invoiceId,
    fikenInvoiceNumber: invoiceRes.data?.invoiceNumber,
    hours: totalHours,
    amount: Math.round(totalHours * hourlyRate),
    contactId,
    viewUrl: `https://fiken.no/foretak/${integ.companySlug}/fakturaer/utkast/${invoiceRes.data?.invoiceId}`,
  });
});

// ── Tripletex (uendret stub) ─────────────────────────────────────

router.get("/tripletex/status", (_req: Request, res: Response) => {
  return res.json({
    connected: false,
    implementationStatus: "stub",
    blocker: "Avventer partner-status hos Tripletex",
    csvAlternative: "/reports/month.csv",
  });
});

router.post("/tripletex/oauth/start", (_req: Request, res: Response) => {
  return res.status(501).json({
    error: "Tripletex-OAuth er ikke implementert ennå. Bruk CSV-eksport.",
    csvAlternative: "/reports/month.csv?year=YYYY&month=MM",
  });
});

router.post("/tripletex/push-timesheet", (_req: Request, res: Response) => {
  return res.status(501).json({
    error: "Tripletex-push er ikke implementert ennå.",
    csvAlternative: "/reports/month.csv?year=YYYY&month=MM",
  });
});

export default router;
