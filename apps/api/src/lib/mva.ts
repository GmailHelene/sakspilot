/**
 * MVA-beregnings-utils, delt mellom mvaRapport.ts (JSON) og
 * pdfReports.ts (/pdf-reports/mva).
 *
 * Tidligere hadde begge routes egen kopi av samme algoritme, det
 * førte til risiko for at de divergerer hvis bare den ene oppdateres.
 */

export type MvaSatsKey = "25" | "15" | "12" | "fritak";

export interface SatsBucket {
  grunnlag: number;
  mva: number;
}

export interface MvaSide {
  totalt: number;
  pers25: SatsBucket;
  pers15: SatsBucket;
  pers12: SatsBucket;
  persFritak: SatsBucket;
}

export type Periode = "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "year";

/**
 * Validér og normaliser periode-string fra request.
 * Default = "year" hvis ugyldig.
 */
export function parsePeriode(p?: string | string[] | undefined): Periode {
  if (typeof p !== "string") return "year";
  if (p === "Q1" || p === "Q2" || p === "Q3" || p === "Q4" || p === "H1" || p === "H2") return p;
  return "year";
}

/**
 * Periode-grenser for et gitt år. Bruker UTC for å unngå timezone-bugs.
 */
export function periodeRange(year: number, periode: Periode): { start: Date; end: Date; label: string } {
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
 * Beregn MVA-beløp gitt totalbeløp, sats og om MVA er inkludert i totalen.
 *   - Hvis "inkl": grunnlag inneholder MVA → mva = total * sats / (100 + sats)
 *                  netto = total - mva
 *   - Hvis "eks":  grunnlag er uten MVA → mva = total * sats / 100
 *                  netto = total (uendret)
 */
export function calcMva(
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

/**
 * Bucketize sats, 25 / 15 / 12 mappet direkte, alt annet (inkl. null) → "fritak".
 */
export function bucket(sats: number | null | undefined): MvaSatsKey {
  if (sats === 25) return "25";
  if (sats === 15) return "15";
  if (sats === 12) return "12";
  return "fritak";
}

export function emptyMvaSide(): MvaSide {
  return {
    totalt: 0,
    pers25: { grunnlag: 0, mva: 0 },
    pers15: { grunnlag: 0, mva: 0 },
    pers12: { grunnlag: 0, mva: 0 },
    persFritak: { grunnlag: 0, mva: 0 },
  };
}

export function addToBucket(side: MvaSide, sats: number | null | undefined, netto: number, mva: number) {
  const b = bucket(sats);
  const target = b === "25" ? side.pers25 : b === "15" ? side.pers15 : b === "12" ? side.pers12 : side.persFritak;
  target.grunnlag += netto;
  target.mva += mva;
  side.totalt += mva;
}
