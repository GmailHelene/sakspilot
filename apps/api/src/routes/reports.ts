/**
 * Reports-routes, aggregerte rapporter på tvers av saker.
 *
 *   GET /reports/dashboard?period=week|month|quarter
 *      , denne ukens/månedens/kvartalets timer + beløp + topp-saker
 *
 *   GET /reports/month.csv?year=2026&month=5
 *      , eksporter alle fakturerbare timer for én måned (alle saker)
 *         til CSV, ideelt grunnlag for månedlig faktura-batch.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/**
 * GET /reports/home
 * Optimalisert for hjem-siden, returnerer ALT i ett kall i stedet for at
 * frontend itererer over saker og kaller time-summary per sak (N+1 problem).
 */
router.get("/home", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
  weekStart.setHours(0, 0, 0, 0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const week7d = new Date(now.getTime() + 7 * 86400000);

  const [
    activeSakerCount,
    todayMilestones,
    overdueMilestones,
    upcomingMilestones,
    recentSaker,
    weekEntries,
    automationsCount,
    pendingEmailLinks,
  ] = await Promise.all([
    prisma.sak.count({
      where: { organizationId, archived: false, status: { notIn: ["ferdig", "arkivert"] } },
    }),
    prisma.milestone.findMany({
      where: {
        completedAt: null,
        dueDate: { gte: todayStart, lt: todayEnd },
        sak: { organizationId, archived: false },
      },
      include: { sak: { select: { id: true, title: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.milestone.findMany({
      where: {
        completedAt: null,
        dueDate: { lt: todayStart },
        sak: { organizationId, archived: false },
      },
      include: { sak: { select: { id: true, title: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    prisma.milestone.findMany({
      where: {
        completedAt: null,
        dueDate: { gte: todayEnd, lte: week7d },
        sak: { organizationId, archived: false },
      },
      include: { sak: { select: { id: true, title: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.sak.findMany({
      where: { organizationId, archived: false },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { userId, startedAt: { gte: weekStart }, sak: { organizationId } },
      select: { durationSec: true, billable: true, hourlyRate: true },
    }),
    prisma.automation.count({ where: { organizationId, enabled: true } }),
    prisma.emailLink.count({
      where: {
        sak: { organizationId },
        receivedAt: { gte: weekStart },
      },
    }),
  ]);

  const totalSec = weekEntries.reduce((s, e) => s + e.durationSec, 0);
  const billableAmount = weekEntries
    .filter((e) => e.billable && e.hourlyRate)
    .reduce((s, e) => s + (e.durationSec / 3600) * (e.hourlyRate ?? 0), 0);

  return res.json({
    activeSaker: activeSakerCount,
    weekHours: Math.round((totalSec / 3600) * 10) / 10,
    weekRevenue: Math.round(billableAmount),
    todayMilestones: todayMilestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: m.dueDate,
      sakId: m.sak.id,
      sakTitle: m.sak.title,
    })),
    overdueMilestones: overdueMilestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: m.dueDate,
      sakId: m.sak.id,
      sakTitle: m.sak.title,
    })),
    upcomingMilestones: upcomingMilestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: m.dueDate,
      sakId: m.sak.id,
      sakTitle: m.sak.title,
    })),
    recentSaker,
    activeAutomations: automationsCount,
    emailsThisWeek: pendingEmailLinks,
  });
});

/**
 * GET /reports/dashboard
 * Ett endepunkt → ett DB-treff (i stedet for å iterere alle saker fra frontend).
 */
router.get("/dashboard", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const period = (req.query.period as string) || "week";

  const now = new Date();
  let periodStart: Date;
  if (period === "month") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    periodStart = new Date(now.getFullYear(), q, 1);
  } else {
    // uke (mandag-basis)
    periodStart = new Date(now);
    const day = periodStart.getDay();
    const diff = day === 0 ? -6 : 1 - day; // søn=0 → -6, ellers 1 - day
    periodStart.setDate(periodStart.getDate() + diff);
    periodStart.setHours(0, 0, 0, 0);
  }

  // Hent alle entries i perioden for denne brukerens org
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { gte: periodStart },
      sak: { organizationId },
    },
    select: {
      sakId: true,
      durationSec: true,
      billable: true,
      hourlyRate: true,
      sak: { select: { id: true, title: true, client: { select: { name: true } } } },
    },
  });

  let totalSec = 0;
  let billableSec = 0;
  let totalAmount = 0;
  const perSak = new Map<
    string,
    { id: string; title: string; clientName: string | null; hours: number; amount: number }
  >();

  for (const e of entries) {
    totalSec += e.durationSec;
    if (e.billable) {
      billableSec += e.durationSec;
      if (e.hourlyRate) totalAmount += (e.durationSec / 3600) * e.hourlyRate;
    }
    if (e.sakId && e.sak) {
      const existing = perSak.get(e.sakId) || {
        id: e.sak.id,
        title: e.sak.title,
        clientName: e.sak.client?.name ?? null,
        hours: 0,
        amount: 0,
      };
      existing.hours += e.durationSec / 3600;
      if (e.billable && e.hourlyRate) {
        existing.amount += (e.durationSec / 3600) * e.hourlyRate;
      }
      perSak.set(e.sakId, existing);
    }
  }

  const topSaker = [...perSak.values()]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title,
      clientName: s.clientName,
      hours: Math.round(s.hours * 10) / 10,
      amount: Math.round(s.amount),
    }));

  return res.json({
    period,
    periodStart: periodStart.toISOString(),
    totalHours: Math.round((totalSec / 3600) * 10) / 10,
    billableHours: Math.round((billableSec / 3600) * 10) / 10,
    totalAmount: Math.round(totalAmount),
    entryCount: entries.length,
    topSaker,
  });
});

