/**
 * Epost-utsendelse via Brevo (Sendinblue).
 *
 * To metoder støttet, sjekkes i prioritert rekkefølge:
 *
 *   1. Brevo HTTPS API (anbefalt, fungerer på Render Free-tier):
 *        BREVO_API_KEY  , fra Brevo → SMTP & API → API Keys
 *        EMAIL_FROM     , verifisert avsender
 *
 *   2. SMTP-relay via nodemailer (krever utgående 587, IKKE på Render Free):
 *        SMTP_HOST      , smtp-relay.brevo.com
 *        SMTP_PORT      , 587
 *        SMTP_USER      , Brevo SMTP-bruker
 *        SMTP_PASS      , Brevo SMTP-key
 *        EMAIL_FROM     , verifisert avsender
 *
 * Render Free-tier blokkerer utgående SMTP (porter 25/465/587) for å
 * forhindre spam. Bruk Brevo API-metoden, den går over port 443 (HTTPS).
 *
 * Hvis ingen er satt: sendEmail() returnerer { ok: false } men krasjer ikke.
 * Logger STUB-melding for debugging.
 */
import nodemailer, { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;
let _checkedConfig = false;

function getTransporter(): Transporter | null {
  if (_checkedConfig) return _transporter;
  _checkedConfig = true;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      "[email] SMTP ikke konfigurert (mangler SMTP_HOST/USER/PASS). " +
        "E-poster vil ikke sendes - bare logges. Sett env-vars på Render."
    );
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
    // Aggresive timeouts, uten dette kan nodemailer henge i 60+ sekunder
    // hvis SMTP_HOST er feil eller porten er blokkert. Med 15 sek failer
    // vi raskt og kan vise brukbar feilmelding i UI.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  return _transporter;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Valgfri CC-mottaker(e). Komma-separert eller string-array. */
  cc?: string | string[];
  /**
   * Filvedlegg. content kan være Buffer (binær) eller string (tekst).
   * filename vises som vedleggsnavn i mottakers innboks.
   * contentType er valgfritt, nodemailer gjetter fra filendelse hvis null.
   */
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface EmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  // Foretrekk Brevo HTTPS API hvis nøkkel er satt, fungerer på Render Free
  // (port 443 blokkeres ikke). Fallback til SMTP for bakoverkompatibilitet.
  if (process.env.BREVO_API_KEY) {
    return sendViaBrevoApi(msg);
  }

  const t = getTransporter();
  if (!t) {
    console.log(`[email] STUB - ville sendt til ${msg.to}: ${msg.subject}`);
    return { ok: false, error: "Verken BREVO_API_KEY eller SMTP_HOST er satt - epost ikke sendt" };
  }

  const from = process.env.EMAIL_FROM || "noreply@sakspilot.no";

  try {
    const info = await t.sendMail({
      from,
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject,
      html: msg.html,
      text: msg.text || stripHtml(msg.html),
      attachments: msg.attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] send feilet:", err);
    // Vis litt mer kontekst i error-strengen så bruker forstår
    // hva som faktisk gikk galt (timeout, auth, ukjent host, osv.)
    let msg = err instanceof Error ? err.message : "Ukjent SMTP-feil";
    if (err && typeof err === "object" && "code" in err) {
      // nodemailer/Node.js feilkoder: ETIMEDOUT, ECONNREFUSED, EAUTH, etc.
      msg = `[${(err as { code: string }).code}] ${msg}`;
    }
    return { ok: false, error: msg };
  }
}

/**
 * Send epost via Brevo Transactional Email API.
 *
 * Bruker fetch direkte mot https://api.brevo.com/v3/smtp/email, ingen
 * SDK trengs. Header: `api-key: <BREVO_API_KEY>`.
 *
 * Fordeler over SMTP:
 *   - Fungerer på Render Free-tier (port 443 blokkeres ikke)
 *   - Returnerer JSON med messageId + feilbeskjed
 *   - Ingen STARTTLS-rare som kan timeout uten ren feil
 *   - Innebygd 10 sek timeout via AbortController
 *
 * Vedlegg: base64-encoded content + filename. Vi sender Buffer.toString('base64').
 */
async function sendViaBrevoApi(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY!;
  const fromEmail = process.env.EMAIL_FROM || "noreply@sakspilot.no";
  const fromName = process.env.EMAIL_FROM_NAME || "Sakspilot";

  // Bygg CC-array hvis satt (Brevo støtter både string + array)
  const ccArr: Array<{ email: string }> = [];
  if (msg.cc) {
    const ccList = typeof msg.cc === "string" ? msg.cc.split(",") : msg.cc;
    for (const e of ccList) {
      const trimmed = e.trim();
      if (trimmed) ccArr.push({ email: trimmed });
    }
  }

  // Vedlegg: Brevo godtar { name, content (base64) }
  const attachment = (msg.attachments || []).map((a) => ({
    name: a.filename,
    content: Buffer.isBuffer(a.content)
      ? a.content.toString("base64")
      : Buffer.from(a.content, "utf-8").toString("base64"),
  }));

  const payload: Record<string, unknown> = {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: msg.to }],
    subject: msg.subject,
    htmlContent: msg.html,
    textContent: msg.text || stripHtml(msg.html),
  };
  if (ccArr.length > 0) payload.cc = ccArr;
  if (attachment.length > 0) payload.attachment = attachment;

  // 10 sek timeout med AbortController så vi ikke henger evig hvis
  // Brevo har problemer.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (res.status === 201 || res.status === 200) {
      const data = (await res.json().catch(() => null)) as { messageId?: string } | null;
      return { ok: true, messageId: data?.messageId };
    }

    // Brevo returnerer { code, message } ved feil. Pakk det ut for kvalitets-feilmelding.
    const errText = await res.text().catch(() => "");
    let parsedMsg = errText;
    try {
      const errJson = JSON.parse(errText) as { code?: string; message?: string };
      parsedMsg = `${errJson.code || "brevo_error"}: ${errJson.message || errText}`;
    } catch {}
    console.error(`[email] Brevo API ${res.status}:`, parsedMsg);
    return { ok: false, error: `[Brevo ${res.status}] ${parsedMsg}` };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[email] Brevo API timeout (10s)");
      return { ok: false, error: "Brevo API svarte ikke innen 10 sek" };
    }
    console.error("[email] Brevo API call feilet:", err);
    return {
      ok: false,
      error: err instanceof Error ? `[fetch] ${err.message}` : "Ukjent feil ved Brevo API-kall",
    };
  }
}

