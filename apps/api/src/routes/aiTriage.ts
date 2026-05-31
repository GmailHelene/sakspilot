/**
 * AI-triage — Claude foreslår sak for ukategoriserte TimeEntries.
 *
 * Når desktop-agenten logger en arbeidsøkt uten matching-rule-treff og uten
 * aktiv sak, havner entry-en med sakId=null. Tidligere måtte bruker manuelt
 * gå inn og kategorisere. Her lar vi Claude se window-tittel + app-navn og
 * foreslå hvilken av brukerens åpne saker som passer best. Bruker bekrefter
 * eller avslår med ett klikk.
 *
 *   POST /ai-triage/suggest        — bulk: kjør Claude på alle pending entries
 *   POST /ai-triage/accept/:id     — godta forslag → sakId settes
 *   POST /ai-triage/reject/:id     — avslå forslag → ikke spør igjen
 *   GET  /ai-triage/pending        — list TimeEntries med aiSuggestedSakId satt
 *
 * Kostnadsvern:
 *   - Bruker eksisterende checkAiQuota / recordAiUsage (apps/api/src/lib/aiQuota.ts)
 *   - Max 50 entries per /suggest-kall (en entry = en Claude-prompt)
 *   - Small max_tokens (20) — vi vil bare ha sak-ID tilbake, ikke prosa
 *   - Manuell trigger (knapp i UI), ikke cron — bruker bestemmer når kostnader påløper
 */
import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { getAIClient, getActiveModel } from "../lib/aiProvider";
import {
  checkAiQuota,
  recordAiUsage,
  quotaExceededResponse,
  setQuotaHeaders,
} from "../lib/aiQuota";

const router = Router();
router.use(requireAuth);

/// Max antall entries vi prosesserer per /suggest-kall. Hver entry = ett
/// Claude-kall. 50 entries × ~50 input-tokens ≈ overkommelig for kvoten,
/// men beskytter mot at en bruker med tusenvis av ukategoriserte entries
/// brenner hele månedskvoten på ett klikk.
const MAX_ENTRIES_PER_RUN = 50;

/// Vi henter åpne saker (ikke arkivert, ikke ferdig) for brukerens org og
/// gir Claude en kompakt liste med tittel + matching-regler. Dette er
/// kontekst-bærer som lar Claude "se" hva slags saker som finnes.
async function buildSakerContext(organizationId: string) {
  const saker = await prisma.sak.findMany({
    where: {
      organizationId,
      archived: false,
      status: { notIn: ["ferdig", "arkivert"] },
    },
    select: {
      id: true,
      title: true,
      client: { select: { name: true } },
      matchingRules: {
        where: { enabled: true },
        select: { type: true, pattern: true },
        take: 10,
      },
    },
    take: 100, // praktisk grense — flere enn dette og prompten blir for stor
  });
  return saker;
}

function buildSakerListText(saker: Awaited<ReturnType<typeof buildSakerContext>>): string {
  return saker
    .map((s) => {
      const klient = s.client?.name ? ` (klient: ${s.client.name})` : "";
      const regler = s.matchingRules.length
        ? ` | hint: ${s.matchingRules.map((r) => `${r.type}:"${r.pattern}"`).join(", ")}`
        : "";
      return `- ${s.id} :: ${s.title}${klient}${regler}`;
    })
    .join("\n");
}

const SYSTEM_PROMPT = `Du er en kategoriserings-assistent for et tidsregistrerings-verktøy.
Bruker har logget en arbeidsøkt automatisk (vindustittel + app-navn) som ikke matchet noen regler.
Din jobb: velg sak-ID-en fra listen som passer best, eller svar "none" hvis ingen passer åpenbart.

Returnér KUN sak-ID-en (UUID) eller ordet "none". Ingen forklaring, ingen prosa.`;

// ── POST /ai-triage/suggest ──────────────────────────────────────
// Kjører Claude på alle pending entries for brukeren. Lagrer forslag
// inline på TimeEntry. Returnerer aggregert resultat.

