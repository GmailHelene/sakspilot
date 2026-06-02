/**
 * Invoices-routes — full CRUD for Invoice-modellen.
 *
 *   GET    /invoices                   — liste (filtrer status / år / klient)
 *   GET    /invoices/:id               — detalj (med koblede timeEntries)
 *   POST   /invoices                   — opprett draft (manuell faktura med linjer)
 *   PATCH  /invoices/:id               — oppdater status/note/paidAt (cancel, marker betalt etc)
 *   DELETE /invoices/:id               — slett (kun draft-status)
 *
 * Eksport til Fiken/Tripletex skjer via accounting.ts/tripletex.ts.
 * PDF-generering finnes i invoicePdf.ts (eget endepunkt).
 * Multi-tenant: alle queries filtreres på organizationId.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const StatusSchema = z.enum(["draft", "exported", "cancelled"]);

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0).max(100000),
  unitPrice: z.number().min(-1_000_000).max(10_000_000),
});

const CreateInvoiceSchema = z.object({
  /// Hvilken sak fakturaen tilhører. Hvis null, må customerName settes
  /// (manuell faktura uten sak-kobling, f.eks. importert eller engangs-fakturering).
  sakId: z.string().uuid().nullable().optional(),
  /// Kundenavn fallback når ingen sak er valgt
  customerName: z.string().max(200).optional(),
  customerAddress: z.string().max(500).optional(),
  invoiceNumber: z.string().max(50).optional(),
  /// Periodestart/-slutt — for timesbaserte fakturaer er dette intervallet
  /// timene ble logget. For manuelle fakturaer bruker vi dato på begge.
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  lineItems: z.array(LineItemSchema).min(1, "Minst én linje kreves"),
  currency: z.string().default("NOK"),
  note: z.string().max(5000).optional(),
});

const UpdateInvoiceSchema = z.object({
  status: StatusSchema.optional(),
  note: z.string().max(5000).optional(),
  paidAt: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

/**
 * GET /invoices?status=draft&year=2026&clientId=xyz
 * Returnerer fakturaer + lett KPI-aggregering for header.
 */
router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;

  const status = StatusSchema.safeParse(req.query.status);
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  const clientId = (req.query.clientId as string) || null;

  // År-filter konverteres til [yearStart, yearEnd] periodStart-range
  let dateRange: { gte: Date; lt: Date } | undefined;
  if (year && !isNaN(year)) {
    dateRange = {
      gte: new Date(`${year}-01-01T00:00:00Z`),
      lt: new Date(`${year + 1}-01-01T00:00:00Z`),
    };
  }

  const where = {
    organizationId,
    ...(status.success ? { status: status.data } : {}),
    ...(dateRange ? { periodStart: dateRange } : {}),
    ...(clientId ? { sak: { clientId } } : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      sak: {
        select: {
          id: true,
          title: true,
          client: { select: { id: true, name: true } },
        },
      },
      _count: { select: { timeEntries: true } },
    },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });

  // Aggregering for header-KPIer — frontend slipper N+1 round-trips
  const allOrgInvoices = await prisma.invoice.findMany({
    where: { organizationId, ...(dateRange ? { periodStart: dateRange } : {}) },
    select: { status: true, totalAmount: true },
  });

  const summary = {
    total: allOrgInvoices.length,
    draftCount: allOrgInvoices.filter((i) => i.status === "draft").length,
    exportedCount: allOrgInvoices.filter((i) => i.status === "exported").length,
    cancelledCount: allOrgInvoices.filter((i) => i.status === "cancelled").length,
    totalAmountExported: allOrgInvoices
      .filter((i) => i.status === "exported")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0),
    totalAmountDraft: allOrgInvoices
      .filter((i) => i.status === "draft")
      .reduce((sum, i) => sum + Number(i.totalAmount), 0),
  };

  return res.json({ invoices, summary });
});

router.get("/:id", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId },
    include: {
      sak: {
        select: {
          id: true,
          title: true,
          hourlyRate: true,
          client: { select: { id: true, name: true, orgNumber: true, contactEmail: true } },
        },
      },
      timeEntries: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          windowTitle: true,
          appName: true,
          note: true,
          hourlyRate: true,
        },
        orderBy: { startedAt: "asc" },
      },
    },
  });
  if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });
  return res.json(invoice);
});