// Enkel HTML→tekst-fallback for plaintext-versjon
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n\s+\n/g, "\n\n")
    .trim();
}

// ──────────────────────────────────────────────────────────────
// Pre-bygde mal-funksjoner (gjenbrukes i auth.ts m.m.)
// ──────────────────────────────────────────────────────────────

// Felles wrapper for HTML-e-poster, navy/lyse-grå tema som matcher
// passwordResetEmail. Brukes av onboarding-drip-templates nedenfor.
function baseEmailLayout(innerHtml: string): string {
  return `
    <!DOCTYPE html>
    <html lang="nb">
    <body style="margin:0;padding:40px 20px;background:#F8F9FB;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#172B4D;">
      <table style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(23,43,77,0.08);">
        <tr><td>
          ${innerHtml}
          <hr style="border:none;border-top:1px solid #E6E9EF;margin:24px 0;" />
          <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0;">
            - Sakspilot · <a href="https://sakspilot.no" style="color:#1F1F1F;">sakspilot.no</a>
          </p>
        </td></tr>
      </table>
    </body></html>
  `;
}

// Minimal user-shape onboarding-templates trenger. Holder typingen løs så vi
// slipper sirkulær import fra prisma-klient-typer her.
export interface OnboardingUser {
  email: string;
  name: string;
}

/**
 * Dag 0, velkomst-e-post, sendes umiddelbart etter vellykket registrering
 * i POST /auth/register.
 */
