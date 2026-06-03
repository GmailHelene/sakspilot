/**
 * Faktura-PDF — generer en pent formatert norsk faktura som PDF for en sak.
 *
 *   POST /invoice-pdf/sak/:sakId
 *     Body (alle felter valgfrie):
 *       {
 *         periodFrom?:         ISO-date — start på tidsvindu (default: null = alle)
 *         periodTo?:           ISO-date — slutt på tidsvindu (default: null = alle)
 *         invoiceNumber?:      string   — overstyr auto-generert nummer
 *         includeNonBillable?: boolean  — ta med ikke-fakturerbare timer også (default false)
 *         extraNote?:          string   — fritekst som vises i footer
 *       }
 *
 *   Returnerer PDF-binær med Content-Disposition: attachment.
 *
 * Designvalg:
 *   - pdfkit pga ren node-implementasjon, ingen headless-browser
 *   - 25% MVA hardkodet (norsk standardsats — fakturaer for andre satser
 *     må uansett gå via Fiken)
 *   - 14 dagers forfall (norsk de-facto standard)
 *   - Bankkonto/adresse leses fra Organization-modellen; faller tilbake til
 *     placeholder hvis brukeren ikke har fylt ut /innstillinger
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { safeParseLineItems } from "../lib/invoiceLineItems";

const router = Router();
router.use(requireAuth);

const MVA_RATE = 0.25;
const DUE_DAYS = 14;

const BodySchema = z.object({
  periodFrom: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  periodTo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  invoiceNumber: z.string().min(1).max(64).optional(),
  includeNonBillable: z.boolean().optional(),
  extraNote: z.string().max(1000).optional(),
});

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  // Bruker timestamp-suffiks for å unngå kollisjon hvis det lages flere samme dag.
  // Dette er ikke et "ekte" fortløpende nummer — bruk Fiken hvis du trenger det.
  const suffix = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `INV-${y}${m}${d}-${suffix}`;
}

function fmtKr(n: number): string {
  return (
    n
      .toLocaleString("nb-NO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " kr"
  );
}

function fmtOrgNumber(orgNumber: string | null): string {
  if (!orgNumber) return "(org.nr ikke satt)";
  const digits = orgNumber.replace(/\D/g, "");
  if (digits.length !== 9) return `Org.nr ${orgNumber}`;
  return `Org.nr ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} MVA`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function sanitizeFilename(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "faktura";
}

router.post("/sak/:sakId", async (req: Request, res: Response) => {
  const session = req.session!;
  const sakId = req.params.sakId;

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig body", details: parsed.error.flatten() });
  }
  const { periodFrom, periodTo, invoiceNumber, includeNonBillable, extraNote } = parsed.data;

  // Sak må tilhøre brukerens organisasjon (fail-closed)
  const sak = await prisma.sak.findFirst({
    where: { id: sakId, organizationId: session.organizationId },
    include: {
      client: true,
      organization: true,
    },
  });
  if (!sak) {
    return res.status(404).json({ error: "Prosjekt ikke funnet" });
  }

  const fromDate = periodFrom ? new Date(periodFrom) : undefined;
  const toDate = periodTo ? new Date(periodTo) : undefined;
  if (fromDate && isNaN(fromDate.getTime())) {
    return res.status(400).json({ error: "Ugyldig periodFrom" });
  }
  if (toDate && isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "Ugyldig periodTo" });
  }

  const entries = await prisma.timeEntry.findMany({
    where: {
      sakId,
      ...(includeNonBillable ? {} : { billable: true }),
      ...(fromDate || toDate
        ? {
            startedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { startedAt: "asc" },
  });

  // Default-sats: sak → client → org
  const defaultRate =
    sak.hourlyRate ??
    sak.client?.defaultHourlyRate ??
    sak.organization.defaultHourlyRate ??
    0;

  const invNum = invoiceNumber || generateInvoiceNumber();
  const issuedAt = new Date();
  const dueAt = new Date(issuedAt.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000);

  const org = sak.organization;
  const orgAddrLine1 = org.address || "(adresse ikke satt — fyll ut i innstillinger)";
  const orgAddrLine2 =
    org.postalCode || org.city
      ? `${org.postalCode ?? ""} ${org.city ?? ""}`.trim()
      : "";

  // Bygg PDF i minnet — sender hele bufferet på slutten (saker er små,
  // og dette unngår race-conditions med Express' res.end).
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `Faktura ${invNum}`,
      Author: org.name,
      Creator: "Sakspilot",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // ── Header: org-info (venstre) + "FAKTURA" + nummer/dato (høyre) ──
  const leftX = 50;
  const rightX = 350;
  let cursorY = 50;

  doc
    .fontSize(18)
    .fillColor("#1E3A5F")
    .text(org.name, leftX, cursorY, { width: 280 });
  doc
    .fontSize(9)
    .fillColor("#5E6C84")
    .text(fmtOrgNumber(org.orgNumber), leftX, doc.y + 2, { width: 280 });
  if (orgAddrLine1) doc.text(orgAddrLine1, leftX, doc.y + 2, { width: 280 });
  if (orgAddrLine2) doc.text(orgAddrLine2, leftX, doc.y + 2, { width: 280 });
  if (org.billingEmail) doc.text(org.billingEmail, leftX, doc.y + 2, { width: 280 });

  doc
    .fontSize(28)
    .fillColor("#172B4D")
    .text("FAKTURA", rightX, cursorY, { width: 200, align: "right" });
  doc
    .fontSize(10)
    .fillColor("#172B4D")
    .text(`Fakturanr: ${invNum}`, rightX, doc.y + 6, { width: 200, align: "right" });
  doc.text(`Fakturadato: ${fmtDate(issuedAt)}`, rightX, doc.y + 2, {
    width: 200,
    align: "right",
  });
  doc.text(`Forfall: ${fmtDate(dueAt)}`, rightX, doc.y + 2, {
    width: 200,
    align: "right",
  });

  // Reset cursor til etter header
  cursorY = Math.max(doc.y, 180) + 20;

  // ── Klient-info ──
  doc
    .fontSize(10)
    .fillColor("#5E6C84")
    .text("Faktura til:", leftX, cursorY);
  cursorY += 14;
  doc.fontSize(12).fillColor("#172B4D");
  if (sak.client) {
    doc.text(sak.client.name, leftX, cursorY);
    cursorY = doc.y + 2;
    doc.fontSize(9).fillColor("#5E6C84");
    if (sak.client.orgNumber) {
      doc.text(fmtOrgNumber(sak.client.orgNumber), leftX, cursorY);
      cursorY = doc.y + 2;
    }
    if (sak.client.address) {
      doc.text(sak.client.address, leftX, cursorY, { width: 280 });
      cursorY = doc.y + 2;
    }
    if (sak.client.contactEmail) {
      doc.text(sak.client.contactEmail, leftX, cursorY);
      cursorY = doc.y + 2;
    }
    if (sak.client.contactPhone) {
      doc.text(sak.client.contactPhone, leftX, cursorY);
      cursorY = doc.y + 2;
    }
  } else {
    doc.fontSize(10).fillColor("#5E6C84");
    doc.text("(Intern sak — ingen klient knyttet)", leftX, cursorY);
    cursorY = doc.y + 2;
  }

  // Sak-tittel som referanse
  cursorY += 12;
  doc
    .fontSize(10)
    .fillColor("#5E6C84")
    .text(`Prosjekt: ${sak.title}${sak.saksnummer ? ` (${sak.saksnummer})` : ""}`, leftX, cursorY);
  if (fromDate || toDate) {
    cursorY = doc.y + 2;
    doc.text(
      `Periode: ${fromDate ? fmtDate(fromDate) : "start"} – ${toDate ? fmtDate(toDate) : "i dag"}`,
      leftX,
      cursorY
    );
  }
  cursorY = doc.y + 20;

  // ── Tabell-header ──
  const colDate = 50;
  const colDesc = 110;
  const colHours = 360;
  const colRate = 415;
  const colSum = 480;
  const tableRight = 545;

  doc
    .fontSize(9)
    .fillColor("#5E6C84")
    .text("Dato", colDate, cursorY)
    .text("Beskrivelse", colDesc, cursorY)
    .text("Timer", colHours, cursorY, { width: 50, align: "right" })
    .text("Sats", colRate, cursorY, { width: 60, align: "right" })
    .text("Sum", colSum, cursorY, { width: tableRight - colSum, align: "right" });
  cursorY += 12;
  doc
    .moveTo(colDate, cursorY)
    .lineTo(tableRight, cursorY)
    .strokeColor("#E6E9EF")
    .stroke();
  cursorY += 6;

  // ── Linjer ──
  let subtotal = 0;
  let totalHours = 0;
  doc.fontSize(9).fillColor("#172B4D");

  if (entries.length === 0) {
    doc.fillColor("#5E6C84").text(
      includeNonBillable
        ? "Ingen tidsregistreringer funnet i den valgte perioden."
        : "Ingen fakturerbare timer funnet i den valgte perioden.",
      colDate,
      cursorY + 4,
      { width: tableRight - colDate }
    );
    cursorY = doc.y + 10;
  } else {
    for (const e of entries) {
      // Sidebrytting hvis vi nærmer oss footer
      if (cursorY > 700) {
        doc.addPage();
        cursorY = 50;
      }
      const hours = e.durationSec / 3600;
      const rate = e.hourlyRate ?? defaultRate;
      const sum = hours * rate;
      totalHours += hours;
      subtotal += sum;

      const desc =
        (e.note?.trim() || e.windowTitle?.trim() || sak.title).slice(0, 80) +
        (!e.billable ? "  (ikke-fakturerbar)" : "");

      doc.fillColor("#172B4D");
      doc.text(fmtDate(new Date(e.startedAt)), colDate, cursorY, { width: 55 });
      doc.text(desc, colDesc, cursorY, { width: colHours - colDesc - 6 });
      doc.text(hours.toFixed(1), colHours, cursorY, { width: 50, align: "right" });
      doc.text(`${rate} kr`, colRate, cursorY, { width: 60, align: "right" });
      doc.text(fmtKr(sum), colSum, cursorY, {
        width: tableRight - colSum,
        align: "right",
      });

      // Bruk høyeste y etter rendering (beskrivelsen kan ha wrappet)
      cursorY = Math.max(doc.y, cursorY + 14);
    }
  }

  // ── Totaler ──
  cursorY += 6;
  doc
    .moveTo(colHours, cursorY)
    .lineTo(tableRight, cursorY)
    .strokeColor("#E6E9EF")
    .stroke();
  cursorY += 8;

  const mva = subtotal * MVA_RATE;
  const total = subtotal + mva;

  doc
    .fontSize(10)
    .fillColor("#5E6C84")
    .text("Sum timer:", colRate, cursorY, { width: 60, align: "right" })
    .fillColor("#172B4D")
    .text(`${totalHours.toFixed(1)} t`, colSum, cursorY, {
      width: tableRight - colSum,
      align: "right",
    });
  cursorY += 14;

  doc
    .fillColor("#5E6C84")
    .text("Subtotal:", colRate, cursorY, { width: 60, align: "right" })
    .fillColor("#172B4D")
    .text(fmtKr(subtotal), colSum, cursorY, {
      width: tableRight - colSum,
      align: "right",
    });
  cursorY += 14;

  doc
    .fillColor("#5E6C84")
    .text(`MVA (${(MVA_RATE * 100).toFixed(0)} %):`, colRate, cursorY, {
      width: 60,
      align: "right",
    })
    .fillColor("#172B4D")
    .text(fmtKr(mva), colSum, cursorY, {
      width: tableRight - colSum,
      align: "right",
    });
  cursorY += 14;

  doc
    .moveTo(colRate, cursorY)
    .lineTo(tableRight, cursorY)
    .strokeColor("#172B4D")
    .stroke();
  cursorY += 6;

  doc
    .fontSize(12)
    .fillColor("#172B4D")
    .text("Totalt å betale:", colRate - 60, cursorY, {
      width: 120,
      align: "right",
    });
  doc.text(fmtKr(total), colSum, cursorY, {
    width: tableRight - colSum,
    align: "right",
  });
  cursorY += 24;

  // ── Betalingsinfo ──
  doc
    .fontSize(10)
    .fillColor("#172B4D")
    .text("Betaling", leftX, cursorY);
  cursorY += 14;
  doc.fontSize(9).fillColor("#172B4D");
  doc.text(
    `Forfallsdato: ${fmtDate(dueAt)} (${DUE_DAYS} dager)`,
    leftX,
    cursorY
  );
  cursorY = doc.y + 2;
  doc.text(
    `Bankkonto: ${org.bankAccount || "(legg inn i innstillinger)"}`,
    leftX,
    cursorY
  );
  cursorY = doc.y + 2;
  doc.text(`Merkes: Fakturanr ${invNum}`, leftX, cursorY);
  cursorY = doc.y + 12;

  if (extraNote) {
    doc.fontSize(9).fillColor("#5E6C84").text(extraNote, leftX, cursorY, {
      width: tableRight - leftX,
    });
    cursorY = doc.y + 8;
  }

  // ── Footer ──
  doc
    .fontSize(8)
    .fillColor("#8993A4")
    .text(
      `${org.name}  ·  ${fmtOrgNumber(org.orgNumber)}${org.billingEmail ? "  ·  " + org.billingEmail : ""}`,
      leftX,
      780,
      { width: tableRight - leftX, align: "center" }
    );

  // Vent på at PDF-en er ferdig før vi sender
  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(chunks);

  const filename = `faktura-${sanitizeFilename(sak.title)}-${invNum}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.setHeader("Content-Length", String(pdfBuffer.length));
  return res.send(pdfBuffer);
});

/**
 * GET /invoice-pdf/invoice/:invoiceId
 *
 * Generer PDF fra en lagret Invoice-record (med lineItems).
 * Brukes for manuelle fakturaer opprettet via /fakturaer-UI eller importert
 * fra portal-hub. Forskjellig fra POST /sak/:sakId som genererer fra timer.
 *
 * Hvis lineItems mangler (gamle invoices generert via /accounting/fiken),
 * faller vi tilbake til en aggregert linje basert på totalHours × hourlyRate.
 */
