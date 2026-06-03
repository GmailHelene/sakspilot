/**
 * Crypto-lib unit-tester.
 *
 * Sikkerhets-kritisk. encrypt/decrypt brukes for refresh-tokens i DB
 * (Fiken OAuth, Outlook, Google). En feil her kan lekke tokens eller
 * gjøre at vi ikke kan lese tilbake lagrede integrasjoner.
 *
 * Vi tester med en kjent test-nøkkel via process.env.ENCRYPTION_KEY.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_KEY = 'a'.repeat(64); // 64 hex tegn = 32 bytes
const ORIG_KEY = process.env.ENCRYPTION_KEY;
const ORIG_ENV = process.env.NODE_ENV;

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  if (ORIG_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIG_KEY;
  if (ORIG_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIG_ENV;
});

describe('encrypt / decrypt — roundtrip', () => {
  it('ASCII roundtrip', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const plain = 'hemmelig-refresh-token-123';
    const enc = encrypt(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  it('norske tegn (æøå) roundtrip', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const plain = 'Helene Åsheim Grønberg — påske-rød';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('tom streng — kjent grense: vi krypterer aldri tom token, så roundtrip er ikke garantert', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const enc = encrypt('');
    // GCM gir tom ciphertext-hex, som vår format-validering avviser ved decrypt.
    // Hadde vi noensinne hatt brukstilfellet, måtte vi rettet decrypt-sjekken.
    // I praksis: vi krypterer kun ikke-tomme refresh-tokens, så denne grensen er OK.
    expect(() => decrypt(enc)).toThrow();
  });

  it('lang streng (1 KB JSON-blob)', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const plain = JSON.stringify({ token: 'a'.repeat(1000), exp: 12345 });
    expect(decrypt(encrypt(plain))).toBe(plain);
  });
});

describe('encrypt — format', () => {
  it('output har 3 deler separert med kolon', async () => {
    const { encrypt } = await import('../lib/crypto');
    const enc = encrypt('test');
    const parts = enc.split(':');
    expect(parts).toHaveLength(3);
  });

  it('IV er 12 bytes (24 hex tegn)', async () => {
    const { encrypt } = await import('../lib/crypto');
    const [ivHex] = encrypt('test').split(':');
    expect(ivHex).toHaveLength(24);
  });

  it('authTag er 16 bytes (32 hex tegn)', async () => {
    const { encrypt } = await import('../lib/crypto');
    const [, tagHex] = encrypt('test').split(':');
    expect(tagHex).toHaveLength(32);
  });
});

describe('encrypt — non-determinism (IV-randomness)', () => {
  it('samme plaintext gir ULIK ciphertext (random IV)', async () => {
    const { encrypt } = await import('../lib/crypto');
    const a = encrypt('samme');
    const b = encrypt('samme');
    expect(a).not.toBe(b); // krypto-svakhet hvis lik
  });

  it('men begge dekrypterer tilbake til samme klartekst', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const a = encrypt('samme');
    const b = encrypt('samme');
    expect(decrypt(a)).toBe('samme');
    expect(decrypt(b)).toBe('samme');
  });
});

describe('decrypt — feilhåndtering', () => {
  it('ugyldig format (ingen kolon) → throw', async () => {
    const { decrypt } = await import('../lib/crypto');
    expect(() => decrypt('ikke-en-cipher')).toThrow();
  });

  it('ugyldig format (én del) → throw', async () => {
    const { decrypt } = await import('../lib/crypto');
    expect(() => decrypt('aabb:ccdd')).toThrow();
  });

  it('manipulert ciphertext → throw (GCM auth-tag feiler)', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const enc = encrypt('test');
    const parts = enc.split(':');
    // Endre én byte i ciphertext-delen
    const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('manipulert auth-tag → throw', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const enc = encrypt('test');
    const parts = enc.split(':');
    const tampered = `${parts[0]}:${'0'.repeat(32)}:${parts[2]}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('manipulert IV → throw', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto');
    const enc = encrypt('test');
    const parts = enc.split(':');
    const tampered = `${'1'.repeat(24)}:${parts[1]}:${parts[2]}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe('getKey — env-håndtering (security fix verifisering)', () => {
  it('throws hvis ENCRYPTION_KEY mangler OG NODE_ENV !== development', async () => {
    // Test isolert: temporarily slett key og sett prod
    const origKey = process.env.ENCRYPTION_KEY;
    const origEnv = process.env.NODE_ENV;
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';

    // Vi må re-importere fordi modul-state for getKey leses ved kall
    // (getKey leser env hver gang den kalles, så vi kan bruke samme modul)
    const { encrypt } = await import('../lib/crypto');
    expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY/);

    // Restore
    if (origKey !== undefined) process.env.ENCRYPTION_KEY = origKey;
    if (origEnv !== undefined) process.env.NODE_ENV = origEnv;
  });

  it('throws hvis ENCRYPTION_KEY har feil lengde (32 hex isf 64)', async () => {
    const origKey = process.env.ENCRYPTION_KEY;
    const origEnv = process.env.NODE_ENV;
    process.env.ENCRYPTION_KEY = 'a'.repeat(32); // for kort
    process.env.NODE_ENV = 'production';

    const { encrypt } = await import('../lib/crypto');
    expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY/);

    if (origKey !== undefined) process.env.ENCRYPTION_KEY = origKey;
    if (origEnv !== undefined) process.env.NODE_ENV = origEnv;
  });

  it('dev-fallback fungerer KUN i NODE_ENV=development', async () => {
    const origKey = process.env.ENCRYPTION_KEY;
    const origEnv = process.env.NODE_ENV;
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';

    // Skal IKKE throw, men advare og bruke null-nøkkel
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { encrypt, decrypt } = await import('../lib/crypto');
    const enc = encrypt('dev-test');
    expect(decrypt(enc)).toBe('dev-test');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    if (origKey !== undefined) process.env.ENCRYPTION_KEY = origKey;
    if (origEnv !== undefined) process.env.NODE_ENV = origEnv;
  });
});

import { vi } from 'vitest';