export function welcomeEmail(user: OnboardingUser): EmailMessage {
  const firstName = user.name.split(" ")[0] || user.name;
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Velkommen til Sakspilot, ${firstName}!</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hyggelig å ha deg med. Sakspilot er et arbeidsrom for deg som er selvstendig
      næringsdrivende - prosjekter, kanban, timer, kalender og automatiseringer på ett sted.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      <strong>Slik kommer du i gang:</strong>
    </p>
    <ol style="font-size:14px;line-height:1.7;color:#5E6C84;margin:0 0 20px 20px;padding:0;">
      <li>Logg inn på <a href="https://sakspilot.no" style="color:#1F1F1F;">sakspilot.no</a> og opprett ditt første prosjekt.</li>
      <li>Last ned <strong>Windows-appen</strong> - den registrerer arbeidstid automatisk i bakgrunnen mens du jobber.</li>
      <li>Sett opp en agent (f.eks. "Påminn meg 3 dager før frist") fra Agenter-menyen.</li>
    </ol>
    <p style="margin:0 0 24px 0;">
      <a href="https://sakspilot.no/last-ned" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Last ned Windows-appen</a>
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:0;">
      Spørsmål? Bare svar på denne e-posten - den går rett til meg.
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:8px 0 0 0;">
      - Helene, Sakspilot
    </p>
  `;
  return {
    to: user.email,
    subject: "Velkommen til Sakspilot - kom i gang på 3 minutter",
    html: baseEmailLayout(inner),
  };
}

/**
 * Dag 3, påminner om Windows-appen hvis brukeren ikke har installert
 * (ingen AgentSession ennå).
 */
export function desktopAppReminderEmail(user: OnboardingUser): EmailMessage {
  const firstName = user.name.split(" ")[0] || user.name;
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Har du installert Windows-appen?</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hei ${firstName}, jeg ser at du ikke har installert Sakspilot-appen for Windows ennå.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      <strong>Den gir deg ca 80% av verdien i Sakspilot:</strong> automatisk
      tidsregistrering i bakgrunnen, kobling mellom dokumenter og prosjekter, og
      én-klikks-tilgang til alt fra systemkurven.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      Installasjonen tar under ett minutt og du trenger ikke å konfigurere noe - den logger
      inn med samme konto som webappen.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="https://sakspilot.no/last-ned" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Last ned nå</a>
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:0;">
      Bruker du Mac eller Linux? Svar på denne e-posten - jeg prioriterer å bygge
      for de plattformene tidligere hvis det er etterspørsel.
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:8px 0 0 0;">
      - Helene
    </p>
  `;
  return {
    to: user.email,
    subject: "Tips: Windows-appen tar 1 minutt å installere",
    html: baseEmailLayout(inner),
  };
}

/**
 * Dag 7, spør om første inntrykk. Oppfordrer til ett-ords-svar for lav friksjon.
 */
export function feedbackPromptEmail(user: OnboardingUser): EmailMessage {
  const firstName = user.name.split(" ")[0] || user.name;
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Hvordan går det med Sakspilot?</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hei ${firstName}, du har brukt Sakspilot i en uke nå. Jeg er nysgjerrig:
      hvordan har det gått?
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      <strong>Svar på denne e-posten med ett ord:</strong>
    </p>
    <ul style="font-size:14px;line-height:1.7;color:#5E6C84;margin:0 0 20px 20px;padding:0;">
      <li><strong>bra</strong> - du har funnet ut av det og bruker det</li>
      <li><strong>dårlig</strong> - du har slitt eller ikke kommet i gang</li>
      <li><strong>blandet</strong> - noe funker, annet ikke</li>
    </ul>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      Vil du gi mer detaljert tilbakemelding? Da kan du fylle ut det fulle skjemaet:
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="https://sakspilot.no/feedback" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Gi tilbakemelding</a>
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:0;">
      All input - selv ett ord - hjelper meg å gjøre Sakspilot bedre for deg.
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:8px 0 0 0;">
      - Helene
    </p>
  `;
  return {
    to: user.email,
    subject: "Hvordan går det med Sakspilot? (1 ord holder)",
    html: baseEmailLayout(inner),
  };
}

/**
 * Dag 14, tilbyr 20-min videocall til brukere som ikke har gitt feedback.
 */
export function videocallOfferEmail(user: OnboardingUser): EmailMessage {
  const firstName = user.name.split(" ")[0] || user.name;
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Vil du ha 20 minutter med meg?</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hei ${firstName}, du har hatt Sakspilot i to uker nå.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Jeg vil veldig gjerne høre hvordan du opplever det - spesielt hva som er tungvint
      eller forvirrende. Det er den raskeste måten jeg kan forbedre produktet på.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      <strong>Har du 20 minutter til en videocall?</strong> Jeg deler skjerm med deg,
      ser hvordan du jobber, og du forteller meg hva som irriterer. Helt uformelt - og
      du får selvfølgelig hjelp med det du sliter med samtidig.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      <strong>Bare svar på denne e-posten</strong> med to-tre tidspunkter som passer,
      så sender jeg en lenke.
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:0;">
      Passer ikke videocall? Skriv gjerne to setninger i stedet - alt hjelper.
    </p>
    <p style="font-size:13px;color:#5E6C84;line-height:1.6;margin:8px 0 0 0;">
      - Helene, Sakspilot
    </p>
  `;
  return {
    to: user.email,
    subject: "20 min videocall? Jeg vil høre hva som irriterer i Sakspilot",
    html: baseEmailLayout(inner),
  };
}

