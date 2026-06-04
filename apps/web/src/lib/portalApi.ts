/**
 * API-helper for klient-portalen.
 *
 * Helt separat fra lib/api.ts (frilanserens auth), bruker egen
 * localStorage-nøkkel slik at en frilanser og en klient kan dele
 * nettleser uten å overskrive hverandres token.
 *
 * Token: lagres som 'sakspilot_portal_token' og sendes via
 * Authorization: Bearer-header. Backend (requireClientAuth) krever
 * scope=client i JWT-payload.
 */

const PORTAL_TOKEN_KEY = 'sakspilot_portal_token';

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(PORTAL_TOKEN_KEY, token);
  else localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export function isPortalTokenValid(): boolean {
  const token = getPortalToken();
  if (!token) return false;
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (payload.scope !== 'client') {
      setPortalToken(null);
      return false;
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      setPortalToken(null);
      return false;
    }
    return true;
  } catch {
    setPortalToken(null);
    return false;
  }
}

interface PortalApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export class PortalApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function portalApi<T = unknown>(
  path: string,
  options: PortalApiOptions = {}
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const token = getPortalToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    // Vi sender IKKE credentials her, User-cookien skal ikke krysse over.
    // Klient-portalen identifiseres utelukkende via Bearer-tokenet.
    credentials: 'omit',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  let data: unknown = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const errData = data as { error?: string; details?: unknown } | null;
    // 401 på /client-portal/me = token utløpt/revokert → tøm + redirect login
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      path.startsWith('/client-portal/me')
    ) {
      setPortalToken(null);
      const here = window.location.pathname;
      const publicPaths = [
        '/portal/login',
        '/portal/accept-invite',
        '/portal/glemt-passord',
        '/portal/reset-passord',
      ];
      if (!publicPaths.some((p) => here === p || here.startsWith(p + '/'))) {
        window.location.href = '/portal/login';
      }
    }
    throw new PortalApiError(
      errData?.error || `Forespørsel feilet (${res.status})`,
      res.status,
      errData?.details
    );
  }

  return data as T;
}
