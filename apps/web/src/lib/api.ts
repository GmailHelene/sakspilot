/**
 * API-helper for Sakspilot frontend.
 *
 * Bruker Next.js sin rewrite (/api/* → http://localhost:8001/*) i dev.
 * I prod settes NEXT_PUBLIC_API_URL til Railway-URL.
 *
 * JWT lagres i localStorage som fallback når httpOnly-cookie ikke kan deles
 * cross-site (samme strategi som ByggPilot).
 */

const TOKEN_KEY = 'sakspilot_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    // JWT-payload er base64url-kodet midt-del — vi sjekker exp uten å verifisere signatur
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      setToken(null);
      return false;
    }
    return true;
  } catch {
    setToken(null);
    return false;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
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

    // 401 = token er ugyldig (utløpt, revokert, bruker slettet, tokenVersion bumpet).
    // Tøm ALT lokalt så cached UI ikke viser data fra forrige bruker, og redirect
    // til /login. Uten dette ender vi opp med å vise stale state fra forrige sesjon.
    if (res.status === 401 && typeof window !== 'undefined') {
      const keys = [
        'sakspilot_token',
        'sakspilot_active_user',
        'sakspilot_onboarded',
        'sakspilot_profession',
        'sakspilot_launcher_apps',
        'sakspilot_shortcuts',
        'sakspilot_folder_shortcuts',
        'sakspilot_my_sites',
        'sakspilot_hidden_nav',
        'sakspilot_hjem_hidden_widgets',
      ];
      for (const k of keys) localStorage.removeItem(k);
      // Unngå loop hvis vi allerede er på login/registrer/glemt-passord
      const here = window.location.pathname;
      const publicPaths = ['/login', '/registrer', '/glemt-passord', '/reset-passord', '/', '/priser', '/personvern'];
      if (!publicPaths.some((p) => here === p || here.startsWith(p + '/'))) {
        window.location.href = '/login';
      }
    }

    throw new ApiError(
      errData?.error || `Forespørsel feilet (${res.status})`,
      res.status,
      errData?.details
    );
  }

  return data as T;
}