/**
 * GET /reports/month.csv?year=2026&month=5
 *   month er 1-12. CSV-en grupperer per sak + klient og inkluderer dato/varighet/beløp.
 */
router.get("/month.csv", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`, 10);
  const month = parseInt((req.query.month as string) || `${new Date().getMonth() + 1}`, 10);

  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    return res.status(400).json({ error: "Ugyldig år/måned" });
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { gte: start, lt: end },
      sak: { organizationId },
    },
    include: {
      sak: { select: { title: true, client: { select: { name: true } } } },
    },
    orderBy: [{ sakId: "asc" }, { startedAt: "asc" }],
  });

  const rows: string[] = [
    [
      "Dato",
      "Start",
      "Slutt",
      "Varighet (timer)",
      "Klient",
      "Prosjekt",
      "App / vindu",
      "Notat",
      "Fakturerbar",
      "Timesats",
      "Beløp",
    ].join(";"),
  ];

  let grandTotal = 0;

  for (const e of entries) {
    const hours = e.durationSec / 3600;
    const amount = e.billable && e.hourlyRate ? hours * e.hourlyRate : 0;
    grandTotal += amount;

    rows.push(
      [
        new Date(e.startedAt).toLocaleDateString("nb-NO"),
        new Date(e.startedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }),
        new Date(e.endedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }),
        hours.toFixed(2).replace(".", ","),
        csvEscape(e.sak?.client?.name || "(intern)"),
        csvEscape(e.sak?.title || "(ukjent sak)"),
        csvEscape(`${e.appName || ""} ${e.windowTitle || ""}`.trim()),
        csvEscape(e.note || ""),
        e.billable ? "Ja" : "Nei",
        e.hourlyRate ? `${e.hourlyRate} kr` : "",
        amount > 0 ? `${Math.round(amount)} kr` : "",
      ].join(";")
    );
  }

  rows.push("");
  rows.push(`;;;;;;;;;SUM TOTALT;${Math.round(grandTotal)} kr`);

  const filename = `sakspilot-tidsrapport-${year}-${String(month).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send("﻿" + rows.join("\r\n"));
});

