/**
 * AI-routes — Claude API-integrasjon for sak-assistent.
 *
 *   POST /ai/sak/:id/ask          — fri prompt med sak som kontekst
 *   POST /ai/sak/:id/summary      — kort oppsummering av sak
 *   POST /ai/sak/:id/draft-email  — utkast til klient-epost (anbefalt sjanger via type)
 *
 * Bruker prompt caching for sak-konteksten — sparer tokens når brukeren
 * stiller flere spørsmål om samme sak.
 *
 * Modell: claude-sonnet-4-5 (2025-09-29) som default — god kost/ytelse.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const MODEL = "claude-sonnet-4-5";

// Initialiser klienten kun hvis API-nøkkel finnes — bygget skal ikke kræsje
// hvis env-var ennå ikke er satt på Render.
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// ── Hjelpefunksjoner ────────────────────────────────────────────

async function loadSakContext(sakId: string, organizationId: string) {
  const sak = await prisma.sak.findFirst({
    where: { id: sakId, organizationId },
    include: {
      // KUN navn — kontaktinfo skal ikke til Claude (PII-minimisering)
      client: { select: { name: true, contactEmail: true } },
      milestones: { orderBy: { dueDate: "asc" } },
      timeEntries: {
        select: { startedAt: true, durationSec: true, billable: true, hourlyRate: true },
        orderBy: { startedAt: "desc" },
        take: 200,
      },
    },
  });
  if (!sak) return null;

  // Beregn timestatistikk
  const totalSec = sak.timeEntries.reduce((s, e) => s + e.durationSec, 0);
  const billableSec = sak.timeEntries
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.durationSec, 0);
  const totalAmount = sak.timeEntries
    .filter((e) => e.billable && e.hourlyRate)
    .reduce((s, e) => s + (e.durationSec / 3600) * (e.hourlyRate ?? 0), 0);

  return {
    sak,
    stats: {
      totalHours: +(totalSec / 3600).toFixed(1),
      billableHours: +(billableSec / 3600).toFixed(1),
      totalAmount: Math.round(totalAmount),
    },
  };
}

function buildSakContextText(ctx: NonNullable<Awaited<ReturnType<typeof loadSakContext>>>): string {
  const { sak, stats } = ctx;
  const today = new Date();
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("nb-NO") : "—");

  const milestonesText = sak.milestones
    .map(
      (m) =>
        `  - ${m.title} (frist ${fmt(m.dueDate)}, ${m.completedAt ? "FULLFØRT " + fmt(m.completedAt) : "ufullført"})`
    )
    .join("\n") || "  (ingen milepæler)";

  // PII-minimisering: vi sender klient-NAVN (nødvendig kontekst for AI),
  // men IKKE e-post eller telefon. AI-modellen trenger ikke kontaktinfo
  // for å skrive utkast — bruker fyller inn selv før sending.
  // Dette reduserer risiko ved Anthropics 30-dagers retention betraktelig.
  return `## Saksinformasjon

Tittel: ${sak.title}
Status: ${sak.status}
Saksnummer: ${sak.saksnummer || "—"}
Klient: ${sak.client?.name || "(intern sak)"}
Frist: ${fmt(sak.deadline)}
Opprettet: ${fmt(sak.createdAt)}
${sak.closedAt ? `Avsluttet: ${fmt(sak.closedAt)}` : ""}

Beskrivelse:
${sak.description || "(ingen beskrivelse)"}

## Milepæler
${milestonesText}

## Tidsstatistikk
- Total tid: ${stats.totalHours} timer
- Fakturerbart: ${stats.billableHours} timer
- Estimert beløp: ${stats.totalAmount.toLocaleString("nb-NO")} kr
- Antall tidsregistreringer: ${sak.timeEntries.length}

Dagens dato: ${today.toLocaleDateString("nb-NO")}.`;
}

const SYSTEM_PROMPT = `Du er en hjelpsom assistent for en selvstendig næringsdrivende som bruker Sakspilot for å håndtere klientoppdrag.

Du svarer på norsk (bokmål), med mindre brukeren ber om noe annet. Du er konsis, vennlig og praktisk — ikke utfyllende eller akademisk. Du gir konkrete, handlingsrettede svar.

Når du skriver e-poster:
- Bruk profesjonell, men varm tone
- Inkluder hilsen, kort hovedbudskap, klar oppfordring til handling, og avslutning
- Aldri lov noe konkret om datoer eller pris uten at det står i saks-konteksten
- Hvis du mangler info: bruk plassholder som [DIN_INFO] som brukeren kan fylle ut

Du har ikke tilgang til e-postintegrasjoner — du lager kun utkast som brukeren selv sender.`;

// ── POST /ai/sak/:id/ask ─────────────────────────────────────────

const AskSchema = z.object({
  question: z.string().min(1).max(2000),
});

router.post("/sak/:id/ask", async (req: Request, res: Response) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({
      error: "AI-assistent er ikke konfigurert. Be administrator sette ANTHROPIC_API_KEY.",
    });
  }

  const parsed = AskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input", details: parsed.error.flatten() });
  }

  const session = req.session!;
  const ctx = await loadSakContext(req.params.id, session.organizationId);
  if (!ctx) return res.status(404).json({ error: "Sak ikke funnet" });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        {
          type: "text",
          text: buildSakContextText(ctx),
          cache_control: { type: "ephemeral" }, // sak-konteksten caches
        },
      ],
      messages: [{ role: "user", content: parsed.data.question }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return res.json({
      answer: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreatedTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error("[ai] ask feilet:", err);
    return res.status(502).json({
      error: "AI-tjenesten svarte ikke. Prøv igjen om litt.",
    });
  }
});

// ── POST /ai/sak/:id/summary ─────────────────────────────────────

router.post("/sak/:id/summary", async (req: Request, res: Response) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({
      error: "AI-assistent er ikke konfigurert.",
    });
  }

  const session = req.session!;
  const ctx = await loadSakContext(req.params.id, session.organizationId);
  if (!ctx) return res.status(404).json({ error: "Sak ikke funnet" });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        {
          type: "text",
          text: buildSakContextText(ctx),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Gi en kort oppsummering av saken (3-5 setninger). Inkluder: nåværende status, neste viktige milepæl/frist, og om noe ser ut til å være forsinket eller krever oppmerksomhet. Ikke gjenta saks-tittelen — den vises allerede.",
        },
      ],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return res.json({ summary: text });
  } catch (err) {
    console.error("[ai] summary feilet:", err);
    return res.status(502).json({ error: "AI-tjenesten svarte ikke." });
  }
});

// ── POST /ai/sak/:id/draft-email ─────────────────────────────────

const DraftEmailSchema = z.object({
  type: z.enum(["status-oppdatering", "frist-utsettelse", "faktura", "tilbakemelding", "egendefinert"]),
  customInstruction: z.string().max(1000).optional(),
});

router.post("/sak/:id/draft-email", async (req: Request, res: Response) => {
  const client = getClient();
  if (!client) {
    return res.status(503).json({
      error: "AI-assistent er ikke konfigurert.",
    });
  }

  const parsed = DraftEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig input", details: parsed.error.flatten() });
  }

  const session = req.session!;
  const ctx = await loadSakContext(req.params.id, session.organizationId);
  if (!ctx) return res.status(404).json({ error: "Sak ikke funnet" });

  const typeInstructions: Record<string, string> = {
    "status-oppdatering":
      "Skriv en kort statusoppdatering til klienten. Nevn hvor saken står nå og hvilke neste steg vi venter på.",
    "frist-utsettelse":
      "Skriv en e-post som ber klienten godkjenne en utsettelse av fristen. Vær ærlig om at det krever litt mer tid, men forklar at det blir bedre kvalitet. Foreslå en konkret ny dato (du kan bruke [NY_DATO] som plassholder).",
    faktura:
      "Skriv en hyggelig påminnelse om kommende faktura. Inkluder estimert beløp basert på fakturerbare timer. Vær profesjonell men ikke pågående.",
    tilbakemelding:
      "Skriv en e-post som ber klienten gi tilbakemelding på det vi har levert så langt. Spør om noen spesifikke punkter.",
    egendefinert: parsed.data.customInstruction || "Skriv en hyggelig e-post til klienten.",
  };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        {
          type: "text",
          text: buildSakContextText(ctx),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `${typeInstructions[parsed.data.type]}\n\nReturner KUN e-postens innhold (emne på første linje, deretter tom linje, deretter brødtekst). Ikke ledende prosa, ingen forklaring rundt — bare e-posten.`,
        },
      ],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    // Del opp i emne + brødtekst
    const lines = text.split("\n");
    let subject = "";
    let body = text;
    // Strip eventuell "Emne:" / "Subject:" prefix
    const subjMatch = lines[0]?.match(/^(?:Emne|Subject)[:\s]+(.+)$/i);
    if (subjMatch) {
      subject = subjMatch[1].trim();
      body = lines.slice(1).join("\n").trimStart();
    } else if (lines[0] && lines[1] === "") {
      subject = lines[0].trim();
      body = lines.slice(2).join("\n");
    }

    return res.json({
      subject,
      body,
      recipient: ctx.sak.client?.contactEmail || null,
    });
  } catch (err) {
    console.error("[ai] draft-email feilet:", err);
    return res.status(502).json({ error: "AI-tjenesten svarte ikke." });
  }
});

export default router;
