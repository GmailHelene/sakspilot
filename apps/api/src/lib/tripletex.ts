/**
 * Tripletex API-helper — direkte v2-integrasjon via Partner Consumer Token.
 *
 * Autentiserings-flyt (avviker fra Fiken sin enklere PAT-modell):
 *
 *   1. Sakspilot har én ConsumerToken globalt (TRIPLETEX_CONSUMER_TOKEN i env).
 *      Den ble utstedt av Tripletex da vi fikk Partner-status.
 *   2. Hver kunde-admin genererer en EmployeeToken inne i SIN Tripletex
 *      (Innstillinger → API-tilgang). Vi lagrer den kryptert per organisasjon.
 *   3. Når vi skal kalle API-et: PUT /token/session/:create med
 *      ?consumerToken=<vår>&employeeToken=<kundens>&expirationDate=<i morgen>
 *      → vi får en SessionToken med ca 1-times levetid.
 *   4. SessionToken brukes som HTTP Basic auth: user=0, password=<sessionToken>.
 *      Vi cacher den per orgId i prosess-minnet for å unngå å bygge en ny
 *      session ved hvert API-kall.
 *
 * Cache-strategien er bevisst process-lokal (ikke Redis): SessionTokens er
 * korte uansett, og worst case er at en ny instance må gjøre ett ekstra
 * /token/session/:create-kall ved oppstart. Ved fail-over er det fortsatt
 * billig (én ekstra HTTP-roundtrip).
 *
 * SessionToken-utløp håndteres ved at vi alltid sjekker `expiresAt` med en
 * 5-minutters sikkerhetsmargin før vi gjenbruker. Hvis Tripletex revokerer
 * en SessionToken før utløp (lite sannsynlig), får første API-kall 401 og
 * caller må håndtere det (eller vi kan bygge en retry her — foreløpig
 * propagerer vi feilen oppover).
 *
 * Endepunkter brukt:
 *   - PUT  /v2/token/session/:create  — bygg SessionToken
 *   - GET  /v2/company                — verifiser + hent navn
 *   - GET  /v2/token/session/whoAmI   — hent employee-info
 *   - POST /v2/timesheet/entry        — push én timeoppføring
 *   - POST /v2/invoice                — opprett fakturadraft
 *
 * Docs: https://tripletex.no/v2-docs/
 */

const PROD_API_URL = process.env.TRIPLETEX_API_URL || "https://tripletex.no/v2";
const TEST_API_URL = "https://api-test.tripletex.tech/v2";

function getApiUrl(useTestEnv: boolean): string {
  return useTestEnv ? TEST_API_URL : PROD_API_URL;
}

/**
 * Test-miljøet til Tripletex har EGEN consumer token, separat fra prod.
 * Hver org velger om de vil bruke test- eller prod-miljø via useTestEnv-
 * flagget på TripletexIntegration. Vi henter riktig token basert på det.
 *
 * Env-vars:
 *   TRIPLETEX_CONSUMER_TOKEN       — prod (fra partner-godkjenning)
 *   TRIPLETEX_TEST_CONSUMER_TOKEN  — test (fra api-test.tripletex.tech)
 */
function getConsumerToken(useTestEnv: boolean): string {
  if (useTestEnv) {
    const t = process.env.TRIPLETEX_TEST_CONSUMER_TOKEN;
    if (!t) {
      throw new Error(
        "TRIPLETEX_TEST_CONSUMER_TOKEN mangler i env. Sett den på Render " +
          "med Consumer Token fra api-test.tripletex.tech (test-konto), eller " +
          "skru av 'Bruk test-miljø' i /innstillinger/tripletex for å bruke prod."
      );
    }
    return t;
  }
  const t = process.env.TRIPLETEX_CONSUMER_TOKEN;
  if (!t) {
    throw new Error(
      "TRIPLETEX_CONSUMER_TOKEN mangler i env — be Helene sette den på Render."
    );
  }
  return t;
}

