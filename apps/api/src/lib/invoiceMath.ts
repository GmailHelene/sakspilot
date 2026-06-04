/**
 * Faktura-summering, én sannhetskilde.
 *
 * Tidligere ble `quantity * unitPrice`-formelen inlined på fire steder i
 * invoices.ts (linje 204, 227, 452, 679). Funket, men hver kopi er en
 * potensiell divergens hvis vi senere innfører avrunding, valuta-konvertering
 * eller rabattlinjer.
 *
 * Denne lib-en sentraliserer:
 *   - lineSum(li)          , beløp for én linje (foretrekker pre-beregnet `sum`)
 *   - totalsFromLines(lis) , { totalAmount, totalHours } for hele fakturaen
 *   - roundOere(n)         , avrunding til nærmeste øre (2 desimaler)
 *
 * IKKE inkludert: MVA-beregning. Den ligger i mva.ts (egen domene-lib for
 * regnskaps-pliktig MVA-rapportering, krever egne tester per sats).
 */

export interface InvoiceLineLike {
  quantity: number;
  unitPrice: number;
  /** Pre-beregnet sum hvis tilgjengelig (lagret i lineItems-JSON i DB) */
  sum?: number;
}

/**
 * Avrund til nærmeste øre (2 desimaler) for å unngå float-drift.
 * Norske fakturaer rapporteres alltid i hele kroner + 2 desimaler.
 */
export function roundOere(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Beløp for én linje.
 *
 * Konvensjon: hvis linja har en eksplisitt `sum` brukes den (kreditnota med
 * manuell justering, rabattlinjer, etc). Ellers beregnes quantity * unitPrice.
 *
 * Returnerer alltid avrundet til øre, ingen float-drift i sluttsummer.
 */
export function lineSum(li: InvoiceLineLike): number {
  if (typeof li.sum === "number" && Number.isFinite(li.sum)) {
    return roundOere(li.sum);
  }
  return roundOere(li.quantity * li.unitPrice);
}

/**
 * Aggregert sum for alle linjer pluss antall enheter (kan tolkes som timer).
 * Brukes ved invoice.create for å sette totalAmount + totalHours.
 */
export function totalsFromLines(lineItems: InvoiceLineLike[]): {
  totalAmount: number;
  totalHours: number;
} {
  let totalAmount = 0;
  let totalHours = 0;
  for (const li of lineItems) {
    totalAmount += lineSum(li);
    totalHours += li.quantity;
  }
  return {
    totalAmount: roundOere(totalAmount),
    totalHours: roundOere(totalHours),
  };
}
