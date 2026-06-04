/**
 * PDF-rapporter — eksport av regnskap/statistikk/faktura-liste til PDF.
 *
 *   GET /pdf-reports/regnskap?year=YYYY    — årsoversikt: inntekter/utgifter/resultat
 *   GET /pdf-reports/statistikk?year=YYYY  — KPI-dashboard: leads, omsetning, topp-klienter
 *   GET /pdf-reports/fakturaer?year=YYYY[&status=]  — liste over fakturaer
 *
 * Brukes for: levere til regnskapsfører, vise til investor, egne arkiver.
 * Bruker pdfkit (samme som invoicePdf.ts) — ren node, ingen browser-driver.
 *
 * Multi-tenant: organizationId fra session, fail-closed på all data.
 */
import { Router, Request, Response } from "express";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { parsePeriode, periodeRange, calcMva, bucket } from "../lib/mva";

const router = Router();
router.use(requireAuth);

// ── Hjelpere ─────────────────────────────────────────────────────

function fmtKr(n: number): string {
  return n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function fmtKrShort(n: number): string {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 }) + " kr";
}

function fmtDate(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

function parseYear(req: Request): number {
  const y = parseInt((req.query.year as string) || "", 10);
  if (isNaN(y) || y < 2000 || y > 2100) return new Date().getFullYear();
  return y;
}

function yearRange(year: number) {
  return {
    gte: new Date(`${year}-01-01T00:00:00Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00Z`),
  };
}

/**
 * Felles PDF-header med org-info og rapporttittel.
 * Returnerer y-koordinaten der innholdet kan starte.
 */
function writeHeader(
  doc: InstanceType<typeof PDFDocument>,
  org: { name: string; orgNumber: string | null; address: string | null; postalCode: string | null; city: string | null },
  title: string,
  subtitle: string,
): number {
  doc.fontSize(20).fillColor("#1e293b").text(title, 50, 50);
  doc.fontSize(11).fillColor("#64748b").text(subtitle, 50, 78);

  // Org-info top-right
  const orgLines = [
    org.name,
    org.orgNumber || "",
    org.address || "",
    [org.postalCode, org.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  doc.fontSize(9).fillColor("#475569");
  orgLines.forEach((line, i) => {
    doc.text(line, 350, 50 + i * 12, { width: 200, align: "right" });
  });

  // Generert-stamp
  doc.fontSize(8).fillColor("#94a3b8")
    .text(`Generert ${new Date().toLocaleString("nb-NO")}`, 350, 50 + orgLines.length * 12 + 4, {
      width: 200, align: "right",
    });

  // Divider-linje
  doc.moveTo(50, 120).lineTo(545, 120).strokeColor("#e2e8f0").lineWidth(1).stroke();

  return 140;
}

/**
 * KPI-bokser: liten ramme med label + verdi, brukes på alle rapportene.
 */
function drawKpiRow(
  doc: InstanceType<typeof PDFDocument>,
  startY: number,
  kpis: Array<{ label: string; value: string; color?: string }>,
): number {
  const boxW = (545 - 50 - (kpis.length - 1) * 8) / kpis.length;
  const boxH = 60;
  kpis.forEach((kpi, i) => {
    const x = 50 + i * (boxW + 8);
    doc.roundedRect(x, startY, boxW, boxH, 6).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fontSize(8).fillColor("#64748b").text(kpi.label.toUpperCase(), x + 10, startY + 10, { width: boxW - 20 });
    doc.fontSize(14).fillColor(kpi.color || "#1e293b").text(kpi.value, x + 10, startY + 26, { width: boxW - 20 });
  });
  return startY + boxH + 16;
}

// ── 1. Regnskap-rapport ──────────────────────────────────────────
router.get("/regnskap", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = parseYear(req);
  const range = yearRange(year);

  const [org, utgifter, invoices] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, orgNumber: true, address: true, postalCode: true, city: true },
    }),
    prisma.utgift.findMany({ where: { organizationId, dato: range }, orderBy: { dato: "asc" } }),
    prisma.invoice.findMany({
      where: { organizationId, status: "exported", periodEnd: range },
      orderBy: { periodEnd: "asc" },
      include: { sak: { include: { client: true } } },
    }),
  ]);
  if (!org) return res.status(404).json({ error: "Organisasjon ikke funnet" });

  // Aggregeringer
  const totalInntekt = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalUtgift = utgifter.reduce((s, u) => s + Number(u.belopInkMva), 0);
  const resultat = totalInntekt - totalUtgift;
  const avsetning = Math.max(0, resultat) * 0.35;

  const byMonth = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    inntekt: invoices
      .filter((i) => new Date(i.periodEnd).getMonth() === m)
      .reduce((s, i) => s + Number(i.totalAmount), 0),
    utgift: utgifter
      .filter((u) => new Date(u.dato).getMonth() === m)
      .reduce((s, u) => s + Number(u.belopInkMva), 0),
  }));

  // Utgifter per kategori
  const byKategori: Record<string, number> = {};
  for (const u of utgifter) {
    const k = u.kategori || "(uten kategori)";
    byKategori[k] = (byKategori[k] || 0) + Number(u.belopInkMva);
  }

  // Bygg PDF
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Regnskap ${year}`, Author: org.name, Creator: "Sakspilot" } });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  doc.on("end", () => {
    const buffer = Buffer.concat(buffers);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="regnskap-${year}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  });

  let y = writeHeader(doc, org, `Regnskap ${year}`, "Forenklet kontant-oversikt");

  // KPI-rad
  y = drawKpiRow(doc, y, [
    { label: "Inntekter", value: fmtKrShort(totalInntekt), color: "#14532d" },
    { label: "Utgifter", value: fmtKrShort(totalUtgift), color: "#7f1d1d" },
    { label: "Resultat", value: fmtKrShort(resultat), color: resultat >= 0 ? "#14532d" : "#7f1d1d" },
    { label: "Avsetning 35%", value: fmtKrShort(avsetning), color: "#92400e" },
  ]);

  // Måneds-tabell
  doc.fontSize(12).fillColor("#1e293b").text("Per måned", 50, y);
  y += 18;
  doc.fontSize(9).fillColor("#64748b");
  doc.text("Måned", 50, y).text("Inntekt", 200, y, { width: 100, align: "right" })
     .text("Utgift", 310, y, { width: 100, align: "right" })
     .text("Resultat", 420, y, { width: 100, align: "right" });
  y += 16;
  doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();

  for (const m of byMonth) {
    if (m.inntekt === 0 && m.utgift === 0) continue;
    doc.fontSize(10).fillColor("#0f172a");
    doc.text(MONTHS[m.month], 50, y)
       .text(fmtKr(m.inntekt), 200, y, { width: 100, align: "right" })
       .text(fmtKr(m.utgift), 310, y, { width: 100, align: "right" })
       .text(fmtKr(m.inntekt - m.utgift), 420, y, { width: 100, align: "right" });
    y += 14;
  }
  y += 8;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cbd5e1").lineWidth(2).stroke();
  y += 6;
  doc.fontSize(10).fillColor("#1e293b").font("Helvetica-Bold");
  doc.text("Totalt", 50, y)
     .text(fmtKr(totalInntekt), 200, y, { width: 100, align: "right" })
     .text(fmtKr(totalUtgift), 310, y, { width: 100, align: "right" })
     .text(fmtKr(resultat), 420, y, { width: 100, align: "right" });
  doc.font("Helvetica");
  y += 24;

  // Utgifter per kategori
  if (Object.keys(byKategori).length > 0) {
    doc.fontSize(12).fillColor("#1e293b").text("Utgifter per kategori", 50, y);
    y += 18;
    for (const [k, sum] of Object.entries(byKategori).sort((a, b) => b[1] - a[1])) {
      doc.fontSize(10).fillColor("#0f172a").text(k, 50, y).text(fmtKr(sum), 420, y, { width: 100, align: "right" });
      y += 14;
    }
    y += 12;
  }

  // Faktura-detalj på ny side hvis det er mange
  if (invoices.length > 0) {
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fontSize(12).fillColor("#1e293b").text("Eksporterte fakturaer", 50, y);
    y += 18;
    doc.fontSize(9).fillColor("#64748b");
    doc.text("Nr.", 50, y).text("Dato", 90, y).text("Kunde", 170, y).text("Beløp", 420, y, { width: 100, align: "right" });
    y += 14;
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();
    for (const inv of invoices) {
      if (y > 770) { doc.addPage(); y = 50; }
      doc.fontSize(9).fillColor("#0f172a");
      doc.text(inv.invoiceNumber || "-", 50, y)
         .text(fmtDate(inv.periodEnd), 90, y)
         .text(inv.sak?.client?.name || inv.customerName || "-", 170, y, { width: 240 })
         .text(fmtKr(Number(inv.totalAmount)), 420, y, { width: 100, align: "right" });
      y += 12;
    }
  }

  doc.end();
});

// ── 2. Statistikk-rapport ────────────────────────────────────────
router.get("/statistikk", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = parseYear(req);
  const range = yearRange(year);

  const [org, foresporsler, invoices, utgifter] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, orgNumber: true, address: true, postalCode: true, city: true },
    }),
    prisma.foresporsel.findMany({ where: { organizationId } }),
    prisma.invoice.findMany({
      where: { organizationId, periodEnd: range },
      include: { sak: { include: { client: true } } },
    }),
    prisma.utgift.findMany({ where: { organizationId, dato: range } }),
  ]);
  if (!org) return res.status(404).json({ error: "Organisasjon ikke funnet" });

  // Lead-stats
  const vunnet = foresporsler.filter((f) => f.status === "vunnet").length;
  const tapt = foresporsler.filter((f) => f.status === "tapt").length;
  const aktive = foresporsler.filter((f) => f.status === "ny" || f.status === "i_dialog").length;
  const konvRate = vunnet + tapt > 0 ? (vunnet / (vunnet + tapt)) * 100 : 0;

  const wonLeads = foresporsler.filter((f) => f.status === "vunnet" && f.closedAt);
  const avgDays = wonLeads.length > 0
    ? wonLeads.reduce((s, f) => s + (new Date(f.closedAt!).getTime() - new Date(f.createdAt).getTime()) / 86400000, 0) / wonLeads.length
    : 0;

  const pipelineValue = foresporsler
    .filter((f) => f.status === "ny" || f.status === "i_dialog")
    .reduce((s, f) => s + (f.estimatedValue || 0), 0);

  // Økonomi
  const exportedInvoices = invoices.filter((i) => i.status === "exported");
  const inntekt = exportedInvoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const utgift = utgifter.reduce((s, u) => s + Number(u.belopInkMva), 0);
  const resultat = inntekt - utgift;
  const snittFaktura = exportedInvoices.length > 0 ? inntekt / exportedInvoices.length : 0;

  // Topp klienter
  const clientRev: Record<string, { total: number; count: number }> = {};
  for (const inv of exportedInvoices) {
    const cName = inv.sak?.client?.name || inv.customerName || "Ukjent";
    if (!clientRev[cName]) clientRev[cName] = { total: 0, count: 0 };
    clientRev[cName].total += Number(inv.totalAmount);
    clientRev[cName].count += 1;
  }
  const topClients = Object.entries(clientRev)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Bygg PDF
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Statistikk ${year}`, Author: org.name, Creator: "Sakspilot" } });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  doc.on("end", () => {
    const buffer = Buffer.concat(buffers);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="statistikk-${year}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  });

  let y = writeHeader(doc, org, `Statistikk ${year}`, "KPI-rapport for virksomheten");

  // Lead-KPIer
  doc.fontSize(12).fillColor("#1e293b").text("Lead-pipeline", 50, y);
  y += 18;
  y = drawKpiRow(doc, y, [
    { label: "Aktive forespørsler", value: String(aktive) },
    { label: "Konverteringsrate", value: `${konvRate.toFixed(0)} %`, color: konvRate >= 50 ? "#14532d" : "#92400e" },
    { label: "Snitt → kunde", value: `${avgDays.toFixed(0)} d` },
    { label: "Pipeline-verdi", value: fmtKrShort(pipelineValue), color: "#1e3a8a" },
  ]);

  // Økonomi-KPIer
  doc.fontSize(12).fillColor("#1e293b").text("Økonomi", 50, y);
  y += 18;
  y = drawKpiRow(doc, y, [
    { label: "Inntekt", value: fmtKrShort(inntekt), color: "#14532d" },
    { label: "Utgift", value: fmtKrShort(utgift), color: "#7f1d1d" },
    { label: "Resultat", value: fmtKrShort(resultat), color: resultat >= 0 ? "#14532d" : "#7f1d1d" },
    { label: "Snitt faktura", value: fmtKrShort(snittFaktura) },
  ]);

  // Topp klienter
  if (topClients.length > 0) {
    doc.fontSize(12).fillColor("#1e293b").text("Topp klienter (etter omsetning)", 50, y);
    y += 18;
    doc.fontSize(9).fillColor("#64748b");
    doc.text("#", 50, y).text("Klient", 80, y).text("Antall", 350, y, { width: 60, align: "right" })
       .text("Sum", 420, y, { width: 100, align: "right" });
    y += 14;
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();
    topClients.forEach((c, i) => {
      doc.fontSize(10).fillColor("#0f172a");
      doc.text(`${i + 1}`, 50, y).text(c.name, 80, y, { width: 270 })
         .text(String(c.count), 350, y, { width: 60, align: "right" })
         .text(fmtKr(c.total), 420, y, { width: 100, align: "right" });
      y += 14;
    });
    y += 8;
  }

  // Forespørsler-fordeling
  if (foresporsler.length > 0) {
    doc.fontSize(12).fillColor("#1e293b").text("Forespørsler - fordeling", 50, y);
    y += 18;
    const statuses = ["ny", "i_dialog", "vunnet", "tapt", "arkivert"] as const;
    for (const s of statuses) {
      const count = foresporsler.filter((f) => f.status === s).length;
      if (count === 0) continue;
      doc.fontSize(10).fillColor("#0f172a").text(s, 50, y).text(String(count), 420, y, { width: 100, align: "right" });
      y += 14;
    }
  }

  doc.end();
});

