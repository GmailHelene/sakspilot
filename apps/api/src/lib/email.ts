/**
 * SMTP-utsendelse via nodemailer.
 *
 * Konfigureres via env-vars på Render:
 *   SMTP_HOST       — f.eks. smtp-relay.brevo.com
 *   SMTP_PORT       — 587 (STARTTLS) eller 465 (TLS)
 *   SMTP_USER       — Brevo SMTP-bruker
 *   SMTP_PASS       — Brevo SMTP-key (xsmtpsib-...)
 *   EMAIL_FROM      — avsender-adresse (må være verifisert i Brevo)
 *
 * Hvis SMTP_HOST mangler: sendEmail() returnerer { ok: false } men logger
 * advarsel — appen krasjer ikke. Brukes f.eks. i glemt-passord-flow:
 * hvis SMTP er konfig, sendes lenken; ellers logges den til konsoll og
 * vises i dev-respons.
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
        "E-poster vil ikke sendes — bare logges. Sett env-vars på Render."
    );
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  });

  return _transporter;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    console.log(`[email] STUB — ville sendt til ${msg.to}: ${msg.subject}`);
    return { ok: false, error: "SMTP not configured" };
  }

  const from = process.env.EMAIL_FROM || "noreply@sakspilot.no";

  try {
    const info = await t.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text || stripHtml(msg.html),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] send feilet:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ukjent SMTP-feil",
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
            — Sakspilot · <a href="https://sakspilot.no" style="color:#1F1F1F;">sakspilot.no</a>
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