// ── Session-token-cache (process-lokal) ─────────────────────────

interface SessionTokenCache {
  token: string;
  expiresAt: number; // ms-epoch
}

const sessionCache = new Map<string, SessionTokenCache>();
const SESSION_BUFFER_MS = 5 * 60 * 1000; // gjenbruk ikke hvis utløper innen 5 min

/**
 * Tøm cachen for én organisasjon — kalles ved disconnect og token-rotasjon.
 */
export function clearSessionCache(orgId: string): void {
  sessionCache.delete(orgId);
}

/**
 * Hent en gyldig SessionToken for org. Bygger en ny mot Tripletex hvis
 * cache er tom/utløpt. Returnerer Basic-auth-header-verdien (ferdig base64).
 */
export async function getSessionToken(
  orgId: string,
  employeeToken: string,
  useTestEnv: boolean
): Promise<string> {
  const cached = sessionCache.get(orgId);
  if (cached && cached.expiresAt > Date.now() + SESSION_BUFFER_MS) {
    return cached.token;
  }

  const apiUrl = getApiUrl(useTestEnv);
  const consumerToken = getConsumerToken(useTestEnv);

  // Tripletex' session-create vil ha expirationDate som YYYY-MM-DD.
  // Vi ber om gyldighet til i morgen — Tripletex gir en token med ca 1
  // times faktisk levetid uavhengig av dette feltet, men API-et krever
  // datoen og avviser fortid.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const url = new URL(`${apiUrl}/token/session/:create`);
  url.searchParams.set("consumerToken", consumerToken);
  url.searchParams.set("employeeToken", employeeToken);
  url.searchParams.set("expirationDate", tomorrow);

  const res = await fetch(url.toString(), { method: "PUT" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TripletexError(
      `Kunne ikke bygge SessionToken (${res.status}): ${text.slice(0, 300) || res.statusText}`,
      res.status
    );
  }

  const data = (await res.json()) as {
    value?: { token?: string; expirationDate?: string };
  };
  const token = data.value?.token;
  if (!token) {
    throw new TripletexError(
      "Tripletex returnerte ingen SessionToken i responsen",
      502
    );
  }

  // Cache ~50 min (Tripletex-tokens varer typisk 60 min — vi konservativt
  // antar 50 min uten å parse expirationDate, det er en dato-streng).
  const expiresAt = Date.now() + 50 * 60 * 1000;
  sessionCache.set(orgId, { token, expiresAt });
  return token;
}

// ── Lavnivå fetch-helper ────────────────────────────────────────

export class TripletexError extends Error {
  status: number;
  body?: string;
  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "TripletexError";
    this.status = status;
    this.body = body;
  }
}