/**
 * POST /invoices
 * Opprett en manuell faktura med linjer. Status settes alltid til 'draft'
 * — eksport til Fiken/Tripletex skjer separat via /accounting eller /tripletex.
 *
 * Validering:
 *   - Linjer kreves (min 1, sum > 0 ikke krevd — kreditnota har negative beløp)
 *   - Hvis sakId er satt, valideres at saken tilhører organisasjonen
 *   - Hvis sakId IKKE er satt, MÅ customerName settes
 */
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const session = req.session!;

  if (!d.sakId && !d.customerName) {
    return res.status(400).json({
      error: "Enten sakId eller customerName må settes (kan ikke ha faktura uten mottaker)",
    });
  }

  // Hvis sakId: verifiser at saken finnes i denne org
  if (d.sakId) {
    const sak = await prisma.sak.findFirst({
      where: { id: d.sakId, organizationId: session.organizationId },
      select: { id: true },
    });
    if (!sak) return res.status(400).json({ error: "Sak ikke funnet i din organisasjon" });
  }

  // Beregn totaler fra linjer
  const totalAmount = d.lineItems.reduce((s, li) => s + li.unitPrice * li.quantity, 0);
  // Hvis alle linjer er beskrevet som timer (heuristikk: quantity er antall timer),
  // bruker vi det. Ellers er totalHours bare en informasjons-aggregering.
  const totalHours = d.lineItems.reduce((s, li) => s + li.quantity, 0);

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: session.organizationId,
      sakId: d.sakId ?? null,
      customerName: d.customerName ?? null,
      customerAddress: d.customerAddress ?? null,
      invoiceNumber: d.invoiceNumber ?? null,
      periodStart: new Date(d.periodStart),
      periodEnd: new Date(d.periodEnd),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      totalHours,
      totalAmount,
      currency: d.currency,
      status: "draft",
      lineItems: d.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        sum: li.unitPrice * li.quantity,
      })),
      note: d.note ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "invoice.created",
      entityType: "invoice",
      entityId: invoice.id,
    },
  });

  return res.status(201).json(invoice);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true, status: true, exportedAt: true },
  });
  if (!existing) return res.status(404).json({ error: "Faktura ikke funnet" });

  // Forretningslogikk: ikke tillat draft → exported via patch (skal gå via
  // accounting.ts/fiken eller tripletex.ts-eksport som setter exportedTo +
  // externalRef korrekt). Manuell status-endring her er bare for:
  //   - draft  → cancelled   (rydd opp utkast)
  //   - exported → cancelled (kreditnota må håndteres separat i regnskap)
  if (parsed.data.status === "exported" && existing.status !== "exported") {
    return res.status(400).json({
      error: "Faktura-eksport må gjøres via /accounting/fiken/create-invoice eller /tripletex/export, ikke manuell PATCH",
    });
  }

  // Bygg data-objekt og konverter datofelter
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.paidAt !== undefined) {
    data.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : null;
  }
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }

  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "invoice.updated",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { fromStatus: existing.status, toStatus: invoice.status },
    },
  });

  return res.json(invoice);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true, status: true, exportedTo: true, externalRef: true },
  });
  if (!existing) return res.status(404).json({ error: "Faktura ikke funnet" });

  // Eksportert faktura kan ikke slettes — det ville bryte regnskaps-trail.
  // Cancel istedenfor (kreditnota må gjøres manuelt i Fiken/Tripletex).
  if (existing.status === "exported") {
    return res.status(400).json({
      error: "Eksportert faktura kan ikke slettes. Sett status=cancelled hvis du må annullere, og lag kreditnota i regnskapssystemet.",
      exportedTo: existing.exportedTo,
      externalRef: existing.externalRef,
    });
  }

  // Frigjør timeEntries (sett invoiceId=null) før vi sletter, så de kan
  // re-faktureres i en ny faktura uten å miste timer.
  await prisma.timeEntry.updateMany({
    where: { invoiceId: existing.id },
    data: { invoiceId: null },
  });

  await prisma.invoice.delete({ where: { id: req.params.id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "invoice.deleted",
      entityType: "invoice",
      entityId: req.params.id,
    },
  });

  return res.json({ ok: true });
});

export default router;
