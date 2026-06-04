/**
 * Cached /auth/me-henter.
 *
 * Bakgrunn (tilbakemelding 4. juni 2026):
 *   1. Headeren viste kort "Logg inn"-state for innloggede brukere mens
 *      /auth/me var i flight. Brukeren saa et flicker fra utlogget til
 *      innlogget paa hver navigasjon.
 *   2. /auth/me ble kalt 10+ ganger per okt fordi flere komponenter
 *      (Header, OnboardingModal, AppLayout, Sidebar, .) hver hentet
 *      brukeren uavhengig av hverandre.
 *
 * Loesning:
 *   - In-memory cache + in-flight promise-dedup. Andre kall i samme
 *     "tick" pa siden gjenbruker resultatet.
 *   - sessionStorage som persistens. Overlever interne navigasjoner
 *     (Next.js SPA-routing) og kan brukes synkront i Header-rendring
 *     for aa unngaa flicker.
 *   - TTL paa 60 sek i in-memory, 5 minutter i sessionStorage.
 *     Korte nok til at endring i organisasjonsnavn/profile fanges opp,
 *     lange nok til at vi unngaar hagleskudd-henting.
 */

import { api, isTokenValid } from './api';

export interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationName: string;
  organizationPlan: string;
}

const CACHE_KEY = 'sakspilot_me_cache';
const MEMORY_TTL_MS = 60_000;
const STORAGE_TTL_MS = 5 * 60_000;

interface CachedEntry {
  me: Me;
  cachedAt: number;
}

let memoryCache: CachedEntry | null = null;
let inFlight: Promise<Me | null> | null = null;

/**
 * Sjekker sessionStorage synkront. Returnerer null hvis cache mangler
 * eller er eldre enn STORAGE_TTL_MS. Trygt aa kalle paa client og
 * server (SSR returnerer null).
 */
export function readCachedMe(): Me | null {
  if (typeof window === 'undefined') return null;
  // Foretrekk memory som er ferskest
  if (memoryCache && Date.now() - memoryCache.cachedAt < MEMORY_TTL_MS) {
    return memoryCache.me;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedEntry;
    if (Date.now() - entry.cachedAt > STORAGE_TTL_MS) return null;
    memoryCache = entry; // promoter til memory for raskere neste kall
    return entry.me;
  } catch {
    return null;
  }
}

function persist(me: Me) {
  const entry: CachedEntry = { me, cachedAt: Date.now() };
  memoryCache = entry;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Kan feile ved private browsing eller full quota. Vi har memory som backup.
    }
  }
}

/**
 * Henter /auth/me. Returnerer cached verdi hvis tilgjengelig OG fersk.
 * Hvis et annet kall allerede er i flight, gjenbruker vi det promise-t.
 *
 * Returnerer null hvis bruker ikke er innlogget eller /auth/me feiler.
 * Kasterer aldri.
 */
export async function fetchMe(): Promise<Me | null> {
  if (typeof window !== 'undefined' && !isTokenValid()) {
    // Ingen vits aa kalle endpoint hvis vi vet at vi er utlogget
    clearCachedMe();
    return null;
  }

  const cached = readCachedMe();
  if (cached) return cached;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const me = await api<Me>('/auth/me');
      persist(me);
      return me;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Tom cache ved logout eller token-bytte. Forhindrer at en stale Me
 * hentes etter logout.
 */
export function clearCachedMe(): void {
  memoryCache = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  }
}