// ──────────────────────────────────────────────────────────────
// Klient-portal e-poster
// ──────────────────────────────────────────────────────────────

/**
 * Sendes når frilanseren inviterer en klient til klient-portalen.
 * Klienten klikker lenken → setter passord → får login-tilgang.
 */
export function clientPortalInviteEmail(opts: {
  clientName: string;
  freelancerName: string;
  recipientEmail: string;
  acceptUrl: string;
  expiresAt: Date;
}): EmailMessage {
  const { clientName, freelancerName, recipientEmail, acceptUrl, expiresAt } = opts;
  const expiresStr = expiresAt.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const firstName = clientName.split(" ")[0] || clientName;
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Tilgang til klient-portal</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hei ${firstName},
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      <strong>${freelancerName}</strong> har invitert deg til klient-portalen i Sakspilot.
      Her kan du se status på prosjektene dine, milepæler og fakturahistorikk -
      når det måtte passe deg, uten å måtte spørre.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      Klikk lenken nedenfor for å sette et passord og logge inn første gang.
      Lenken er gyldig til <strong>${expiresStr}</strong>.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${acceptUrl}" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Aktiver tilgang</a>
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0 0 8px 0;">
      Lenken virker ikke? Kopier denne URL-en til nettleseren:
    </p>
    <p style="font-size:11px;color:#5E6C84;word-break:break-all;background:#F1F3F7;padding:8px 12px;border-radius:6px;margin:0 0 24px 0;font-family:monospace;">
      ${acceptUrl}
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0;">
      Fikk du denne uten å forvente det? Da kan du trygt ignorere e-posten -
      ingenting skjer før du selv aktiverer tilgangen.
    </p>
  `;
  return {
    to: recipientEmail,
    subject: `${freelancerName} har invitert deg til klient-portalen`,
    html: baseEmailLayout(inner),
  };
}

/**
 * Glemt-passord-flow for klient-portal (separat fra User-passwordResetEmail
 * for å unngå at lenken sendes mot feil flow).
 */
export function clientPortalPasswordResetEmail(
  recipientEmail: string,
  resetUrl: string
): EmailMessage {
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Nullstill passord - klient-portal</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      Vi mottok en forespørsel om å nullstille passordet for klient-portalen din i Sakspilot.
      Klikk lenken nedenfor for å sette et nytt passord. Lenken er gyldig i 1 time.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Sett nytt passord</a>
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0 0 8px 0;">
      Lenken virker ikke? Kopier denne URL-en til nettleseren:
    </p>
    <p style="font-size:11px;color:#5E6C84;word-break:break-all;background:#F1F3F7;padding:8px 12px;border-radius:6px;margin:0 0 24px 0;font-family:monospace;">
      ${resetUrl}
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0;">
      Hvis du ikke ba om å nullstille passord, kan du trygt ignorere denne e-posten.
    </p>
  `;
  return {
    to: recipientEmail,
    subject: "Nullstill passord - Sakspilot klient-portal",
    html: baseEmailLayout(inner),
  };
}

