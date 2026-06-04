/**
 * Invoices-routes, full CRUD for Invoice-modellen.
 *
 *   GET    /invoices                  , liste (filtrer status / år / klient)
 *   GET    /invoices/:id              , detalj (med koblede timeEntries)
 *   POST   /invoices                  , opprett draft (manuell faktura med linjer)
 *   PATCH  /invoices/:id              , oppdater status/note/paidAt (cancel, marker betalt etc)
 *   DELETE /invoices/:id              , slett (kun draft-status)
 *
 * Eksport til Fiken/Tripletex skjer via accounting.ts/tripletex.ts.
 * PDF-generering finnes i invoicePdf.ts (eget endepunkt).
 * Multi-tenant: alle queries filtreres på organizationId.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { sendEmail } from "../lib/email";
import { safeParseLineItems } from "../lib/invoiceLineItems";

const router = Router();
router.use(requireAuth);

const StatusSchema = z.enum(["draft", "exported", "cancelled"]);

const LineItemSchema = z.object({
  description: z.string().min(1).max(500),
  // Krev positiv quantity. 0-linjer er meningsløse og forvirrer rapporter.
  // Tillater desimal (0.5 timer er normalt).
  quantity: z.number().gt(0, "Antall må være større enn 0").max(100000),
  // unitPrice tillates negativ for kreditnota-linjer
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
  /// Periodestart/-slutt, for timesbaserte fakturaer er dette intervallet
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
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

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
    ...(q ? {
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" as const } },
        { customerName: { contains: q, mode: "insensitive" as const } },
        { note: { contains: q, mode: "insensitive" as const } },
        { sak: { title: { contains: q, mode: "insensitive" as const } } },
        { sak: { client: { name: { contains: q, mode: "insensitive" as const } } } },
      ],
    } : {}),
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

  // Aggregering for header-KPIer, frontend slipper N+1 round-trips
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
 *, eksport til Fiken/Tripletex skjer separat via /accounting eller /tripletex.
 *
 * Validering:
 *   - Linjer kreves (min 1, sum > 0 ikke krevd, kreditnota har negative beløp)
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

  // Eksportert faktura kan ikke slettes, det ville bryte regnskaps-trail.
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

// ── Send faktura på epost ────────────────────────────────────────
const SendEmailSchema = z.object({
  /** Mottaker - eposten fakturaen sendes til. */
  to: z.string().email("Ugyldig epost"),
  /** Valgfri CC, komma-separert eller array. */
  cc: z.union([z.string(), z.array(z.string().email())]).optional(),
  /** Valgfritt subject - default genereres fra fakturanummer. */
  subject: z.string().min(1).max(200).optional(),
  /** Valgfri brødtekst (HTML). Default: standard hilsen. */
  body: z.string().max(20000).optional(),
});

/**
 * POST /invoices/:id/send-email
 * Generer faktura-PDF og send som vedlegg til kunden via Brevo SMTP.
 * Loggfører send-tidspunkt + mottaker på Invoice for historikk.
 *
 * TODO refaktor: PDF-genereringen er duplisert fra invoicePdf.ts.
 * Bør ekstraheres til shared lib `generateInvoicePdfBuffer()` slik at
 * begge endpoints bruker samme kode.
 */
