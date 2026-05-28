/**
 * Reports-routes — aggregerte rapporter på tvers av saker.
 *
 *   GET /reports/dashboard?period=week|month|quarter
 *       — denne ukens/månedens/kvartalets timer + beløp + topp-saker
 *
 *   GET /reports/month.csv?year=2026&month=5
 *       — eksporter alle fakturerbare timer for én måned (alle saker)
 *         til CSV — ideelt grunnlag for månedlig faktura-batch.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

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
      "Sak",
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

export default router;
