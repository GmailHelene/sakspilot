/**
 * API-helper for Sakspilot frontend.
 *
 * Bruker Next.js sin rewrite (/api/* → http://localhost:8001/*) i dev.
 * I prod settes NEXT_PUBLIC_API_URL til Vercel-Edge-proxy som peker på
 * api.sakspilot.no. Cookie-en (httpOnly, satt av API) deles tilbake til
 * sakspilot.no via proxy — så `credentials: 'include'` er nok for auth.
 *
 * AUTH-STRATEGI (3. juni 2026 — XSS-fix):
 *   - JWT lagres KUN i httpOnly-cookie (ikke lesbar fra JavaScript)
 *   - localStorage lagrer en non-sensitive markør `sakspilot_authed: "1"`
 *     som vi sjekker SYNKRONT for å avgjøre om vi skal vise app eller
 *     redirecte til /login. Markøren har null verdi for en angriper —
 *     selv om XSS stjeler den, kan den ikke brukes til API-kall.
 *   - Vi sender IKKE lenger Authorization-header. Cookie tar over.
 *   - getToken() er beholdt som no-op for ABI-kompatibilitet (returnerer
 *     null) — gamle direkte-fetch-sites slutter å sende Bearer-header,
 *     men cookie får dem fortsatt gjennom auth-middleware.
 *
 * Migrasjon for eksisterende brukere: de har gammel `sakspilot_token`
 * i localStorage. Vår nye isTokenValid() ser ikke etter den, så de blir
 * sendt til /login én gang. Etter ny login: kun cookie + markør.
 */

const AUTHED_KEY = 'sakspilot_authed';
const LEGACY_TOKEN_KEY = 'sakspilot_token'; // ryddes ved første sjekk

/**
 * @deprecated Returnerer alltid null. JWT er ikke lenger tilgjengelig for JS.
 * Beholdt for at gamle direkte-fetch-sites kompilerer — de slutter bare å
 * sende Authorization-header, og cookie håndterer auth via credentials.
 */
export function getToken(): string | null {
  return null;
}

/**
 * Markerer brukeren som "innlogget" lokalt. Sendes truthy etter vellykket
 * login/register (vi ignorerer det faktiske token-feltet siden cookie er
 * satt av Set-Cookie-headeren i samme respons).
 */
export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  // Rydd opp gammel JWT-i-localStorage hvis den ligger igjen fra før fixen
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  if (token) localStorage.setItem(AUTHED_KEY, '1');
  else localStorage.removeItem(AUTHED_KEY);
}

/**
 * Synkron sjekk om brukeren ser ut til å være innlogget. Brukes til å
 * avgjøre redirect til /login eller initial render. Den ekte sannheten
 * ligger i serverside-cookien — første API-kall som returnerer 401 vil
 * rydde markøren via 401-handleren under.
 */
export function isTokenValid(): boolean {
  if (typeof window === 'undefined') return false;
  // Rydd opp legacy hvis den fortsatt ligger der (engangs-migrasjon)
  if (localStorage.getItem(LEGACY_TOKEN_KEY)) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return localStorage.getItem(AUTHED_KEY) === '1';
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Last ned en PDF (eller annen binær blob) fra et auth-beskyttet endpoint.
 *
 * Strategi: fetch med Bearer-header, motta blob, opprett midlertidig
 * objectURL og trigge anchor.click() for "Lagre som"-dialog. Vi kan ikke
 * bare bruke window.open() fordi det ikke sender Authorization-headeren.
 *
 * filename: hvis ikke gitt, leses fra Content-Disposition header.
 */
export async function downloadPdf(path: string, filename?: string): Promise<void> {
  // Cookie sendes via credentials: 'include' — ingen Bearer-header nødvendig
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new ApiError(`Nedlasting feilet (${res.status})`, res.status, txt);
  }
  const blob = await res.blob();

  // Fallback: hent filnavn fra Content-Disposition om vi ikke fikk det
  let fname = filename;
  if (!fname) {
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    fname = m?.[1] || 'rapport.pdf';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Frigjør blob etter litt — Chrome trenger objectURL aktiv mens download starter
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // Auth håndteres av httpOnly-cookien via credentials: 'include'.
  // Ingen Bearer-header — XSS skal ikke kunne tilegne seg auth-token.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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

    // 401 = token ugyldig. Tidligere logget vi ut ved enhver 401, men det
    // betydde at én bakgrunns-feil (timeout/proxy/etc) kastet brukeren ut.
    // Nå: bare auto-logout hvis 401 kommer fra /auth/me (den ENESTE pålitelige
    // session-sjekken). Andre endepunkter får bare throw — kallende side kan
    // bestemme hva som skal skje.
    //
    // Stale-state-fra-forrige-bruker-bug (årsaken vi opprinnelig la dette til
    // for) håndteres uansett av OnboardingModal sin user-id-sammenligning som
    // tømmer prefs ved bruker-switch.
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      path.startsWith('/auth/me')
    ) {
      const keys = [
        'sakspilot_token',   // legacy - XSS-fix 3/6
        'sakspilot_authed',
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