// ── 3. Faktura-liste-rapport ─────────────────────────────────────
router.get("/fakturaer", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = parseYear(req);
  const range = yearRange(year);
  const statusFilter = req.query.status as string | undefined;

  const [org, invoices] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, orgNumber: true, address: true, postalCode: true, city: true },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        periodEnd: range,
        ...(statusFilter && ["draft", "exported", "cancelled"].includes(statusFilter)
          ? { status: statusFilter as "draft" | "exported" | "cancelled" }
          : {}),
      },
      include: { sak: { include: { client: true } } },
      orderBy: [{ periodEnd: "asc" }, { invoiceNumber: "asc" }],
    }),
  ]);
  if (!org) return res.status(404).json({ error: "Organisasjon ikke funnet" });

  const totalAmount = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const paidAmount = invoices.filter((i) => i.paidAt).reduce((s, i) => s + Number(i.totalAmount), 0);
  const unpaidAmount = totalAmount - paidAmount;

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Fakturaer ${year}`, Author: org.name, Creator: "Sakspilot" } });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  doc.on("end", () => {
    const buffer = Buffer.concat(buffers);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="fakturaer-${year}${statusFilter ? `-${statusFilter}` : ""}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  });

  const subtitle = statusFilter ? `Status: ${statusFilter}` : "Alle statuser";
  let y = writeHeader(doc, org, `Fakturaer ${year}`, subtitle);

  y = drawKpiRow(doc, y, [
    { label: "Antall", value: String(invoices.length) },
    { label: "Sum totalt", value: fmtKrShort(totalAmount) },
    { label: "Betalt", value: fmtKrShort(paidAmount), color: "#14532d" },
    { label: "Utestående", value: fmtKrShort(unpaidAmount), color: unpaidAmount > 0 ? "#92400e" : "#94a3b8" },
  ]);

  if (invoices.length === 0) {
    doc.fontSize(11).fillColor("#94a3b8").text("Ingen fakturaer matcher filter.", 50, y);
    doc.end();
    return;
  }

  doc.fontSize(9).fillColor("#64748b");
  doc.text("Nr.", 50, y).text("Dato", 90, y).text("Kunde", 160, y)
     .text("Status", 350, y, { width: 60 })
     .text("Beløp", 420, y, { width: 100, align: "right" });
  y += 14;
  doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();

  for (const inv of invoices) {
    if (y > 770) { doc.addPage(); y = 50; }
    const statusLabel = inv.paidAt ? "Betalt" : inv.status === "draft" ? "Utkast" : inv.status === "exported" ? "Sendt" : "Annull.";
    const statusColor = inv.paidAt ? "#14532d" : inv.status === "draft" ? "#92400e" : inv.status === "exported" ? "#1e3a8a" : "#7f1d1d";

    doc.fontSize(9).fillColor("#0f172a");
    doc.text(inv.invoiceNumber || "-", 50, y)
       .text(fmtDate(inv.periodEnd), 90, y)
       .text(inv.sak?.client?.name || inv.customerName || "-", 160, y, { width: 180 });
    doc.fillColor(statusColor).text(statusLabel, 350, y, { width: 60 });
    doc.fillColor("#0f172a").text(fmtKr(Number(inv.totalAmount)), 420, y, { width: 100, align: "right" });
    y += 12;
  }

  doc.end();
});

// ── 4. MVA-rapport (PDF) ─────────────────────────────────────────
// Speiler logikken i mvaRapport.ts (kvartal/halvår/år), men rendrer PDF.
// Vi dupliserer beregning isf å importere fordi mvaRapport.ts er Express-
// router og det blir kjedelig å trekke ut + dele state. Hvis denne diverger
// med JSON-versjonen, fix begge.
router.get("/mva", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const yr = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const periode = parsePeriode(req.query.periode as string);
  const { start, end, label } = periodeRange(yr, periode);

  const [org, invoices, utgifter] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, orgNumber: true, address: true, postalCode: true, city: true },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["exported", "draft"] }, periodEnd: { gte: start, lt: end } },
      select: { totalAmount: true, mvaSats: true, mvaInkludert: true, status: true },
    }),
    prisma.utgift.findMany({
      where: { organizationId, dato: { gte: start, lt: end } },
      select: { belopInkMva: true, mvaSats: true },
    }),
  ]);
  if (!org) return res.status(404).json({ error: "Organisasjon ikke funnet" });

  // Buckets — bruker shared lib slik at MVA-logikken er identisk med
  // mvaRapport.ts. Lokal struktur for å holde PDF-rendring enkel.
  type Bucket = { grunnlag: number; mva: number };
  const utgaaende = { totalt: 0, "25": { grunnlag: 0, mva: 0 } as Bucket, "15": { grunnlag: 0, mva: 0 } as Bucket, "12": { grunnlag: 0, mva: 0 } as Bucket, fritak: { grunnlag: 0, mva: 0 } as Bucket };
  const inngaaende = { totalt: 0, "25": { grunnlag: 0, mva: 0 } as Bucket, "15": { grunnlag: 0, mva: 0 } as Bucket, "12": { grunnlag: 0, mva: 0 } as Bucket, fritak: { grunnlag: 0, mva: 0 } as Bucket };

  for (const inv of invoices) {
    const total = Number(inv.totalAmount);
    const sats = inv.mvaSats ?? 25;
    const { netto, mva } = calcMva(total, sats, inv.mvaInkludert);
    const key = bucket(sats);
    utgaaende[key].grunnlag += netto;
    utgaaende[key].mva += mva;
    utgaaende.totalt += mva;
  }
  for (const u of utgifter) {
    const total = Number(u.belopInkMva);
    if (u.mvaSats === null) {
      inngaaende.fritak.grunnlag += total;
      continue;
    }
    const { netto, mva } = calcMva(total, u.mvaSats, true);
    const key = bucket(u.mvaSats);
    inngaaende[key].grunnlag += netto;
    inngaaende[key].mva += mva;
    inngaaende.totalt += mva;
  }
  const netto = utgaaende.totalt - inngaaende.totalt;

  // Bygg PDF
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `MVA-rapport ${label}`, Author: org.name, Creator: "Sakspilot" } });
  const buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  doc.on("end", () => {
    const buffer = Buffer.concat(buffers);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="mva-${periode}-${yr}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  });

  let y = writeHeader(doc, org, `MVA-rapport ${label}`, `${start.toISOString().slice(0, 10)} – ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`);

  // KPI-rad: utgående / inngående / netto
  y = drawKpiRow(doc, y, [
    { label: "Utgående MVA (på salg)", value: fmtKrShort(utgaaende.totalt), color: "#14532d" },
    { label: "Inngående MVA (på kjøp)", value: fmtKrShort(inngaaende.totalt), color: "#1e3a8a" },
    { label: netto >= 0 ? "Skyldig Skatteetaten" : "Få igjen", value: fmtKrShort(Math.abs(netto)), color: netto >= 0 ? "#7f1d1d" : "#14532d" },
    { label: "Antall bilag", value: `${invoices.length} fak. + ${utgifter.length} utg.` },
  ]);

  // Utgående MVA-tabell
  doc.fontSize(12).fillColor("#1e293b").text("Utgående MVA (krevd inn fra kunder)", 50, y);
  y += 18;
  doc.fontSize(9).fillColor("#64748b");
  doc.text("MVA-sats", 50, y).text("Grunnlag", 250, y, { width: 120, align: "right" }).text("MVA", 380, y, { width: 120, align: "right" });
  y += 14;
  doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();

  for (const sats of ["25", "15", "12", "fritak"] as const) {
    const b = utgaaende[sats];
    if (b.grunnlag === 0 && b.mva === 0) continue;
    const label = sats === "fritak" ? "0 % / fritak" : `${sats} %`;
    doc.fontSize(10).fillColor("#0f172a")
      .text(label, 50, y)
      .text(fmtKr(b.grunnlag), 250, y, { width: 120, align: "right" })
      .text(fmtKr(b.mva), 380, y, { width: 120, align: "right" });
    y += 14;
  }
  y += 4;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cbd5e1").lineWidth(2).stroke();
  y += 6;
  doc.fontSize(10).fillColor("#1e293b").font("Helvetica-Bold")
    .text("Sum utgående", 50, y).text(fmtKr(utgaaende.totalt), 380, y, { width: 120, align: "right" });
  doc.font("Helvetica");
  y += 24;

  // Inngående MVA-tabell
  doc.fontSize(12).fillColor("#1e293b").text("Inngående MVA (fradragsberettiget på kjøp)", 50, y);
  y += 18;
  doc.fontSize(9).fillColor("#64748b");
  doc.text("MVA-sats", 50, y).text("Grunnlag", 250, y, { width: 120, align: "right" }).text("MVA", 380, y, { width: 120, align: "right" });
  y += 14;
  doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor("#e2e8f0").stroke();
  for (const sats of ["25", "15", "12", "fritak"] as const) {
    const b = inngaaende[sats];
    if (b.grunnlag === 0 && b.mva === 0) continue;
    const label = sats === "fritak" ? "0 % / uten sats" : `${sats} %`;
    doc.fontSize(10).fillColor("#0f172a")
      .text(label, 50, y)
      .text(fmtKr(b.grunnlag), 250, y, { width: 120, align: "right" })
      .text(fmtKr(b.mva), 380, y, { width: 120, align: "right" });
    y += 14;
  }
  y += 4;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cbd5e1").lineWidth(2).stroke();
  y += 6;
  doc.fontSize(10).fillColor("#1e293b").font("Helvetica-Bold")
    .text("Sum inngående", 50, y).text(fmtKr(inngaaende.totalt), 380, y, { width: 120, align: "right" });
  doc.font("Helvetica");
  y += 28;

  // Netto-konklusjon
  const nettoBoxColor = netto >= 0 ? "#fef2f2" : "#f0fdf4";
  const nettoTextColor = netto >= 0 ? "#7f1d1d" : "#14532d";
  doc.roundedRect(50, y, 495, 60, 8).fillAndStroke(nettoBoxColor, "#cbd5e1");
  doc.fontSize(11).fillColor("#64748b")
    .text(netto >= 0 ? "TIL INNBETALING TIL SKATTEETATEN" : "TIL UTBETALING FRA SKATTEETATEN", 60, y + 12);
  doc.fontSize(24).fillColor(nettoTextColor).font("Helvetica-Bold")
    .text(fmtKr(Math.abs(netto)), 60, y + 28);
  doc.font("Helvetica");
  y += 80;

  // Disclaimer
  doc.fontSize(8).fillColor("#94a3b8").text(
    "Forenklet MVA-rapport - gir et bilde av status, men er ikke en MVA-melding. " +
    "For innlevering til Skatteetaten må du føre tallene inn i Altinn-skjemaet RF-0002, eller eksportere til Fiken/Tripletex.",
    50, y, { width: 495 }
  );

  doc.end();
});

export default router;