// ──────────────────────────────────────────────────────────────
// Team-invite e-poster (org-owner inviterer team-medlem)
// ──────────────────────────────────────────────────────────────

/**
 * Sendes når org-owner inviterer en ny bruker til samme organisasjon.
 * Mottakeren klikker lenken → setter navn + passord → blir User i samme org
 * med valgt rolle (member eller admin).
 */
export function teamInviteEmail(opts: {
  inviterName: string;
  organizationName: string;
  recipientEmail: string;
  role: "member" | "admin";
  acceptUrl: string;
  expiresAt: Date;
}): EmailMessage {
  const { inviterName, organizationName, recipientEmail, role, acceptUrl, expiresAt } = opts;
  const expiresStr = expiresAt.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const roleLabel = role === "admin" ? "administrator" : "team-medlem";
  const inner = `
    <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Invitasjon til ${organizationName}</h1>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      Hei,
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 16px 0;">
      <strong>${inviterName}</strong> har invitert deg som <strong>${roleLabel}</strong>
      i <strong>${organizationName}</strong> på Sakspilot - et arbeidsrom for
      prosjekter, klienter, timer og kalender.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
      Klikk lenken for å sette navn + passord og logge inn første gang.
      Lenken er gyldig til <strong>${expiresStr}</strong>.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${acceptUrl}" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Aktiver konto</a>
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0 0 8px 0;">
      Lenken virker ikke? Kopier denne URL-en til nettleseren:
    </p>
    <p style="font-size:11px;color:#5E6C84;word-break:break-all;background:#F1F3F7;padding:8px 12px;border-radius:6px;margin:0 0 24px 0;font-family:monospace;">
      ${acceptUrl}
    </p>
    <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0;">
      Fikk du denne uten å forvente det? Da kan du trygt ignorere e-posten -
      ingenting skjer før du selv aktiverer kontoen.
    </p>
  `;
  return {
    to: recipientEmail,
    subject: `${inviterName} har invitert deg til ${organizationName} på Sakspilot`,
    html: baseEmailLayout(inner),
  };
}

export function passwordResetEmail(
  recipientEmail: string,
  resetUrl: string
): EmailMessage {
  const html = `
    <!DOCTYPE html>
    <html lang="nb">
    <body style="margin:0;padding:40px 20px;background:#F8F9FB;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#172B4D;">
      <table style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(23,43,77,0.08);">
        <tr><td>
          <h1 style="font-size:22px;color:#1F1F1F;margin:0 0 16px 0;">Nullstill passord</h1>
          <p style="font-size:14px;line-height:1.6;color:#5E6C84;margin:0 0 20px 0;">
            Vi mottok en forespørsel om å nullstille passordet for kontoen din i Sakspilot.
            Klikk lenken nedenfor for å sette et nytt passord. Lenken er gyldig i 1 time.
          </p>
          <p style="margin:0 0 24px 0;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1F1F1F;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Sett nytt passord</a>
          </p>
          <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0 0 8px 0;">
            Lenken virker ikke? Kopier denne URL-en til nettleseren:
          </p>
          <p style="font-size:11px;color:#5E6C84;word-break:break-all;background:#F1F3F7;padding:8px 12px;border-radius:6px;margin:0 0 24px 0;font-family:monospace;">
            ${resetUrl}
          </p>
          <hr style="border:none;border-top:1px solid #E6E9EF;margin:24px 0;" />
          <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:0;">
            Hvis du ikke ba om å nullstille passord, kan du trygt ignorere denne e-posten.
            Passordet ditt er uendret.
          </p>
          <p style="font-size:12px;color:#8993A4;line-height:1.5;margin:16px 0 0 0;">
            - Sakspilot · <a href="https://sakspilot.no" style="color:#1F1F1F;">sakspilot.no</a>
          </p>
        </td></tr>
      </table>
    </body></html>
  `;
  return {
    to: recipientEmail,
    subject: "Nullstill Sakspilot-passordet ditt",
    html,
  };
}