interface TripletexFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function tripletexFetch<T>(
  orgId: string,
  employeeToken: string,
  useTestEnv: boolean,
  path: string,
  opts: TripletexFetchOptions = {}
): Promise<T> {
  const sessionToken = await getSessionToken(orgId, employeeToken, useTestEnv);
  const apiUrl = getApiUrl(useTestEnv);

  const url = new URL(`${apiUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  // Tripletex bruker HTTP Basic: user "0" + SessionToken som passord
  const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    // SessionToken ble revokert eller har utløpt tidligere enn ventet.
    // Drop cachen så neste forsøk bygger en ny.
    clearSessionCache(orgId);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TripletexError(
      `Tripletex ${opts.method || "GET"} ${path} feilet (${res.status})`,
      res.status,
      text.slice(0, 1000)
    );
  }

  // DELETE returnerer ofte 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return (await res.json()) as T;
}

// ── Verifisering ────────────────────────────────────────────────

export interface VerifyResult {
  companyId: number;
  companyName: string;
  employeeId: number;
  employeeName: string;
}

/**
 * Verifiser at en EmployeeToken er gyldig + hent company/employee-info.
 * Bruker midlertidig orgId="verify-<random>" for cache så det ikke kolliderer.
 */
export async function verifyEmployeeToken(
  employeeToken: string,
  useTestEnv: boolean
): Promise<VerifyResult> {
  const tempOrgId = `verify-${Math.random().toString(36).slice(2)}`;
  try {
    // 1. whoAmI gir oss employee-id + companyId
    const whoAmI = await tripletexFetch<{
      value: {
        employeeId: number;
        companyId: number;
      };
    }>(tempOrgId, employeeToken, useTestEnv, "/token/session/whoAmI");

    const employeeId = whoAmI.value.employeeId;
    const companyId = whoAmI.value.companyId;

    // 2. Hent firmanavn
    const company = await tripletexFetch<{
      value: { id: number; name: string };
    }>(tempOrgId, employeeToken, useTestEnv, "/company");

    // 3. Hent employee-navn
    const employee = await tripletexFetch<{
      value: { id: number; firstName: string; lastName: string };
    }>(tempOrgId, employeeToken, useTestEnv, `/employee/${employeeId}`);

    return {
      companyId,
      companyName: company.value.name,
      employeeId,
      employeeName: `${employee.value.firstName} ${employee.value.lastName}`.trim(),
    };
  } finally {
    clearSessionCache(tempOrgId);
  }
}

// ── Push: én faktura-draft fra sak ──────────────────────────────

export interface CreateInvoiceParams {
  /// Tripletex customer (kunde) ID — må eksistere i Tripletex på forhånd.
  /// Hvis null, prøver vi å finne/opprette basert på navn + epost.
  customerId?: number;
  /// Klient-info brukt til oppslag/opprettelse hvis customerId mangler
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientOrgNumber?: string | null;
  /// Fakturalinje
  description: string;
  hours: number;
  hourlyRate: number;
  /// Hvilken dato fakturaen skal dateres til (YYYY-MM-DD). Default i dag.
  invoiceDate?: string;
  /// Antall dager forfall etter invoiceDate. Default 14.
  daysUntilDue?: number;
}

export interface InvoiceResult {
  invoiceId: number;
  invoiceNumber?: string;
  viewUrl: string;
  customerId: number;
  amount: number;
}

/**
 * Opprett en fakturadraft i Tripletex.
 *
 * MVP-strategi: én faktura med én linje, "Tjeneste — X timer × Y kr/t".
 * Hvis customerId ikke er gitt: prøv å finne kunde basert på orgnr/epost,
 * ellers opprett ny.
 */
export async function createInvoiceDraft(
  orgId: string,
  employeeToken: string,
  useTestEnv: boolean,
  params: CreateInvoiceParams
): Promise<InvoiceResult> {
  let customerId = params.customerId;

  // ── Customer-oppslag/-opprettelse ───────────────────────────────
  if (!customerId) {
    // 1. Forsøk å matche på orgnummer hvis det finnes (mest pålitelig)
    if (params.clientOrgNumber) {
      try {
        const search = await tripletexFetch<{
          values: Array<{ id: number; name: string; organizationNumber?: string }>;
        }>(orgId, employeeToken, useTestEnv, "/customer", {
          query: { organizationNumber: params.clientOrgNumber, count: 1 },
        });
        if (search.values && search.values.length > 0) {
          customerId = search.values[0].id;
        }
      } catch {
        // ignorer søk-feil — vi prøver å opprette
      }
    }

    // 2. Forsøk å matche på epost
    if (!customerId && params.clientEmail) {
      try {
        const search = await tripletexFetch<{
          values: Array<{ id: number; name: string; email?: string }>;
        }>(orgId, employeeToken, useTestEnv, "/customer", {
          query: { email: params.clientEmail, count: 1 },
        });
        if (search.values && search.values.length > 0) {
          customerId = search.values[0].id;
        }
      } catch {
        // ignorer
      }
    }

    // 3. Opprett ny kunde hvis fortsatt ikke funnet
    if (!customerId) {
      const created = await tripletexFetch<{
        value: { id: number };
      }>(orgId, employeeToken, useTestEnv, "/customer", {
        method: "POST",
        body: {
          name: params.clientName,
          email: params.clientEmail || undefined,
          phoneNumber: params.clientPhone || undefined,
          organizationNumber: params.clientOrgNumber || undefined,
          isCustomer: true,
          isSupplier: false,
        },
      });
      customerId = created.value.id;
    }
  }

  if (!customerId) {
    throw new TripletexError(
      "Klarte ikke å finne eller opprette kunde i Tripletex",
      502
    );
  }

  // ── Bygg fakturadraft ───────────────────────────────────────────
  const invoiceDate =
    params.invoiceDate || new Date().toISOString().slice(0, 10);
  const daysUntilDue = params.daysUntilDue ?? 14;
  const dueDate = new Date(
    new Date(invoiceDate).getTime() + daysUntilDue * 86_400_000
  )
    .toISOString()
    .slice(0, 10);

  const amount = Math.round(params.hours * params.hourlyRate);

  const invoiceBody = {
    invoiceDate,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    isCreditNote: false,
    // Linjene må sendes som "orders" → "orderlines" i Tripletex' modell.
    // For å unngå å måtte slå opp produkt/konto bruker vi "freeText" på
    // linjenivå. Brukeren kan justere alt i Tripletex' GUI før utsending.
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description: params.description,
            count: params.hours,
            unitPriceExcludingVatCurrency: params.hourlyRate,
          },
        ],
      },
    ],
  };

  const created = await tripletexFetch<{
    value: { id: number; invoiceNumber?: string };
  }>(orgId, employeeToken, useTestEnv, "/invoice", {
    method: "POST",
    body: invoiceBody,
  });

  const invoiceId = created.value.id;
  const baseUrl = useTestEnv
    ? "https://api-test.tripletex.tech"
    : "https://tripletex.no";

  return {
    invoiceId,
    invoiceNumber: created.value.invoiceNumber,
    customerId,
    amount,
    viewUrl: `${baseUrl}/execute/invoiceMenu?invoiceId=${invoiceId}`,
  };
}

// ── Push: én timesheet-entry ────────────────────────────────────

export interface TimesheetEntryParams {
  /// YYYY-MM-DD
  date: string;
  /// Antall timer (1.5 = 1t 30min)
  hours: number;
  /// Tripletex aktivitet-id — påkrevd. Brukeren bør kunne velge "default"
  /// i innstillinger; foreløpig: caller må slå opp og sende inn.
  activityId: number;
  /// Tripletex prosjekt-id — valgfri men anbefalt
  projectId?: number;
  /// Fritekst-kommentar (vises i Tripletex-timelisten)
  comment?: string;
  /// Tripletex employee-id (brukes til å attribuere timen til riktig ansatt).
  /// Default: employee-id fra integrasjonen som ble registrert ved connect.
  employeeId: number;
}

/**
 * Push én timeoppføring til Tripletex.
 *
 * Tripletex krever at både `activity` og `employee` peker på eksisterende
 * id-er. Hvis vi ikke har dem, må brukeren konfigurere det først — vi gir
 * en tydelig feilmelding via TripletexError.
 */
export async function pushTimesheetEntry(
  orgId: string,
  employeeToken: string,
  useTestEnv: boolean,
  params: TimesheetEntryParams
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    date: params.date,
    hours: params.hours,
    employee: { id: params.employeeId },
    activity: { id: params.activityId },
    comment: params.comment || undefined,
  };
  if (params.projectId) {
    body.project = { id: params.projectId };
  }

  const res = await tripletexFetch<{
    value: { id: number };
  }>(orgId, employeeToken, useTestEnv, "/timesheet/entry", {
    method: "POST",
    body,
  });

  return { id: res.value.id };
}