router.post("/:id/send-email", async (req: Request, res: Response) => {
  const parsed = SendEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    include: {
      sak: { include: { client: true } },
      organization: true,
    },
  });
  if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });

  // ── Generer PDF (kopiert fra invoicePdf.ts, refaktor planlagt) ──
  const org = invoice.organization;
  const client = invoice.sak?.client;
  const customerName = client?.name || invoice.customerName || "(uten kunde)";
  const customerAddress = client?.address || invoice.customerAddress || "";

  function fmtKr(n: number): string {
    return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
  }
  function fmtDate(d: Date): string {
    return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  function fmtOrgNumber(orgNumber: string | null): string {
    if (!orgNumber) return "(org.nr ikke satt)";
    const digits = orgNumber.replace(/\D/g, "");
    if (digits.length !== 9) return `Org.nr ${orgNumber}`;
    return `Org.nr ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} MVA`;
  }

  // Fall back til auto-generert nummer hvis ingen er satt på fakturaen
  const invNum = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const issuedAt = invoice.periodEnd;
  const dueAt = invoice.dueDate || new Date(issuedAt.getTime() + 14 * 86400000);

  const lineItemsParsed = safeParseLineItems(invoice.lineItems);
  const lineItems = lineItemsParsed.length > 0 ? lineItemsParsed : null;

  const doc = new PDFDocument({
    size: "A4", margin: 50,
    info: { Title: `Faktura ${invNum}`, Author: org.name, Creator: "Sakspilot" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Header
  doc.fontSize(18).fillColor("#1E3A5F").text(org.name, 50, 50, { width: 280 });
  doc.fontSize(9).fillColor("#5E6C84").text(fmtOrgNumber(org.orgNumber), 50, doc.y + 2);
  if (org.address) doc.text(org.address, 50, doc.y + 2);
  const cityLine = [org.postalCode, org.city].filter(Boolean).join(" ");
  if (cityLine) doc.text(cityLine, 50, doc.y + 2);

  doc.fontSize(28).fillColor("#172B4D").text("FAKTURA", 350, 50, { width: 200, align: "right" });
  doc.fontSize(10).fillColor("#172B4D")
    .text(`Fakturanr: ${invNum}`, 350, doc.y + 6, { width: 200, align: "right" })
    .text(`Fakturadato: ${fmtDate(issuedAt)}`, 350, doc.y + 2, { width: 200, align: "right" })
    .text(`Forfall: ${fmtDate(dueAt)}`, 350, doc.y + 2, { width: 200, align: "right" });

  let y = 180;
  doc.fontSize(10).fillColor("#5E6C84").text("Faktura til:", 50, y);
  y += 14;
  doc.fontSize(12).fillColor("#172B4D").text(customerName, 50, y);
  y = doc.y + 4;
  if (customerAddress) {
    doc.fontSize(9).fillColor("#5E6C84").text(customerAddress, 50, y, { width: 280 });
    y = doc.y + 4;
  }
  y += 20;

  // Tabell-header
  doc.fontSize(9).fillColor("#5E6C84")
    .text("Beskrivelse", 50, y)
    .text("Antall", 360, y, { width: 50, align: "right" })
    .text("Pris", 415, y, { width: 60, align: "right" })
    .text("Sum", 480, y, { width: 65, align: "right" });
  y += 12;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#E6E9EF").stroke();
  y += 6;

  let subtotal = 0;
  if (lineItems && lineItems.length > 0) {
    for (const li of lineItems) {
      const sum = li.sum ?? li.quantity * li.unitPrice;
      subtotal += sum;
      doc.fontSize(9).fillColor("#172B4D")
        .text(li.description, 50, y, { width: 300 })
        .text(String(li.quantity), 360, y, { width: 50, align: "right" })
        .text(fmtKr(li.unitPrice), 415, y, { width: 60, align: "right" })
        .text(fmtKr(sum), 480, y, { width: 65, align: "right" });
      y = Math.max(doc.y, y) + 6;
    }
  } else {
    subtotal = Number(invoice.totalAmount);
    doc.fontSize(9).fillColor("#172B4D")
      .text(`Tjenester ${fmtDate(invoice.periodStart)}, ${fmtDate(invoice.periodEnd)}`, 50, y, { width: 300 })
      .text(String(invoice.totalHours), 360, y, { width: 50, align: "right" })
      .text("-", 415, y, { width: 60, align: "right" })
      .text(fmtKr(subtotal), 480, y, { width: 65, align: "right" });
    y = doc.y + 6;
  }

  y += 12;
  doc.moveTo(360, y).lineTo(545, y).strokeColor("#cbd5e1").lineWidth(1.5).stroke();
  y += 8;

  doc.fontSize(11).fillColor("#172B4D").font("Helvetica-Bold")
    .text("Total:", 360, y, { width: 115, align: "right" })
    .text(`${fmtKr(subtotal)}`, 480, y, { width: 65, align: "right" });
  doc.font("Helvetica");

  y += 32;
  if (org.bankAccount) {
    doc.fontSize(9).fillColor("#5E6C84")
      .text(`Innbetales til: ${org.bankAccount}`, 50, y)
      .text(`Forfall: ${fmtDate(dueAt)}`, 50, doc.y + 4);
  }

  if (invoice.paidAt) {
    doc.fontSize(36).fillColor("#22c55e").opacity(0.3)
      .text("BETALT", 200, 400, { width: 200, align: "center" }).opacity(1);
  } else if (invoice.status === "cancelled") {
    doc.fontSize(36).fillColor("#dc2626").opacity(0.3)
      .text("ANNULLERT", 180, 400, { width: 240, align: "center" }).opacity(1);
  }

  if (invoice.note) {
    doc.fontSize(8).fillColor("#94a3b8").text(invoice.note, 50, 770, { width: 495 });
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(chunks);

  // ── Bygg epost ─────────────────────────────────────────────
  const totalStr = fmtKr(subtotal);
  const subject = parsed.data.subject || `Faktura ${invNum} fra ${org.name}`;
  const bodyHtml = parsed.data.body || `
    <p>Hei ${customerName},</p>
    <p>Vedlagt finner du faktura <strong>${invNum}</strong> på <strong>${totalStr}</strong> med forfall ${fmtDate(dueAt)}.</p>
    ${org.bankAccount ? `<p>Innbetales til kontonummer <strong>${org.bankAccount}</strong>. Merk innbetalingen med fakturanummer.</p>` : ""}
    <p>Si fra hvis det er noe spørsmål om fakturaen.</p>
    <p>Mvh<br>${org.name}</p>
  `;

  // ── Send ───────────────────────────────────────────────────
  const result = await sendEmail({
    to: parsed.data.to,
    cc: parsed.data.cc,
    subject,
    html: bodyHtml,
    attachments: [
      {
        filename: `faktura-${invNum}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  if (!result.ok) {
    return res.status(502).json({
      error: "Kunne ikke sende epost",
      details: result.error,
    });
  }

  // ── Logg send på Invoice ───────────────────────────────────
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      sentEmailAt: new Date(),
      sentEmailTo: parsed.data.to,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "invoice.email_sent",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { to: parsed.data.to, subject },
    },
  });

  return res.json({ ok: true, messageId: result.messageId, sentAt: new Date().toISOString() });
});

// ── Send purring på forfalt faktura ──────────────────────────────
const SendReminderSchema = z.object({
  /** Mottaker - default fra sak.client.contactEmail eller forrige sentEmailTo. */
  to: z.string().email().optional(),
  /** Valgfri custom subject/body. Default genereres basert på reminderCount. */
  subject: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
});

/**
 * POST /invoices/:id/send-reminder
 * Send en betalings-påminnelse (purring) til kunden på epost.
 * Bare lov for fakturaer som er FORFALT og UBETALT.
 *
 * Eskalering basert på reminderCount:
 *   0 → "Vennlig påminnelse"        (1. gang)
 *   1 → "Andre påminnelse"          (2. gang)
 *   2+ → "Siste purring før inkasso" (3. gang +)
 *
 * Vi sender IKKE faktisk til inkasso, bare språket eskaleres.
 * Faktura-PDF legges ved som vedlegg.
 *
 * Loggfører reminderSentAt + reminderCount + auditLog.
 */
router.post("/:id/send-reminder", async (req: Request, res: Response) => {
  const parsed = SendReminderSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    include: {
      sak: { include: { client: true } },
      organization: true,
    },
  });
  if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });

  // Forretningsregler
  if (invoice.paidAt) {
    return res.status(400).json({ error: "Fakturaen er allerede betalt - ingen purring nødvendig" });
  }
  if (invoice.status === "cancelled") {
    return res.status(400).json({ error: "Fakturaen er annullert" });
  }
  if (!invoice.dueDate || invoice.dueDate > new Date()) {
    return res.status(400).json({ error: "Fakturaen er ikke forfalt enda - kan ikke purre" });
  }

  // Mottaker: body.to → siste sendEmailTo → klientens contactEmail
  const toAddress = parsed.data.to
    || invoice.sentEmailTo
    || invoice.sak?.client?.contactEmail
    || null;
  if (!toAddress) {
    return res.status(400).json({
      error: "Ingen epost-adresse å sende til. Oppgi 'to' i request, eller sett kontakt-epost på klienten.",
    });
  }

  // Beregn dager forsinket
  const daysOverdue = Math.floor((Date.now() - invoice.dueDate.getTime()) / 86400000);
  const reminderNum = invoice.reminderCount + 1; // hva DETTE blir (1, 2, 3, ...)

  // ── Generer PDF (samme logikk som send-email) ─────────────
  // TODO refaktor: ekstrahere PDF-genereringen til shared lib.
  const org = invoice.organization;
  const client = invoice.sak?.client;
  const customerName = client?.name || invoice.customerName || "(uten kunde)";
  const customerAddress = client?.address || invoice.customerAddress || "";

  function fmtKr(n: number): string {
    return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
  }
  function fmtDate(d: Date): string {
    return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  function fmtOrgNumber(orgNumber: string | null): string {
    if (!orgNumber) return "(org.nr ikke satt)";
    const digits = orgNumber.replace(/\D/g, "");
    if (digits.length !== 9) return `Org.nr ${orgNumber}`;
    return `Org.nr ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} MVA`;
  }

  const invNum = invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const lineItemsParsed = safeParseLineItems(invoice.lineItems);
  const lineItems = lineItemsParsed.length > 0 ? lineItemsParsed : null;

  const doc = new PDFDocument({
    size: "A4", margin: 50,
    info: { Title: `Purring ${invNum}`, Author: org.name, Creator: "Sakspilot" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  doc.fontSize(18).fillColor("#1E3A5F").text(org.name, 50, 50, { width: 280 });
  doc.fontSize(9).fillColor("#5E6C84").text(fmtOrgNumber(org.orgNumber), 50, doc.y + 2);
  if (org.address) doc.text(org.address, 50, doc.y + 2);

  doc.fontSize(28).fillColor("#dc2626").text("PURRING", 350, 50, { width: 200, align: "right" });
  doc.fontSize(10).fillColor("#172B4D")
    .text(`Fakturanr: ${invNum}`, 350, doc.y + 6, { width: 200, align: "right" })
    .text(`Opprinnelig forfall: ${fmtDate(invoice.dueDate)}`, 350, doc.y + 2, { width: 200, align: "right" })
    .text(`Dager forsinket: ${daysOverdue}`, 350, doc.y + 2, { width: 200, align: "right" });

  let y = 180;
  doc.fontSize(10).fillColor("#5E6C84").text("Til:", 50, y);
  y += 14;
  doc.fontSize(12).fillColor("#172B4D").text(customerName, 50, y);
  if (customerAddress) doc.fontSize(9).text(customerAddress, 50, doc.y + 4);
  y = doc.y + 20;

  // Linjer
  let subtotal = 0;
  if (lineItems && lineItems.length > 0) {
    for (const li of lineItems) subtotal += li.sum ?? li.quantity * li.unitPrice;
  } else {
    subtotal = Number(invoice.totalAmount);
  }

  doc.fontSize(11).fillColor("#172B4D")
    .text(`Vi har ikke registrert betaling for faktura ${invNum} datert ${fmtDate(invoice.periodEnd)}.`, 50, y, { width: 495 });
  y = doc.y + 12;
  doc.text(`Utestående beløp: `, 50, y, { continued: true }).font("Helvetica-Bold").text(fmtKr(subtotal));
  doc.font("Helvetica");
  y = doc.y + 16;

  const sluttsetning = reminderNum === 1
    ? "Vi ber deg vennligst betale snarest mulig."
    : reminderNum === 2
      ? "Vi ber deg overføre beløpet umiddelbart for å unngå videre purringer."
      : "Dette er SISTE purring før vi vurderer videre inkassotiltak. Vennligst betal innen 7 dager.";
  doc.text(sluttsetning, 50, y, { width: 495 });

  y = doc.y + 24;
  if (org.bankAccount) {
    doc.fontSize(10).fillColor("#5E6C84")
      .text(`Innbetales til: ${org.bankAccount}`, 50, y)
      .text(`Merk med fakturanummer: ${invNum}`, 50, doc.y + 4);
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(chunks);

  // ── Bygg epost ─────────────────────────────────────────────
  const subjectPrefix = reminderNum === 1
    ? "Påminnelse"
    : reminderNum === 2
      ? "Andre påminnelse"
      : "Siste purring";
  const subject = parsed.data.subject || `${subjectPrefix}: Faktura ${invNum} fra ${org.name}`;

  const defaultBody = `
    <p>Hei ${customerName},</p>
    <p>Vi har dessverre ikke registrert betaling for faktura <strong>${invNum}</strong> på <strong>${fmtKr(subtotal)}</strong>, som hadde forfall ${fmtDate(invoice.dueDate)} (${daysOverdue} dager siden).</p>
    <p>${sluttsetning}</p>
    ${org.bankAccount ? `<p>Innbetales til <strong>${org.bankAccount}</strong>. Merk innbetalingen med fakturanummer <strong>${invNum}</strong>.</p>` : ""}
    <p>Hvis du allerede har betalt - beklager mas. Send oss gjerne kvittering så vi får registrert det.</p>
    <p>Mvh<br>${org.name}</p>
  `;

  const result = await sendEmail({
    to: toAddress,
    subject,
    html: parsed.data.body || defaultBody,
    attachments: [
      {
        filename: `purring-${invNum}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  if (!result.ok) {
    return res.status(502).json({
      error: "Kunne ikke sende purring",
      details: result.error,
    });
  }

  // Oppdater Invoice, reminderCount + tidspunkt
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      reminderSentAt: new Date(),
      reminderCount: invoice.reminderCount + 1,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "invoice.reminder_sent",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { to: toAddress, reminderNum, daysOverdue },
    },
  });

  return res.json({
    ok: true,
    reminderNum,
    daysOverdue,
    sentAt: new Date().toISOString(),
  });
});

export default router;
