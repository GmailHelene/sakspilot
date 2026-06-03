/**
 * MVA-lib unit-tester.
 *
 * Regnskaps-kritisk logikk. En feil her får sluttbruker til å betale eller
 * kreve inn feil MVA-beløp. Disse testene må passere før produksjons-utrulling.
 *
 * Norge har 4 MVA-satser:
 *   - 25 % (standard — varer/tjenester)
 *   - 15 % (mat/drikke til hjemmebruk)
 *   - 12 % (transport, hotell, kino)
 *   - 0 % (utenlands, helse, utdanning, bank — "fritak")
 */
import { describe, it, expect } from 'vitest';
import {
  calcMva,
  bucket,
  parsePeriode,
  periodeRange,
  emptyMvaSide,
  addToBucket,
} from '../lib/mva';

describe('calcMva — inklusiv MVA (hub-konvensjon)', () => {
  it('25 % MVA: 1250 kr inkl. → 250 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1250, 25, true);
    expect(mva).toBe(250);
    expect(netto).toBe(1000);
  });

  it('15 % MVA: 1150 kr inkl. → 150 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1150, 15, true);
    expect(mva).toBeCloseTo(150, 2);
    expect(netto).toBeCloseTo(1000, 2);
  });

  it('12 % MVA: 1120 kr inkl. → 120 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1120, 12, true);
    expect(mva).toBeCloseTo(120, 2);
    expect(netto).toBeCloseTo(1000, 2);
  });

  it('0 % MVA: 1000 kr inkl. → 0 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1000, 0, true);
    expect(mva).toBe(0);
    expect(netto).toBe(1000);
  });

  it('Avrunding: 1234.56 kr * 25/(100+25) = 246.912 MVA', () => {
    const { netto, mva } = calcMva(1234.56, 25, true);
    expect(mva).toBeCloseTo(246.912, 3);
    expect(netto).toBeCloseTo(987.648, 3);
  });
});

describe('calcMva — eksklusiv MVA (standard fakturering)', () => {
  it('25 % MVA: 1000 kr eks. → 250 MVA + 1000 netto (1250 total)', () => {
    const { netto, mva } = calcMva(1000, 25, false);
    expect(mva).toBe(250);
    expect(netto).toBe(1000);
  });

  it('15 % MVA: 1000 kr eks. → 150 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1000, 15, false);
    expect(mva).toBe(150);
    expect(netto).toBe(1000);
  });

  it('0 % MVA: 1000 kr eks. → 0 MVA + 1000 netto', () => {
    const { netto, mva } = calcMva(1000, 0, false);
    expect(mva).toBe(0);
    expect(netto).toBe(1000);
  });
});

describe('bucket — MVA-sats klassifisering', () => {
  it('klassifiserer kjente satser riktig', () => {
    expect(bucket(25)).toBe('25');
    expect(bucket(15)).toBe('15');
    expect(bucket(12)).toBe('12');
  });

  it('null/undefined/0/ukjente havner i fritak-bucket', () => {
    expect(bucket(0)).toBe('fritak');
    expect(bucket(null)).toBe('fritak');
    expect(bucket(undefined)).toBe('fritak');
    expect(bucket(7)).toBe('fritak');     // ikke en norsk sats
    expect(bucket(100)).toBe('fritak');   // umulig sats
  });
});

describe('parsePeriode', () => {
  it('aksepterer gyldige perioder', () => {
    expect(parsePeriode('Q1')).toBe('Q1');
    expect(parsePeriode('Q4')).toBe('Q4');
    expect(parsePeriode('H1')).toBe('H1');
    expect(parsePeriode('H2')).toBe('H2');
    expect(parsePeriode('year')).toBe('year');
  });

  it('defaulter til year ved ugyldig input', () => {
    expect(parsePeriode('')).toBe('year');
    expect(parsePeriode(undefined)).toBe('year');
    expect(parsePeriode('Q5')).toBe('year');
    expect(parsePeriode('Q')).toBe('year');
    expect(parsePeriode(['Q1', 'Q2'])).toBe('year');   // array
  });
});

describe('periodeRange', () => {
  it('Q1 2026 → 1.1 til 1.4', () => {
    const r = periodeRange(2026, 'Q1');
    expect(r.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(r.label).toBe('Q1 2026');
  });

  it('Q4 2026 → 1.10 til 1.1.2027', () => {
    const r = periodeRange(2026, 'Q4');
    expect(r.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(r.label).toBe('Q4 2026');
  });

  it('H1 2026 → 1.1 til 1.7', () => {
    const r = periodeRange(2026, 'H1');
    expect(r.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('year 2026 → 1.1 til 1.1.2027', () => {
    const r = periodeRange(2026, 'year');
    expect(r.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(r.label).toBe('2026');
  });
});

describe('addToBucket — aggregering av flere fakturaer', () => {
  it('25 % + 15 %: separerte buckets, totalt-summen er riktig', () => {
    const side = emptyMvaSide();
    addToBucket(side, 25, 1000, 250);   // 25%-bucket
    addToBucket(side, 15, 500, 75);     // 15%-bucket
    expect(side.pers25.grunnlag).toBe(1000);
    expect(side.pers25.mva).toBe(250);
    expect(side.pers15.grunnlag).toBe(500);
    expect(side.pers15.mva).toBe(75);
    expect(side.totalt).toBe(325);
  });

  it('null-sats havner i fritak-bucket', () => {
    const side = emptyMvaSide();
    addToBucket(side, null, 500, 0);
    expect(side.persFritak.grunnlag).toBe(500);
    expect(side.persFritak.mva).toBe(0);
    expect(side.totalt).toBe(0);
  });

  it('totalt-summen oppdateres riktig ved flere addToBucket', () => {
    const side = emptyMvaSide();
    addToBucket(side, 25, 100, 25);
    addToBucket(side, 25, 200, 50);
    addToBucket(side, 12, 100, 12);
    expect(side.pers25.grunnlag).toBe(300);
    expect(side.pers25.mva).toBe(75);
    expect(side.pers12.grunnlag).toBe(100);
    expect(side.pers12.mva).toBe(12);
    expect(side.totalt).toBe(87);
  });
});

describe('End-to-end MVA-rapport flyt', () => {
  it('Helenes typiske tilfelle: 3 fakturaer * 1200 inkl, MVA-rapport viser 720 utgående', () => {
    const utgaaende = emptyMvaSide();
    // Simulerer 3 fakturaer, hver 1200 kr inkl. 25 % MVA
    for (let i = 0; i < 3; i++) {
      const { netto, mva } = calcMva(1200, 25, true);
      addToBucket(utgaaende, 25, netto, mva);
    }
    expect(utgaaende.pers25.grunnlag).toBeCloseTo(2880, 2);  // 3 * 960
    expect(utgaaende.pers25.mva).toBeCloseTo(720, 2);        // 3 * 240
    expect(utgaaende.totalt).toBeCloseTo(720, 2);
  });

  it('Netto = utgående - inngående', () => {
    const utg = emptyMvaSide();
    const inn = emptyMvaSide();
    addToBucket(utg, 25, 10000, 2500);   // salg
    addToBucket(inn, 25, 4000, 1000);    // utgifter
    const netto = utg.totalt - inn.totalt;
    expect(netto).toBe(1500);             // skyldig Skatteetaten
  });
});
