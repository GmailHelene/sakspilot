/**
 * Faktura-summering unit-tester.
 *
 * Penger-kritisk. Feil her får sluttbruker til å fakturere feil beløp.
 * MÅ passere før prod-deploy.
 */
import { describe, it, expect } from 'vitest';
import { lineSum, totalsFromLines, roundOere } from '../lib/invoiceMath';

describe('roundOere — avrunding til øre', () => {
  it('runder 1.005 ned til 1 (banker-rounding er IKKE valgt — Math.round half-up)', () => {
    // Note: 1.005 representeres som 1.00499... i float, så Math.round gir 1.00
    expect(roundOere(1.005)).toBe(1);
  });

  it('1.234 → 1.23', () => {
    expect(roundOere(1.234)).toBe(1.23);
  });

  it('1.236 → 1.24', () => {
    expect(roundOere(1.236)).toBe(1.24);
  });

  it('100 → 100 (heltall uendret)', () => {
    expect(roundOere(100)).toBe(100);
  });

  it('negative tall avrundes også (kreditnota)', () => {
    expect(roundOere(-1.236)).toBe(-1.24);
  });

  it('0 → 0', () => {
    expect(roundOere(0)).toBe(0);
  });
});

describe('lineSum — beløp for én linje', () => {
  it('quantity * unitPrice når ingen pre-beregnet sum', () => {
    expect(lineSum({ quantity: 10, unitPrice: 150 })).toBe(1500);
  });

  it('foretrekker pre-beregnet sum hvis satt (rabatt-linje)', () => {
    // Linja sier "10 * 150 = 1500" men har rabatt → sum = 1200
    expect(lineSum({ quantity: 10, unitPrice: 150, sum: 1200 })).toBe(1200);
  });

  it('ignorerer sum=undefined (fallback til quantity * unitPrice)', () => {
    expect(lineSum({ quantity: 5, unitPrice: 100, sum: undefined })).toBe(500);
  });

  it('ignorerer sum=NaN (fallback til quantity * unitPrice)', () => {
    expect(lineSum({ quantity: 5, unitPrice: 100, sum: NaN })).toBe(500);
  });

  it('avrunder resultatet til øre', () => {
    // 3 timer * 333.33 kr/t = 999.99 (eksakt) — sjekker at vi ikke får 999.9899...
    expect(lineSum({ quantity: 3, unitPrice: 333.33 })).toBe(999.99);
  });

  it('negativ unitPrice for kreditnota-linjer', () => {
    expect(lineSum({ quantity: 1, unitPrice: -500 })).toBe(-500);
  });

  it('desimal-quantity (timer med min-presisjon)', () => {
    expect(lineSum({ quantity: 1.5, unitPrice: 800 })).toBe(1200);
  });

  it('sum=0 brukes hvis eksplisitt satt (fritak-linje på informasjon)', () => {
    expect(lineSum({ quantity: 1, unitPrice: 1000, sum: 0 })).toBe(0);
  });
});

describe('totalsFromLines — aggregert sum', () => {
  it('tom array → { totalAmount: 0, totalHours: 0 }', () => {
    expect(totalsFromLines([])).toEqual({ totalAmount: 0, totalHours: 0 });
  });

  it('én linje: 10 * 1000 → totalAmount 10000, totalHours 10', () => {
    expect(totalsFromLines([{ quantity: 10, unitPrice: 1000 }])).toEqual({
      totalAmount: 10000,
      totalHours: 10,
    });
  });

  it('tre linjer summeres riktig', () => {
    const lines = [
      { quantity: 8, unitPrice: 1000 },  // 8000
      { quantity: 2.5, unitPrice: 800 }, // 2000
      { quantity: 1, unitPrice: 500 },   // 500
    ];
    expect(totalsFromLines(lines)).toEqual({
      totalAmount: 10500,
      totalHours: 11.5,
    });
  });

  it('blandet pre-beregnet og automatisk sum', () => {
    const lines = [
      { quantity: 10, unitPrice: 100 },                 // 1000
      { quantity: 5, unitPrice: 200, sum: 800 },        // 800 (rabatt 200)
    ];
    expect(totalsFromLines(lines).totalAmount).toBe(1800);
  });

  it('akkumulert avrundings-feil unngås — 10x av 0.1', () => {
    // I JS: 0.1 + 0.1 + ... 10 ganger = 0.9999999999999999 (float-feil)
    // roundOere må håndtere dette per-linje OG på sluttsum
    const lines = Array(10).fill({ quantity: 1, unitPrice: 0.1 });
    expect(totalsFromLines(lines).totalAmount).toBe(1);
  });

  it('kreditnota: negativ linje reduserer total', () => {
    const lines = [
      { quantity: 1, unitPrice: 5000 },   // 5000
      { quantity: 1, unitPrice: -500 },   // -500 (kreditert returvarer)
    ];
    expect(totalsFromLines(lines).totalAmount).toBe(4500);
  });
});

describe('End-to-end: typisk Helene-faktura', () => {
  it('10t konsulent + 2t reise + 1 lisens = 21500', () => {
    const lines = [
      { description: '10t konsulent', quantity: 10, unitPrice: 1500 }, // 15000
      { description: 'Reisetid 2t',   quantity: 2,  unitPrice: 750 },  // 1500
      { description: 'Lisens 1 mnd',  quantity: 1,  unitPrice: 5000 }, // 5000
    ];
    expect(totalsFromLines(lines).totalAmount).toBe(21500);
  });
});
