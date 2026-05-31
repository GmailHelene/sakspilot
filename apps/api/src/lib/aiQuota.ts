/**
 * AI-kvote per organisasjon — vern mot kostnadssprekk.
 *
 * Strategi:
 *   - Hver org får 500 Claude-kall per måned (hard cap → 429)
 *   - Pilot-orgs (pilotUntil > now) får 10x = 5000/mnd
 *   - Vi sporer både kall-antall OG token-bruk (input+output). Token-tellingen
 *     er for fremtidig kost-basert prising, men håndhever ikke ennå.
 *   - Måneden resettes når aiMonthStartedAt er > 30 dager gammel. Enkel
 *     rullende tilbakestilling — ikke "kalendermåned". Holder gjennomsnittlig
 *     bruk under taket selv ved tett bruk i en uke.
 *
 * Bruk:
 *   const quota = await checkAiQuota(organizationId);
 *   if (!quota.allowed) return res.status(429).json({ error: ... });
 *   // ... kjør AI-kall ...
 *   await recordAiUsage(organizationId, response.usage);
 */
import prisma from "./prisma";

const DEFAULT_MONTHLY_LIMIT = 500;
const PILOT_MULTIPLIER = 10; // pilot-orgs får 10x
const MONTH_RESET_AFTER_DAYS = 30;
const SOFT_WARN_THRESHOLD = 0.8; // varsel når >80% brukt

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  isPilot: boolean;
  /** "soft" når >80% brukt — frontend bør vise advarsel.
   *  "hard" når kvoten er brukt opp — request avvises. */
  warningLevel: "ok" | "soft" | "hard";
  /** Dager til neste reset (omtrent) */
  resetsInDays: number;
}

export async function checkAiQuota(organizationId: string): Promise<QuotaStatus> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      aiCallsThisMonth: true,
      aiMonthStartedAt: true,
      pilotUntil: true,
    },
  });
  if (!org) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
      isPilot: false,
      warningLevel: "hard",
      resetsInDays: 0,
    };
  }

  // Sjekk om perioden er utløpt → reset
  const now = Date.now();
  const monthAgeDays = (now - org.aiMonthStartedAt.getTime()) / (1000 * 60 * 60 * 24);
  let used = org.aiCallsThisMonth;
  let resetsInDays = MONTH_RESET_AFTER_DAYS - monthAgeDays;
  if (monthAgeDays >= MONTH_RESET_AFTER_DAYS) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        aiCallsThisMonth: 0,
        aiTokensThisMonth: 0,
        aiMonthStartedAt: new Date(),
      },
    });
    used = 0;
    resetsInDays = MONTH_RESET_AFTER_DAYS;
  }

  const isPilot = !!(org.pilotUntil && org.pilotUntil.getTime() > now);
  const limit = isPilot ? DEFAULT_MONTHLY_LIMIT * PILOT_MULTIPLIER : DEFAULT_MONTHLY_LIMIT;
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;
  const warningLevel: QuotaStatus["warningLevel"] = !allowed
    ? "hard"
    : used / limit >= SOFT_WARN_THRESHOLD
    ? "soft"
    : "ok";

  return {
    allowed,
    used,
    limit,
    remaining,
    isPilot,
    warningLevel,
    resetsInDays: Math.max(0, Math.ceil(resetsInDays)),
  };
}

/**
 * Logg ett vellykket AI-kall. Inkrementer call-counter og legg til token-bruk.
 * Kalles ETTER at responsen fra Anthropic er mottatt.
 */
export async function recordAiUsage(
  organizationId: string,
  usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
): Promise<void> {
  const totalTokens =
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      aiCallsThisMonth: { increment: 1 },
      aiTokensThisMonth: { increment: totalTokens },
    },
  });
}

/**
 * Standard 429-respons når kvoten er brukt opp.
 * Brukes av alle AI-endpoints så meldingen er konsistent.
 */
export function quotaExceededResponse(quota: QuotaStatus) {
  return {
    error: "AI-kvote brukt opp denne måneden",
    detail: `Du har brukt ${quota.used} av ${quota.limit} AI-kall. ${
      quota.isPilot ? "(Pilot-kvote)" : ""
    } Tilbakestilles om ~${quota.resetsInDays} dager.`,
    used: quota.used,
    limit: quota.limit,
    isPilot: quota.isPilot,
    resetsInDays: quota.resetsInDays,
  };
}

/**
 * Sett rate-limit-headers på respons. Frontend kan lese disse for å vise
 * advarsel før kvoten faktisk er brukt opp.
 */
export function setQuotaHeaders(res: import("express").Response, quota: QuotaStatus) {
  res.setHeader("X-AI-Quota-Limit", String(quota.limit));
  res.setHeader("X-AI-Quota-Used", String(quota.used));
  res.setHeader("X-AI-Quota-Remaining", String(quota.remaining));
  if (quota.warningLevel === "soft") {
    res.setHeader("X-AI-Quota-Warning", "soft");
  }
}
