/**
 * Notifications-hook + localStorage-håndtering for sidebar-badges.
 *
 * Strategi:
 *   - lastVisited[area] lagres i localStorage som ISO-timestamps
 *   - hook poller /notifications/counts hvert 30s og når brukeren manuelt
 *     trigger refresh (f.eks. etter en POST/PATCH)
 *   - Når brukeren besøker en side, kall markVisited(area) — det nullstiller
 *     badge for den fanen
 *
 * NB: dette synker IKKE på tvers av enheter. Hvis brukeren har sakspilot
 * åpent både i desktop-appen og i nettleseren, vil "ulest" telle separat.
 * For tverr-enhet-synk må vi flytte lastVisited til DB (NotificationView-
 * tabell) — kan gjøres senere uten å endre denne API-en.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';

const LS_KEY = 'sakspilot_last_visited';
const POLL_INTERVAL_MS = 30_000;

export type NotificationArea =
  | 'foresporsler'
  | 'saker'
  | 'fakturaer'
  | 'kalender'
  | 'klistrelapper'
  | 'team';

export interface AreaCount { total: number; unread: number }
export type NotificationCounts = Record<NotificationArea, AreaCount>;

interface CountsResponse {
  counts: NotificationCounts;
  serverTime: string;
}

function readLastVisited(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLastVisited(next: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Marker et område som besøkt nå. Badge for området nullstilles
 * ved neste poll (eller umiddelbart via lokal state).
 */
export function markVisited(area: NotificationArea) {
  const map = readLastVisited();
  map[area] = new Date().toISOString();
  writeLastVisited(map);
  // Trigger en custom event så useNotifications kan reagere uten å vente på poll
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sakspilot:notifications-visit', { detail: { area } }));
  }
}

/**
 * React-hook som returnerer { counts, refresh } for badge-rendring.
 *
 * Kjører automatisk:
 *   - første gang på mount
 *   - hver POLL_INTERVAL_MS
 *   - når window får fokus (bruker kom tilbake)
 *   - når markVisited() kalles (samme tab)
 */
export function useNotifications(): {
  counts: NotificationCounts | null;
  refresh: () => void;
} {
  const [counts, setCounts] = useState<NotificationCounts | null>(null);
  const aborter = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    // Avbryt evt forrige in-flight
    aborter.current?.abort();
    const ctrl = new AbortController();
    aborter.current = ctrl;

    const since = readLastVisited();
    // Bygg query: ?since[foresporsler]=ISO&since[saker]=ISO...
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(since)) {
      qs.append(`since[${k}]`, v);
    }
    try {
      const res = await api<CountsResponse>(`/notifications/counts?${qs}`, { signal: ctrl.signal });
      setCounts(res.counts);
    } catch (err) {
      // AbortError er forventet — ignorer
      if (err instanceof Error && err.name !== 'AbortError') {
        // Logg, men ikke krasj sidebar
        console.warn('[notifications] poll feilet:', err.message);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);

    const onFocus = () => refresh();
    const onVisit = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('sakspilot:notifications-visit', onVisit);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('sakspilot:notifications-visit', onVisit);
      aborter.current?.abort();
    };
  }, [refresh]);

  return { counts, refresh };
}
