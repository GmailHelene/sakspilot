/**
 * Faktura-linjer (Invoice.lineItems) lagres som Json-felt i Postgres.
 * Det betyr at Prisma IKKE validerer shape ved read, frontend/PDF-kode
 * forutsetter at hver linje har { description, quantity, unitPrice, sum? }.
 *
 * Hvis vi har skrevet feil shape (gjennom direkte SQL, manuell DB-redigering,
 * eller en eldre versjon av koden), kan PDF-generering krasje med
 * "Cannot read property 'description' of undefined".
 *
 * Denne lib-en gir én sannhetskilde for line-item-shape og en safe-parser
 * som returnerer tom array istedenfor å throw hvis JSON-en er korrupt.
 */
import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  sum: z.number().optional(),
});

export const LineItemsArraySchema = z.array(LineItemSchema);

export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * Parser raw Json-verdi fra Invoice.lineItems trygt. Hvis form-en er
 * ulovlig (ikke array, eller en linje mangler felter), returnerer vi
 * tom array OG logger advarsel, slik at PDF-en fortsatt rendres
 * (med fallback-linje basert på totaler) i stedet for å krasje.
 *
 * Brukes ved READ (PDF-generering, send-email). Ved WRITE (POST /invoices)
 * brukes CreateInvoiceSchema.LineItemSchema som er strengere (Zod throw).
 */
export function safeParseLineItems(raw: unknown): LineItem[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    console.warn("[lineItems] forventet array, fikk:", typeof raw);
    return [];
  }
  const parsed = LineItemsArraySchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[lineItems] validation feilet - bruker fallback. Feil:",
      parsed.error.flatten()
    );
    return [];
  }
  return parsed.data;
}