router.post("/suggest", async (req: Request, res: Response) => {
  const client = getAIClient();
  if (!client) {
    return res.status(503).json({
      error: "AI-assistent er ikke konfigurert. Be administrator sette ANTHROPIC_API_KEY.",
    });
  }

  const session = req.session!;

  // Sjekk kvote FØR vi gjør DB-arbeid
  const quota = await checkAiQuota(session.organizationId);
  setQuotaHeaders(res, quota);
  if (!quota.allowed) {
    return res.status(429).json(quotaExceededResponse(quota));
  }

  // Hent kandidat-entries: uavtegnet, ikke allerede forslått, ikke avslått.
  // Begrenset til brukerens egne entries — andre i samme org har sine egne.
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.userId,
      sakId: null,
      aiSuggestedSakId: null,
      aiSuggestionRejected: false,
      // Bare entries med kontekst Claude faktisk kan bruke
      OR: [{ windowTitle: { not: null } }, { appName: { not: null } }],
    },
    orderBy: { startedAt: "desc" },
    take: MAX_ENTRIES_PER_RUN,
    select: {
      id: true,
      windowTitle: true,
      appName: true,
    },
  });

  if (entries.length === 0) {
    return res.json({
      suggested: 0,
      skipped: 0,
      quotaUsed: quota.used,
      quotaLimit: quota.limit,
      message: "Ingen ukategoriserte entries å foreslå for.",
    });
  }

  const saker = await buildSakerContext(session.organizationId);
  if (saker.length === 0) {
    return res.json({
      suggested: 0,
      skipped: entries.length,
      quotaUsed: quota.used,
      quotaLimit: quota.limit,
      message: "Ingen åpne prosjekter å foreslå mot. Opprett et prosjekt først.",
    });
  }

  const sakerListText = buildSakerListText(saker);
  const validSakIds = new Set(saker.map((s) => s.id));

  let suggested = 0;
  let skipped = 0;
  const model = getActiveModel();

  for (const entry of entries) {
    // Re-sjekk kvote underveis så vi stopper hvis vi går tom midt i bulk-jobben
    const midQuota = await checkAiQuota(session.organizationId);
    if (!midQuota.allowed) {
      skipped++;
      continue;
    }

    const userPrompt = `Vindustittel: ${entry.windowTitle ?? "(ukjent)"}
App: ${entry.appName ?? "(ukjent)"}

Tilgjengelige saker:
${sakerListText}

Hvilken sak-ID passer best? Svar bare med ID-en eller "none".`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 60, // UUID = 36 tegn, "none" = 4. Litt slingringsmonn.
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      await recordAiUsage(session.organizationId, response.usage);

      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();

      // Parse svaret: enten UUID som finnes i validSakIds, eller "none"
      const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      const proposedId = uuidMatch?.[0];

      if (proposedId && validSakIds.has(proposedId)) {
        await prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            aiSuggestedSakId: proposedId,
            aiSuggestedAt: new Date(),
          },
        });
        suggested++;
      } else {
        // Claude sa "none" eller hallusinerte ID — marker som rejected
        // så vi ikke prøver igjen på denne entry-en uten at noe har endret seg.
        await prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            aiSuggestionRejected: true,
            aiSuggestedAt: new Date(),
          },
        });
        skipped++;
      }
    } catch (err) {
      console.error(`[ai-triage] feilet for entry ${entry.id}:`, err);
      skipped++;
    }
  }

  const finalQuota = await checkAiQuota(session.organizationId);
  setQuotaHeaders(res, finalQuota);

  return res.json({
    suggested,
    skipped,
    quotaUsed: finalQuota.used,
    quotaLimit: finalQuota.limit,
  });
});

// ── POST /ai-triage/accept/:timeEntryId ──────────────────────────
// Bruker godtar AI-forslaget. Setter sakId = aiSuggestedSakId, clearer forslaget.

router.post("/accept/:timeEntryId", async (req: Request, res: Response) => {
  const session = req.session!;

  const entry = await prisma.timeEntry.findFirst({
    where: {
      id: req.params.timeEntryId,
      userId: session.userId,
    },
    select: {
      id: true,
      aiSuggestedSakId: true,
    },
  });
  if (!entry) {
    return res.status(404).json({ error: "Tidsregistrering ikke funnet" });
  }
  if (!entry.aiSuggestedSakId) {
    return res.status(400).json({ error: "Ingen AI-forslag på denne entry-en" });
  }

  // Bekreft at den foreslåtte saken fremdeles finnes og tilhører org-en
  // (kan ha blitt slettet siden forslaget ble laget).
  const sak = await prisma.sak.findFirst({
    where: { id: entry.aiSuggestedSakId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!sak) {
    return res.status(400).json({ error: "Foreslått prosjekt finnes ikke lenger" });
  }

  await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      sakId: entry.aiSuggestedSakId,
      aiSuggestedSakId: null,
      aiSuggestionRejected: false,
      source: "edited",
    },
  });

  return res.json({ ok: true });
});

// ── POST /ai-triage/reject/:timeEntryId ──────────────────────────
// Bruker avslår — settes aiSuggestionRejected=true, clearer forslaget.

router.post("/reject/:timeEntryId", async (req: Request, res: Response) => {
  const session = req.session!;

  const entry = await prisma.timeEntry.findFirst({
    where: {
      id: req.params.timeEntryId,
      userId: session.userId,
    },
    select: { id: true },
  });
  if (!entry) {
    return res.status(404).json({ error: "Tidsregistrering ikke funnet" });
  }

  await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      aiSuggestedSakId: null,
      aiSuggestionRejected: true,
    },
  });

  return res.json({ ok: true });
});

// ── GET /ai-triage/pending ───────────────────────────────────────
// Returnerer alle entries med aktivt AI-forslag for brukeren, med sak-tittel.

router.get("/pending", async (req: Request, res: Response) => {
  const session = req.session!;

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.userId,
      aiSuggestedSakId: { not: null },
      sakId: null,
      aiSuggestionRejected: false,
    },
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      id: true,
      windowTitle: true,
      appName: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      aiSuggestedSakId: true,
      aiSuggestedAt: true,
    },
  });

  // Hent sak-titler for alle foreslåtte sakIds i én batch
  const sakIds = Array.from(
    new Set(entries.map((e) => e.aiSuggestedSakId).filter((id): id is string => Boolean(id)))
  );
  const saker = await prisma.sak.findMany({
    where: {
      id: { in: sakIds },
      organizationId: session.organizationId,
    },
    select: {
      id: true,
      title: true,
      client: { select: { name: true } },
    },
  });
  const sakMap = new Map(saker.map((s) => [s.id, s]));

  const items = entries.map((e) => {
    const sak = e.aiSuggestedSakId ? sakMap.get(e.aiSuggestedSakId) : null;
    return {
      id: e.id,
      windowTitle: e.windowTitle,
      appName: e.appName,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationSec: e.durationSec,
      aiSuggestedAt: e.aiSuggestedAt,
      suggestedSak: sak
        ? { id: sak.id, title: sak.title, clientName: sak.client?.name ?? null }
        : null,
    };
  });

  return res.json({ items });
});

export default router;
