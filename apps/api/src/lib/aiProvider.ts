/**
 * AI-provider-abstraksjon.
 *
 * Sakspilot bruker Claude som AI-modell, men kan routes via to provider-paths:
 *
 *   1. ANTHROPIC (default) — direkte mot Anthropic API
 *      Krever: ANTHROPIC_API_KEY
 *      Data sendes via Anthropic (USA + EU), 30-dagers retention (ZDR krever
 *      Enterprise-avtale). PII-minimisering i ai.ts kompenserer.
 *
 *   2. BEDROCK (STUB) — via AWS Bedrock i eu-west-1 (Irland) eller eu-central-1
 *      Krever: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *               + @anthropic-ai/bedrock-sdk i package.json
 *      Fordel: Data forblir innenfor EU (AWS DPA), ingen retention hos
 *      Anthropic. Pris ~5% høyere. Tilgang krever AWS-konto + at modellen
 *      er aktivert i Bedrock console.
 *
 * Switching:
 *   AI_PROVIDER=anthropic (default)
 *   AI_PROVIDER=bedrock
 *
 * Status: ANTHROPIC fungerer. BEDROCK er stub — koden er på plass men
 * dependency er ikke installert. Aktivering når Helene har behov for
 * EU-residency (f.eks for offentlig sektor / regulert kunde).
 */
import Anthropic from "@anthropic-ai/sdk";

export type AIProviderId = "anthropic" | "bedrock";

export interface AIProviderInfo {
  id: AIProviderId;
  configured: boolean;
  model: string;
  region?: string;
  notes: string;
}

const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const BEDROCK_MODEL = "anthropic.claude-sonnet-4-5-20250929-v1:0"; // bedrock-id-stil

export function getProviderId(): AIProviderId {
  const raw = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  return raw === "bedrock" ? "bedrock" : "anthropic";
}

export function getProviderInfo(): AIProviderInfo {
  const id = getProviderId();
  if (id === "bedrock") {
    const hasCreds = Boolean(
      process.env.AWS_REGION &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY
    );
    return {
      id: "bedrock",
      configured: hasCreds,
      model: BEDROCK_MODEL,
      region: process.env.AWS_REGION,
      notes: hasCreds
        ? "Routes via AWS Bedrock. Husk: legg til @anthropic-ai/bedrock-sdk og bytt klient-init i ai.ts."
        : "Mangler AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.",
    };
  }
  return {
    id: "anthropic",
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: ANTHROPIC_MODEL,
    notes: process.env.ANTHROPIC_API_KEY
      ? "Direkte mot Anthropic API."
      : "Mangler ANTHROPIC_API_KEY.",
  };
}

/**
 * Returnerer en konfigurert Claude-klient.
 *
 * For Anthropic: standard SDK.
 *
 * For Bedrock (STUB): kaster feil med klar instruks. Når Helene aktiverer
 * Bedrock må følgende gjøres:
 *   1. `npm i @anthropic-ai/bedrock-sdk` i apps/api
 *   2. Bytt return-grenen under til:
 *        const { AnthropicBedrock } = await import("@anthropic-ai/bedrock-sdk");
 *        return new AnthropicBedrock({ awsRegion: process.env.AWS_REGION }) as any;
 *   3. Modell-ID i ai.ts må bytte til `getActiveModel()` (under)
 */
export function getAIClient(): Anthropic | null {
  const id = getProviderId();

  if (id === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return new Anthropic({ apiKey });
  }

  if (id === "bedrock") {
    // Stub — Bedrock-SDK er ikke aktivert. Tidligere falt vi STILLE tilbake
    // til Anthropic (USA), som er et brudd på GDPR-databehandler-løftet hvis
    // org-en eksplisitt har valgt Bedrock for å holde data i EU.
    //
    // Nå: throw med tydelig melding. Bedre å feile høyt enn å sende data
    // til feil region uten å varsle om det. Etter aktivering av Bedrock-SDK
    // (se header-kommentar), erstatt denne throw med ekte Bedrock-init.
    throw new Error(
      "[aiProvider] AI_PROVIDER=bedrock er valgt, men Bedrock-SDK er IKKE aktivert. " +
      "Vi vil ikke stille falle tilbake til Anthropic (USA) - det ville brutt GDPR-løftet om EU-databehandler. " +
      "Enten: (1) Aktiver Bedrock-SDK i aiProvider.ts (se header-kommentar), eller (2) Sett AI_PROVIDER=anthropic."
    );
  }

  return null;
}

/**
 * Returnerer riktig modell-ID for aktiv provider.
 * Anthropic API bruker korte navn, Bedrock bruker fully-qualified IDs.
 */
export function getActiveModel(): string {
  return getProviderId() === "bedrock" ? BEDROCK_MODEL : ANTHROPIC_MODEL;
}
