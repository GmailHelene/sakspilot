/**
 * MVA-rapport — Norsk merverdiavgift-oversikt for selvangivelse.
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
 * Helene har mvaGrense: 50000 i settings — den brukes ikke her enda, men
 * kunne legges til som en advarsel hvis totalinntekt < grensen.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

type Periode = "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "year";

function parsePeriode(p?: string): Periode {
  if (p === "Q1" || p === "Q2" || p === "Q3" || p === "Q4" || p === "H1" || p === "H2") return p;
  return "year";
}

function periodeRange(year: number, periode: Periode): { start: Date; end: Date; label: string } {
  // Bruker Date utc — vi er ikke avhengig av timezone for periode-grenser
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  switch (periode) {
    case "Q1": return { start: utc(year, 0, 1),  end: utc(year, 3, 1),  label: `Q1 ${year}` };
    case "Q2": return { start: utc(year, 3, 1),  end: utc(year, 6, 1),  label: `Q2 ${year}` };
    case "Q3": return { start: utc(year, 6, 1),  end: utc(year, 9, 1),  label: `Q3 ${year}` };
    case "Q4": return { start: utc(year, 9, 1),  end: utc(year + 1, 0, 1), label: `Q4 ${year}` };
    case "H1": return { start: utc(year, 0, 1),  end: utc(year, 6, 1),  label: `H1 ${year}` };
    case "H2": return { start: utc(year, 6, 1),  end: utc(year + 1, 0, 1), label: `H2 ${year}` };
    default:   return { start: utc(year, 0, 1),  end: utc(year + 1, 0, 1), label: `${year}` };
  }
}

/**
 * Beregn MVA-beløp gitt grunnlag og sats.
 *   - Hvis "inkl": grunnlag inneholder MVA → mva = grunnlag * sats / (100 + sats)
 *                  netto = grunnlag - mva
 *   - Hvis "eks":  grunnlag er uten MVA → mva = grunnlag * sats / 100
 *                  netto = grunnlag (uendret)
 */
function calcMva(
  total: number,
  sats: number,
  inkludert: boolean
): { netto: number; mva: number } {
  if (sats === 0) return { netto: total, mva: 0 };
  if (inkludert) {
    const mva = (total * sats) / (100 + sats);
    return { netto: total - mva, mva };
  }
  return { netto: total, mva: (total * sats) / 100 };
}

// Bucketize sats — 25, 15, 12 mappet, alt annet til "fritak/0"
function bucket(sats: number | null): "25" | "15" | "12" | "fritak" {
  if (sats === 25) return "25";
  if (sats === 15) return "15";
  if (sats === 12) return "12";
  return "fritak";
}

interface SatsBucket { grunnlag: number; mva: number }
interface MvaSide { totalt: number; pers25: SatsBucket; pers15: SatsBucket; pers12: SatsBucket; persFritak: SatsBucket }

function emptySide(): MvaSide {
  return {
    totalt: 0,
    pers25: { grunnlag: 0, mva: 0 },
    pers15: { grunnlag: 0, mva: 0 },
    pers12: { grunnlag: 0, mva: 0 },
    persFritak: { grunnlag: 0, mva: 0 },
  };
}

function addToBucket(side: MvaSide, sats: number | null, netto: number, mva: number) {
  const b = bucket(sats);
  const target = b === "25" ? side.pers25 : b === "15" ? side.pers15 : b === "12" ? side.pers12 : side.persFritak;
  target.grunnlag += netto;
  target.mva += mva;
  side.totalt += mva;
}

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const periode = parsePeriode(req.query.periode as string);

  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Ugyldig år" });
  }

  const { start, end, label } = periodeRange(year, periode);

  // Hent fakturaer (eksporterte ELLER betalte — vi vil ikke ha utkast i MVA-rapport)
  // og utgifter for perioden
  const [invoices, utgifter, org] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["exported", "draft"] },  // inkludér drafts også — frilanseren ser dem og kan velge
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
  const utgaaende = emptySide();
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
    warnings.push(`${invoicesMissingMva} faktura(er) mangler eksplisitt MVA-sats — antar 25 %.`);
  }

  // Bygg inngående MVA (utgifter)
  const inngaaende = emptySide();
  let utgifterMissingMva = 0;
  for (const u of utgifter) {
    const total = Number(u.belopInkMva);
    if (u.mvaSats === null) {
      utgifterMissingMva++;
      // Uten sats kan vi ikke beregne fradrag — fall tilbake til null-sats (ingen MVA)
      addToBucket(inngaaende, null, total, 0);
      continue;
    }
    // Utgifter er ALLTID inkl. MVA (det er det vi har betalt)
    const { netto, mva } = calcMva(total, u.mvaSats, true);
    addToBucket(inngaaende, u.mvaSats, netto, mva);
  }
  if (utgifterMissingMva > 0) {
    warnings.push(`${utgifterMissingMva} utgift(er) mangler MVA-sats — får ikke fradrag.`);
  }

  // Netto: utgående MINUS inngående. Positiv = du skylder, negativ = du får tilbake
  const nettoAaBetale = utgaaende.totalt - inngaaende.totalt;

  // Hvis status=draft inkludert: marker det i warnings
  const draftInvoices = invoices.filter((i) => i.status === "draft").length;
  if (draftInvoices > 0) {
    warnings.push(`${draftInvoices} faktura(er) er fortsatt utkast — inkludert i beregning men ikke endelig.`);
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
