/**
 * MVA-rapport, Norsk merverdiavgift-oversikt for selvangivelse.
 *
 *   GET /mva-rapport?year=YYYY&periode=Q1|Q2|Q3|Q4|H1|H2|year
 *     → JSON med utgående MVA (på inntekter), inngående MVA (på utgifter),
 *       per sats, netto å betale/få igjen.
 *
 *   Output:
 *     {
 *       periode: "Q2 2026",
 *       periodeStart: "2026-04-01",
 *       periodeSlutt: "2026-06-30",
 *       utgaaendeMva: {        // MVA vi har krevd inn fra kunder
 *         totalt: 4500,
 *         pers25: { grunnlag: 18000, mva: 4500 },
 *         pers15: { grunnlag: 0, mva: 0 },
 *         pers12: { grunnlag: 0, mva: 0 },
 *         persFritak: { grunnlag: 0, mva: 0 }
 *       },
 *       inngaaendeMva: {       // MVA på utgifter vi kan trekke fra
 *         totalt: 1200,
 *         pers25: { grunnlag: 4800, mva: 1200 }
 *       },
 *       nettoAaBetale: 3300,   // til Skatteetaten (positiv = vi skylder)
 *       antallFakturaer: 5,
 *       antallUtgifter: 8,
 *       warnings: [...]        // f.eks. "3 fakturaer mangler MVA-sats"
 *     }
 *
 * Norske regler oppsummert:
 *   - Standardsats: 25 %
 *   - Reduserte satser: 15 % (mat/drikke), 12 % (transport, hotell, kino)
 *   - 0 %: utenlands, fritak (helse, utdanning, bank)
 *   - MVA-grense: 50 000 kr/år omsetning. Under = ikke MVA-pliktig
 *   - Rapporteringsfrekvens: kvartalsvis (de fleste frilansere) eller bimåned (større)
 *
 * Helene har mvaGrense: 50000 i settings, den brukes ikke her enda, men
 * kunne legges til som en advarsel hvis totalinntekt < grensen.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import {
  parsePeriode, periodeRange, calcMva, addToBucket, emptyMvaSide,
} from "../lib/mva";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const periode = parsePeriode(req.query.periode as string);

  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Ugyldig år" });
  }

  const { start, end, label } = periodeRange(year, periode);

  // Hent fakturaer (eksporterte ELLER betalte, vi vil ikke ha utkast i MVA-rapport)
  // og utgifter for perioden
  const [invoices, utgifter, org] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["exported", "draft"] },  // inkludér drafts også - frilanseren ser dem og kan velge
        periodEnd: { gte: start, lt: end },
      },
      select: {
        id: true, invoiceNumber: true, periodEnd: true, totalAmount: true,
        mvaSats: true, mvaInkludert: true, status: true, paidAt: true,
      },
    }),
    prisma.utgift.findMany({
      where: { organizationId, dato: { gte: start, lt: end } },
      select: {
        id: true, dato: true, beskrivelse: true, belopInkMva: true,
        mvaSats: true, kategori: true, leverandor: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, orgNumber: true },
    }),
  ]);

  // Bygg utgående MVA (inntekter)
  const utgaaende = emptyMvaSide();
  const warnings: string[] = [];
  let invoicesMissingMva = 0;

  for (const inv of invoices) {
    const total = Number(inv.totalAmount);
    const sats = inv.mvaSats ?? 25;        // Fallback til standard hvis null
    if (inv.mvaSats === null) invoicesMissingMva++;
    const { netto, mva } = calcMva(total, sats, inv.mvaInkludert);
    addToBucket(utgaaende, sats, netto, mva);
  }
  if (invoicesMissingMva > 0) {
    warnings.push(`${invoicesMissingMva} faktura(er) mangler eksplisitt MVA-sats - antar 25 %.`);
  }

  // Bygg inngående MVA (utgifter)
  const inngaaende = emptyMvaSide();
  let utgifterMissingMva = 0;
  for (const u of utgifter) {
    const total = Number(u.belopInkMva);
    if (u.mvaSats === null) {
      utgifterMissingMva++;
      // Uten sats kan vi ikke beregne fradrag, fall tilbake til null-sats (ingen MVA)
      addToBucket(inngaaende, null, total, 0);
      continue;
    }
    // Utgifter er ALLTID inkl. MVA (det er det vi har betalt)
    const { netto, mva } = calcMva(total, u.mvaSats, true);
    addToBucket(inngaaende, u.mvaSats, netto, mva);
  }
  if (utgifterMissingMva > 0) {
    warnings.push(`${utgifterMissingMva} utgift(er) mangler MVA-sats - får ikke fradrag.`);
  }

  // Netto: utgående MINUS inngående. Positiv = du skylder, negativ = du får tilbake
  const nettoAaBetale = utgaaende.totalt - inngaaende.totalt;

  // Hvis status=draft inkludert: marker det i warnings
  const draftInvoices = invoices.filter((i) => i.status === "draft").length;
  if (draftInvoices > 0) {
    warnings.push(`${draftInvoices} faktura(er) er fortsatt utkast - inkludert i beregning men ikke endelig.`);
  }

  return res.json({
    organisasjon: { name: org?.name || "", orgNumber: org?.orgNumber || null },
    periode: label,
    periodeStart: start.toISOString().slice(0, 10),
    periodeSlutt: new Date(end.getTime() - 86400000).toISOString().slice(0, 10),  // siste dag i perioden
    utgaaendeMva: utgaaende,
    inngaaendeMva: inngaaende,
    nettoAaBetale: Math.round(nettoAaBetale * 100) / 100,
    antallFakturaer: invoices.length,
    antallUtgifter: utgifter.length,
    fakturaer: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      dato: i.periodEnd.toISOString().slice(0, 10),
      total: Number(i.totalAmount),
      mvaSats: i.mvaSats,
      mvaInkludert: i.mvaInkludert,
      status: i.status,
    })),
    utgifter: utgifter.map((u) => ({
      id: u.id,
      dato: u.dato.toISOString().slice(0, 10),
      beskrivelse: u.beskrivelse,
      belop: Number(u.belopInkMva),
      mvaSats: u.mvaSats,
      kategori: u.kategori,
      leverandor: u.leverandor,
    })),
    warnings,
  });
});

export default router;