router.get("/invoice/:invoiceId", async (req: Request, res: Response) => {
  const session = req.session!;
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, organizationId: session.organizationId },
    include: {
      sak: { include: { client: true } },
      organization: true,
    },
  });
  if (!invoice) return res.status(404).json({ error: "Faktura ikke funnet" });

  const org = invoice.organization;
  const client = invoice.sak?.client;
  const customerName = client?.name || invoice.customerName || "(uten kunde)";
  const customerAddress = client?.address || invoice.customerAddress || "";

  const invNum = invoice.invoiceNumber || generateInvoiceNumber();
  const issuedAt = invoice.periodEnd;
  const dueAt = invoice.dueDate || new Date(issuedAt.getTime() + DUE_DAYS * 86400000);

  // lineItems lagres som Json — trygg parsing med Zod-validering så vi ikke
  // krasjer hvis form-en er korrupt (gammel data, manuell DB-edit).
  const lineItemsParsed = safeParseLineItems(invoice.lineItems);
  const lineItems = lineItemsParsed.length > 0 ? lineItemsParsed : null;

  const doc = new PDFDocument({
    size: "A4", margin: 50,
    info: { Title: `Faktura ${invNum}`, Author: org.name, Creator: "Sakspilot" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Header (forenklet versjon av sak-PDF)
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

  // Linjer
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
    // Fallback: én linje basert på totaler
    subtotal = Number(invoice.totalAmount);
    doc.fontSize(9).fillColor("#172B4D")
      .text(`Tjenester ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, 50, y, { width: 300 })
      .text(String(invoice.totalHours), 360, y, { width: 50, align: "right" })
      .text("—", 415, y, { width: 60, align: "right" })
      .text(fmtKr(subtotal), 480, y, { width: 65, align: "right" });
    y = doc.y + 6;
  }

  y += 12;
  doc.moveTo(360, y).lineTo(545, y).strokeColor("#cbd5e1").lineWidth(1.5).stroke();
  y += 8;

  // Totaler (MVA er allerede inkl. i unitPrice for manuelle fakturaer —
  // dette er hub-konvensjonen. Hvis vi senere håndterer MVA separat, må
  // CreateInvoiceSchema få et flag for det.)
  doc.fontSize(11).fillColor("#172B4D").font("Helvetica-Bold")
    .text("Total:", 360, y, { width: 115, align: "right" })
    .text(`${fmtKr(subtotal)}`, 480, y, { width: 65, align: "right" });
  doc.font("Helvetica");

  y += 32;
  // Betalingsinfo
  if (org.bankAccount) {
    doc.fontSize(9).fillColor("#5E6C84")
      .text(`Innbetales til: ${org.bankAccount}`, 50, y)
      .text(`Forfall: ${fmtDate(dueAt)}`, 50, doc.y + 4);
  }

  // Status-stempel for ferdige fakturaer
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

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="faktura-${invNum}.pdf"`);
  res.setHeader("Content-Length", String(pdfBuffer.length));
  return res.send(pdfBuffer);
});

export default router;