function csvEscape(s: string): string {
  if (!s) return "";
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * POST /reports/pdf
 *   Body: { from: ISO-date, to: ISO-date, sakIds?: string[], includeNonBillable?: boolean }
 *
 *   Genererer en pent formatert PDF-tidsrapport for innlogget bruker innenfor
 *   gitt dato-vindu. Aggregeres:
 *     1) per sak (totale timer, fakturerbart, beløp)
 *     2) per dag (totale timer, fakturerbart)
 *     3) per app (topp 10, timer)
 *
 *   Returnerer PDF-binær med Content-Disposition: attachment;
 *   filnavn = tidsrapport-{from}-{to}.pdf
 */
const PdfBodySchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().date()),
  to: z.string().datetime({ offset: true }).or(z.string().date()),
  sakIds: z.array(z.string().min(1)).max(500).optional(),
  includeNonBillable: z.boolean().optional(),
});

function fmtDateNb(d: Date): string {
  return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtKrNb(n: number): string {
  return Math.round(n).toLocaleString("nb-NO") + " kr";
}

router.post("/pdf", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;

  const parsed = PdfBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig body", details: parsed.error.flatten() });
  }
  const { from, to, sakIds, includeNonBillable } = parsed.data;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "Ugyldig dato-format" });
  }
  if (toDate < fromDate) {
    return res.status(400).json({ error: "'to' må være etter 'from'" });
  }

  // Hent entries innenfor [from, to] for innlogget bruker, scoped til org.
  // Hvis sakIds er gitt, filtrer på dem (men fortsatt org-scoped via relasjonen).
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      startedAt: { gte: fromDate, lte: toDate },
      sak: { organizationId },
      ...(includeNonBillable ? {} : { billable: true }),
      ...(sakIds && sakIds.length > 0 ? { sakId: { in: sakIds } } : {}),
    },
    include: {
      sak: { select: { id: true, title: true, client: { select: { name: true } } } },
    },
    orderBy: { startedAt: "asc" },
  });

  // Hent brukernavn + org-navn for header
  const [user, organization] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  // ── Aggreger ──
  let grandSec = 0;
  let grandBillableSec = 0;
  let grandAmount = 0;

  type SakAgg = { id: string; title: string; clientName: string | null; totalSec: number; billableSec: number; amount: number };
  const perSak = new Map<string, SakAgg>();

  type DayAgg = { dateKey: string; date: Date; totalSec: number; billableSec: number };
  const perDay = new Map<string, DayAgg>();

  type AppAgg = { name: string; totalSec: number };
  const perApp = new Map<string, AppAgg>();

  for (const e of entries) {
    grandSec += e.durationSec;
    if (e.billable) {
      grandBillableSec += e.durationSec;
      if (e.hourlyRate) grandAmount += (e.durationSec / 3600) * e.hourlyRate;
    }

    // per sak (entries uten sak grupperes som "(ukjent sak)")
    const sakKey = e.sakId ?? "__no_sak__";
    const sakTitle = e.sak?.title ?? "(ukjent sak)";
    const clientName = e.sak?.client?.name ?? null;
    const sa = perSak.get(sakKey) ?? {
      id: sakKey,
      title: sakTitle,
      clientName,
      totalSec: 0,
      billableSec: 0,
      amount: 0,
    };
    sa.totalSec += e.durationSec;
    if (e.billable) {
      sa.billableSec += e.durationSec;
      if (e.hourlyRate) sa.amount += (e.durationSec / 3600) * e.hourlyRate;
    }
    perSak.set(sakKey, sa);

    // per dag (lokal tid for å matche brukerens forventning)
    const d = new Date(e.startedAt);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const da = perDay.get(dayKey) ?? {
      dateKey: dayKey,
      date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      totalSec: 0,
      billableSec: 0,
    };
    da.totalSec += e.durationSec;
    if (e.billable) da.billableSec += e.durationSec;
    perDay.set(dayKey, da);

    // per app
    const appName = (e.appName || "(ukjent app)").trim() || "(ukjent app)";
    const aa = perApp.get(appName) ?? { name: appName, totalSec: 0 };
    aa.totalSec += e.durationSec;
    perApp.set(appName, aa);
  }

  const sakRows = [...perSak.values()].sort((a, b) => b.totalSec - a.totalSec);
  const dayRows = [...perDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const appRows = [...perApp.values()].sort((a, b) => b.totalSec - a.totalSec).slice(0, 10);

  // ── Bygg PDF ──
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `Tidsrapport ${fmtDateNb(fromDate)}: ${fmtDateNb(toDate)}`,
      Author: organization?.name ?? "Sakspilot",
      Creator: "Sakspilot",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const leftX = 50;
  const rightX = 350;
  const tableRight = 545;

  // Header
  doc
    .fontSize(20)
    .fillColor("#172B4D")
    .text("Tidsrapport", leftX, 50);
  doc
    .fontSize(11)
    .fillColor("#5E6C84")
    .text("Sakspilot", leftX, doc.y + 2);

  doc
    .fontSize(10)
    .fillColor("#172B4D")
    .text(`Bruker: ${user?.name ?? user?.email ?? "(ukjent)"}`, rightX, 50, {
      width: tableRight - rightX,
      align: "right",
    });
  doc.text(
    `Periode: ${fmtDateNb(fromDate)}, ${fmtDateNb(toDate)}`,
    rightX,
    doc.y + 2,
    { width: tableRight - rightX, align: "right" }
  );
  if (organization?.name) {
    doc.text(organization.name, rightX, doc.y + 2, {
      width: tableRight - rightX,
      align: "right",
    });
  }

  let y = Math.max(doc.y, 110) + 16;

  // ── Sammendrag-blokk ──
  const grandHours = grandSec / 3600;
  const grandBillableHours = grandBillableSec / 3600;
  doc
    .moveTo(leftX, y)
    .lineTo(tableRight, y)
    .strokeColor("#E6E9EF")
    .stroke();
  y += 10;
  doc
    .fontSize(10)
    .fillColor("#5E6C84")
    .text(
      `Total tid: ${grandHours.toFixed(1)} t   ·   Fakturerbart: ${grandBillableHours.toFixed(1)} t   ·   Estimert beløp: ${fmtKrNb(grandAmount)}   ·   ${entries.length} entries`,
      leftX,
      y,
      { width: tableRight - leftX }
    );
  y = doc.y + 12;
  doc
    .moveTo(leftX, y)
    .lineTo(tableRight, y)
    .strokeColor("#E6E9EF")
    .stroke();
  y += 16;

  // Hjelper: legg til sideskift om vi nærmer oss bunnen
  function ensureSpace(needed: number) {
    if (y + needed > 780) {
      doc.addPage();
      y = 50;
    }
  }

  // ── Tabell 1: Per sak ──
  ensureSpace(60);
  doc
    .fontSize(13)
    .fillColor("#172B4D")
    .text("Per sak", leftX, y);
  y = doc.y + 6;

  const s_colSak = leftX;
  const s_colClient = 230;
  const s_colHours = 360;
  const s_colBillable = 420;
  const s_colAmount = 485;

  doc
    .fontSize(9)
    .fillColor("#5E6C84")
    .text("Prosjekt", s_colSak, y)
    .text("Klient", s_colClient, y)
    .text("Timer", s_colHours, y, { width: 55, align: "right" })
    .text("Fakt.bar", s_colBillable, y, { width: 60, align: "right" })
    .text("Beløp", s_colAmount, y, { width: tableRight - s_colAmount, align: "right" });
  y += 12;
  doc.moveTo(leftX, y).lineTo(tableRight, y).strokeColor("#E6E9EF").stroke();
  y += 6;

  if (sakRows.length === 0) {
    doc.fontSize(9).fillColor("#5E6C84").text("Ingen tidsregistreringer i perioden.", leftX, y);
    y = doc.y + 10;
  } else {
    doc.fontSize(9).fillColor("#172B4D");
    for (const s of sakRows) {
      ensureSpace(18);
      doc.fillColor("#172B4D");
      doc.text(s.title.slice(0, 40), s_colSak, y, { width: s_colClient - s_colSak - 6 });
      doc.fillColor("#5E6C84").text(
        (s.clientName ?? "(intern)").slice(0, 24),
        s_colClient,
        y,
        { width: s_colHours - s_colClient - 6 }
      );
      doc.fillColor("#172B4D");
      doc.text((s.totalSec / 3600).toFixed(1) + " t", s_colHours, y, { width: 55, align: "right" });
      doc.text((s.billableSec / 3600).toFixed(1) + " t", s_colBillable, y, { width: 60, align: "right" });
      doc.text(fmtKrNb(s.amount), s_colAmount, y, { width: tableRight - s_colAmount, align: "right" });
      y = Math.max(doc.y, y + 14);
    }
  }

  y += 18;

  // ── Tabell 2: Per dag ──
  ensureSpace(60);
  doc
    .fontSize(13)
    .fillColor("#172B4D")
    .text("Per dag", leftX, y);
  y = doc.y + 6;

  const d_colDate = leftX;
  const d_colTotal = 200;
  const d_colBillable = 320;

  doc
    .fontSize(9)
    .fillColor("#5E6C84")
    .text("Dato", d_colDate, y)
    .text("Totale timer", d_colTotal, y, { width: 100, align: "right" })
    .text("Fakturerbart", d_colBillable, y, { width: 120, align: "right" });
  y += 12;
  doc.moveTo(leftX, y).lineTo(tableRight, y).strokeColor("#E6E9EF").stroke();
  y += 6;

  if (dayRows.length === 0) {
    doc.fontSize(9).fillColor("#5E6C84").text("Ingen dager med tid i perioden.", leftX, y);
    y = doc.y + 10;
  } else {
    doc.fontSize(9).fillColor("#172B4D");
    for (const d of dayRows) {
      ensureSpace(16);
      doc.fillColor("#172B4D").text(fmtDateNb(d.date), d_colDate, y);
      doc.text((d.totalSec / 3600).toFixed(1) + " t", d_colTotal, y, { width: 100, align: "right" });
      doc.text((d.billableSec / 3600).toFixed(1) + " t", d_colBillable, y, { width: 120, align: "right" });
      y = Math.max(doc.y, y + 14);
    }
  }

  y += 18;

  // ── Tabell 3: Per app (topp 10) ──
  ensureSpace(60);
  doc
    .fontSize(13)
    .fillColor("#172B4D")
    .text("Per app (topp 10)", leftX, y);
  y = doc.y + 6;

  const a_colName = leftX;
  const a_colHours = 360;

  doc
    .fontSize(9)
    .fillColor("#5E6C84")
    .text("App", a_colName, y)
    .text("Timer", a_colHours, y, { width: tableRight - a_colHours, align: "right" });
  y += 12;
  doc.moveTo(leftX, y).lineTo(tableRight, y).strokeColor("#E6E9EF").stroke();
  y += 6;

  if (appRows.length === 0) {
    doc.fontSize(9).fillColor("#5E6C84").text("Ingen app-data i perioden.", leftX, y);
    y = doc.y + 10;
  } else {
    doc.fontSize(9).fillColor("#172B4D");
    for (const a of appRows) {
      ensureSpace(16);
      doc.fillColor("#172B4D").text(a.name.slice(0, 60), a_colName, y, {
        width: a_colHours - a_colName - 6,
      });
      doc.text((a.totalSec / 3600).toFixed(1) + " t", a_colHours, y, {
        width: tableRight - a_colHours,
        align: "right",
      });
      y = Math.max(doc.y, y + 14);
    }
  }

  // ── Footer (på siste side) ──
  const generatedAt = new Date();
  doc
    .fontSize(8)
    .fillColor("#8993A4")
    .text(
      `Generert ${fmtDateNb(generatedAt)} ${generatedAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}  ·  Sakspilot`,
      leftX,
      800,
      { width: tableRight - leftX, align: "center" }
    );

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", () => resolve()));
  const pdfBuffer = Buffer.concat(chunks);

  // Filnavn: bruk YYYY-MM-DD-segmenter
  const fromKey = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
  const toKey = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;
  const filename = `tidsrapport-${fromKey}-${toKey}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(pdfBuffer.length));
  return res.send(pdfBuffer);
});

export default router;
