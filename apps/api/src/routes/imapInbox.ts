/**
 * GET /admin/imap-inbox?limit=30
 *
 * Henter siste N e-poster fra Helene's Domeneshop-konto via IMAP.
 * Gated paa pilot-admin-whitelist (samme som /admin/pilot-stats) sa
 * vanlige Sakspilot-brukere ikke kan ramme dette - det er ditt admin-
 * verktoy for aa lese kontakt@helene.cloud uten aa veksle til Outlook
 * eller Domeneshop webmail.
 *
 * Konfigurasjon (env-vars i Render):
 *   IMAP_HOST=imap.domeneshop.no
 *   IMAP_PORT=993
 *   IMAP_USER=kontakt@helene.cloud
 *   IMAP_PASS=<passord eller app-spesifikt passord>
 *   IMAP_TLS=true
 *
 * Notat: passordet for IMAP er ofte samme som webmail-passordet.
 * Hvis du har 2FA paa Domeneshop, ma du generere et app-spesifikt
 * passord i Domeneshop-kontrollpanelet.
 *
 * Read-only: vi henter bare innboks, vi sender ikke ut. For send,
 * bruk Brevo (allerede konfigurert) eller webmail.
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

const PILOT_ADMINS = new Set([
  "helene721@gmail.com",
  "helene@helene.cloud",
]);

function requirePilotAdmin(req: Request, res: Response): boolean {
  if (!req.session) {
    res.status(401).json({ error: "Ikke innlogget" });
    return false;
  }
  if (!PILOT_ADMINS.has(req.session.email)) {
    res.status(403).json({ error: "Krever pilot-admin" });
    return false;
  }
  return true;
}

interface ImapMessage {
  uid: number;
  from: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  if (!requirePilotAdmin(req, res)) return;

  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) {
    return res.status(503).json({
      error: "IMAP ikke konfigurert. Sett IMAP_HOST, IMAP_USER, IMAP_PASS i Render env-vars.",
      configHelp: {
        IMAP_HOST: "imap.domeneshop.no",
        IMAP_PORT: "993",
        IMAP_USER: "kontakt@helene.cloud",
        IMAP_PASS: "<webmail-passord eller app-passord ved 2FA>",
        IMAP_TLS: "true",
      },
    });
  }

  const port = Number(process.env.IMAP_PORT || 993);
  const secure = (process.env.IMAP_TLS ?? "true").toLowerCase() !== "false";
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

  // Dynamisk import sa applikasjonen kan starte uten imapflow installert
  // (vi falle pa 503 over hvis pakken mangler). Gjor det enkelt aa rulle
  // tilbake ved aa fjerne env-varene uten code-deploy.
  let ImapFlowMod;
  try {
    ImapFlowMod = await import("imapflow");
  } catch {
    return res.status(503).json({
      error: "imapflow-pakken er ikke installert i API-en. Kjor 'npm i imapflow' i apps/api og deploy paa nytt.",
    });
  }

  const { ImapFlow } = ImapFlowMod as { ImapFlow: new (opts: object) => {
    connect: () => Promise<void>;
    logout: () => Promise<void>;
    mailboxOpen: (name: string) => Promise<{ exists: number }>;
    fetch: (range: string, options: object) => AsyncIterable<{
      uid: number;
      envelope?: { from?: Array<{ name?: string; address?: string }>; subject?: string; date?: Date };
      flags?: Set<string>;
      bodyParts?: Map<string, Buffer>;
    }>;
  }};

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    const total = mailbox.exists;

    // Tom innboks: hopp over fetch. Range "1:0" gir BAD-respons fra
    // Domeneshop's IMAP-server (og er ugyldig IMAP-syntax generelt).
    if (total === 0) {
      await client.logout();
      return res.json({ user, total: 0, count: 0, messages: [] });
    }

    const start = Math.max(1, total - limit + 1);
    const range = `${start}:${total}`;

    const messages: ImapMessage[] = [];
    for await (const msg of client.fetch(range, {
      envelope: true,
      flags: true,
      bodyParts: ["1"],
    })) {
      const fromList = msg.envelope?.from ?? [];
      const fromText = fromList.length
        ? fromList.map((f) => f.name ? `${f.name} <${f.address}>` : f.address).join(", ")
        : "(ukjent avsender)";
      let preview = "";
      if (msg.bodyParts) {
        const body = msg.bodyParts.get("1");
        if (body) {
          preview = body.toString("utf8").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
        }
      }
      messages.push({
        uid: msg.uid,
        from: fromText,
        subject: msg.envelope?.subject ?? "(ingen emnefelt)",
        preview,
        date: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        unread: !msg.flags?.has("\\Seen"),
      });
    }
    await client.logout();

    // Nyeste forst
    messages.sort((a, b) => b.date.localeCompare(a.date));
    return res.json({ user, total, count: messages.length, messages });
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    // Detaljert feilmelding med hint om hva som typisk er galt
    const errMsg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errCode = (err as any)?.responseStatus || (err as any)?.code || null;
    console.error("[imap-inbox] feilet:", { errMsg, errCode, host, user, port });

    let hint = "";
    if (/auth|AUTH|invalid credentials|LOGIN failed|BAD/i.test(errMsg)) {
      hint = " Sjekk at IMAP_USER er full epost (kontakt@helene.cloud) og IMAP_PASS er korrekt webmail-passord. Hvis du har 2FA pa Domeneshop, ma du generere et app-spesifikt passord i kontrollpanelet under Konto -> 2-faktor.";
    } else if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(errMsg)) {
      hint = " Server-tilkobling feilet. Sjekk at IMAP_HOST=imap.domeneshop.no og IMAP_PORT=993 i Render env-vars.";
    } else if (/Command failed/i.test(errMsg)) {
      hint = " Generisk IMAP-feil. Mest sannsynlig: feil passord, eller 2FA aktivert pa Domeneshop uten app-passord. Test ved a logge inn pa Domeneshop webmail med samme passord.";
    } else if (/TLS|SSL|certificate/i.test(errMsg)) {
      hint = " TLS-problem. Sett IMAP_TLS=true i env-vars.";
    }

    return res.status(502).json({
      error: `IMAP feilet: ${errMsg}${errCode ? ` (code: ${errCode})` : ""}.${hint}`,
      debug: {
        host,
        port,
        user,
        secure,
        responseStatus: errCode,
      },
    });
  }
});

export default router;
