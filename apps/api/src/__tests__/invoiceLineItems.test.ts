/**
 * Line-item safe-parser unit-tester.
 *
 * Når lineItems leses ut av DB (Postgres Json) er ikke shape garantert
 *, feil her får PDF-generering eller email-bygging til å krasje med
 * "Cannot read property of undefined". Safe-parseren skal alltid returnere
 * en gyldig array (evt. tom) og ALDRI kaste.
 */
import { describe, it, expect, vi } from 'vitest';
import { safeParseLineItems, LineItemSchema, LineItemsArraySchema } from '../lib/invoiceLineItems';

describe('safeParseLineItems, happy path', () => {
  it('aksepterer gyldig array med fulle felter', () => {
    const raw = [
      { description: '10t', quantity: 10, unitPrice: 1500, sum: 15000 },
    ];
    const out = safeParseLineItems(raw);
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe('10t');
    expect(out[0].sum).toBe(15000);
  });

  it('aksepterer linjer uten sum (optional)', () => {
    const raw = [{ description: 'reise', quantity: 1, unitPrice: 500 }];
    const out = safeParseLineItems(raw);
    expect(out).toHaveLength(1);
    expect(out[0].sum).toBeUndefined();
  });

  it('aksepterer tom array', () => {
    expect(safeParseLineItems([])).toEqual([]);
  });
});

describe('safeParseLineItems, defensive fallback', () => {
  it('null → tom array (ikke throw)', () => {
    expect(safeParseLineItems(null)).toEqual([]);
  });

  it('undefined → tom array', () => {
    expect(safeParseLineItems(undefined)).toEqual([]);
  });

  it('string isf array → tom array + console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safeParseLineItems('ikke en array')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('object isf array → tom array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(safeParseLineItems({ description: 'x', quantity: 1, unitPrice: 1 })).toEqual([]);
    warn.mockRestore();
  });

  it('array med ugyldig element → tom array (alt-eller-ingenting per shape-kontrakt)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = [
      { description: 'ok', quantity: 1, unitPrice: 100 },
      { description: 'mangler felter' }, // ugyldig
    ];
    expect(safeParseLineItems(raw)).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('array med feil type på felt → tom array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = [{ description: 'x', quantity: '10', unitPrice: 100 }]; // quantity er string
    expect(safeParseLineItems(raw)).toEqual([]);
    warn.mockRestore();
  });

  it('throw ALDRI, selv på dypt absurd input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => safeParseLineItems(42)).not.toThrow();
    expect(() => safeParseLineItems(true)).not.toThrow();
    expect(() => safeParseLineItems(() => 'fn')).not.toThrow();
    expect(() => safeParseLineItems(new Date())).not.toThrow();
    warn.mockRestore();
  });
});

describe('LineItemSchema, direkte Zod-bruk (POST /invoices write-path)', () => {
  it('aksepterer gyldig linje', () => {
    const r = LineItemSchema.safeParse({ description: 'x', quantity: 1, unitPrice: 100 });
    expect(r.success).toBe(true);
  });

  it('avviser linje uten description', () => {
    const r = LineItemSchema.safeParse({ quantity: 1, unitPrice: 100 });
    expect(r.success).toBe(false);
  });

  it('avviser quantity som string', () => {
    const r = LineItemSchema.safeParse({ description: 'x', quantity: '1', unitPrice: 100 });
    expect(r.success).toBe(false);
  });
});

describe('LineItemsArraySchema', () => {
  it('aksepterer multi-linje array', () => {
    const r = LineItemsArraySchema.safeParse([
      { description: 'a', quantity: 1, unitPrice: 100 },
      { description: 'b', quantity: 2, unitPrice: 200, sum: 400 },
    ]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(2);
  });

  it('avviser hvis ett element er ugyldig', () => {
    const r = LineItemsArraySchema.safeParse([
      { description: 'a', quantity: 1, unitPrice: 100 },
      { description: 'b' }, // mangler quantity + unitPrice
    ]);
    expect(r.success).toBe(false);
  });
});
