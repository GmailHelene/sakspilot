/**
 * Microsoft Graph-integrasjon — OAuth + e-postsynk.
 *
 * Konfigurasjon (Render env-vars):
 *   AZURE_CLIENT_ID       — Application (client) ID fra Azure AD
 *   AZURE_CLIENT_SECRET   — Client secret (verdien, ikke ID-en)
 *   AZURE_REDIRECT_URI    — https://api.sakspilot.no/oauth/microsoft/callback
 *
 * Scopes: offline_access (refresh token) + Mail.Read + User.Read
 *
 * Multi-tenant: bruker /common/ endepunkt så både Microsoft 365-jobb-
 * kontoer og personlige Outlook.com-kontoer kan kobles til.
 */
import prisma from "../lib/prisma";
import { encrypt, decrypt } from "../lib/crypto";

const SCOPES = ["offline_access", "Mail.Read", "User.Read"];
const AUTHORITY = "https://login.microsoftonline.com/common";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface AzureConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): AzureConfig | null {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const redirectUri =
    process.env.AZURE_REDIRECT_URI ||
    "https://api.sakspilot.no/oauth/microsoft/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isMicrosoftConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Genererer URL brukeren sendes til for å gi tillatelse.
 * `state` skal være en CSRF-token vi senere validerer ved callback.
 */
export function buildAuthUrl(state: string): string {
  const cfg = getConfig();
  if (!cfg) throw new Error("Microsoft Graph er ikke konfigurert");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

/**
 * Bytte authorization-code mot access + refresh-token.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Microsoft Graph er ikke konfigurert");

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token-exchange feilet: ${res.status} ${err.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Bruk refresh-token til å hente nytt access-token.
 * Oppdaterer DB med ny refresh-token hvis Azure returnerer det (rotasjon).
 */
async function refreshAccessToken(graphAccountId: string): Promise<string> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Microsoft Graph er ikke konfigurert");

  const account = await prisma.graphAccount.findUnique({ where: { id: graphAccountId } });
  if (!account) throw new Error("GraphAccount ikke funnet");

  const refreshToken = decrypt(account.refreshToken);

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Refresh feilet: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as TokenResponse;

  // Lagre ny refresh-token hvis Azure roterte den
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await prisma.graphAccount.update({
      where: { id: graphAccountId },
      data: {
        refreshToken: encrypt(data.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });
  } else {
    await prisma.graphAccount.update({
      where: { id: graphAccountId },
      data: { accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) },
    });
  }

  return data.access_token;
}

interface GraphMessage {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: { emailAddress: { address: string; name?: string } }[];
  conversationId?: string;
}

/**
 * Hent siste e-poster for én bruker.
 * `since` filtrerer på `receivedDateTime ge ...` (ISO 8601).
 */
async function fetchMessages(
  graphAccountId: string,
  since?: Date
): Promise<GraphMessage[]> {
  const accessToken = await refreshAccessToken(graphAccountId);

  const sinceFilter = since
    ? `&$filter=receivedDateTime ge ${since.toISOString()}`
    : "";
  const url =
    `${GRAPH_BASE}/me/messages?` +
    `$top=50&$orderby=receivedDateTime desc&` +
    `$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients,conversationId` +
    sinceFilter;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph fetch feilet: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { value: GraphMessage[] };
  return data.value;
}

/**
 * Synk e-poster for én bruker — kobler dem til saker via:
 *   1. Klient-epost-match: hvis e-postavsender matcher en klient.contactEmail,
 *      knytt e-posten til klientens nyeste aktive sak
 *   2. Subject-match: hvis emnet inneholder en saks-tittel
 */
export async function syncMessagesForAccount(graphAccountId: string): Promise<{
  fetched: number;
  linked: number;
}> {
  const account = await prisma.graphAccount.findUnique({
    where: { id: graphAccountId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!account) throw new Error("GraphAccount ikke funnet");

  const since = account.lastSyncAt || new Date(Date.now() - 30 * 86400000);
  const messages = await fetchMessages(graphAccountId, since);

  // Hent klienter med email + aktive saker — for matching
  const clients = await prisma.client.findMany({
    where: { organizationId: account.user.organizationId, contactEmail: { not: null } },
    select: {
      contactEmail: true,
      saker: {
        where: { archived: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, title: true },
      },
    },
  });

  const clientEmailToSakId = new Map<string, string>();
  for (const c of clients) {
    if (c.contactEmail && c.saker[0]) {
      clientEmailToSakId.set(c.contactEmail.toLowerCase(), c.saker[0].id);
    }
  }

  // Hent alle aktive saker for subject-matching
  const allSaker = await prisma.sak.findMany({
    where: { organizationId: account.user.organizationId, archived: false },
    select: { id: true, title: true },
  });

  let linked = 0;
  for (const msg of messages) {
    const fromEmail = msg.from?.emailAddress.address.toLowerCase() || "";
    const subject = msg.subject || "";

    let sakId: string | null = clientEmailToSakId.get(fromEmail) || null;
    if (!sakId) {
      // Prøv subject-matching
      for (const sak of allSaker) {
        if (subject.toLowerCase().includes(sak.title.toLowerCase())) {
          sakId = sak.id;
          break;
        }
      }
    }

    if (!sakId) continue;

    // Sjekk om vi allerede har denne meldingen
    const existing = await prisma.emailLink.findUnique({
      where: { graphMessageId: msg.id },
    });
    if (existing) continue;

    await prisma.emailLink.create({
      data: {
        sakId,
        graphMessageId: msg.id,
        fromAddress: msg.from?.emailAddress.address || "(ukjent)",
        toAddresses:
          msg.toRecipients?.map((r) => r.emailAddress.address).join(", ") || null,
        subject: msg.subject,
        receivedAt: new Date(msg.receivedDateTime),
        bodyPreview: msg.bodyPreview,
      },
    });
    linked++;
  }

  await prisma.graphAccount.update({
    where: { id: graphAccountId },
    data: { lastSyncAt: new Date() },
  });

  return { fetched: messages.length, linked };
}

/**
 * Hent og lagre brukerinfo ved første kobling.
 */
export async function fetchUserProfile(
  accessToken: string
): Promise<{ id: string; mail: string; userPrincipalName: string }> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=id,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Profil-henting feilet: ${res.status}`);
  }
  return (await res.json()) as { id: string; mail: string; userPrincipalName: string };
}
