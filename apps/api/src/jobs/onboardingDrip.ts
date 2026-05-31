/**
 * Onboarding drip-kampanje — standalone Node-script.
 *
 * Sender e-poster til nye brukere på dag 3, 7 og 14 etter registrering.
 * Dag 0 (welcomeEmail) sendes direkte fra POST /auth/register, ikke herfra.
 *
 * Skedulert via GitHub Actions, kjøres hver morgen 08:00 UTC
 * (= 09:00 vinter / 10:00 sommer Oslo-tid). Et naturlig morgentidspunkt
 * for en jobb-e-post, og før de fleste leser e-post på morgenen.
 *
 * Hva sendes:
 *   - dag 3: desktopAppReminderEmail — kun til brukere UTEN AgentSession
 *            (de som ikke har installert Windows-appen ennå)
 *   - dag 7: feedbackPromptEmail — til alle 7-dagers brukere
 *   - dag 14: videocallOfferEmail — kun til brukere UTEN Feedback
 *            (de som ikke har sagt fra hvordan det går)
 *
 * Dedupe:
 *   User.lastOnboardingEmail (0/3/7/14) skrives etter vellykket send. Hvis en
 *   bruker allerede har fått dag 3, hopper jobben over selv om de fortsatt
 *   ligger i 3-dagers-vinduet neste kjøring. Vi sender også kun "fremover" —
 *   en bruker med lastOnboardingEmail=7 vil ikke få dag-3-mail (dvs. hvis
 *   jobben en dag glipper dag 3 for en bruker, hopper vi rett til dag 7).
 *
 * Vinduet for hver dag er +/-12 timer rundt N*86400000 ms siden createdAt.
 * Det dekker normalt sett at jobben kjører én gang om dagen, og at en bruker
 * fortsatt fanges opp selv om kjøringen forsinkes noen timer.
 *
 * Edge cases:
 *   - Hvis e-post feiler: ingen oppdatering av lastOnboardingEmail → retry
 *     neste kjøring så lenge vinduet fortsatt er åpent. Vinduet er 24 timer
 *     bredt, så vi får ~1 retry-mulighet.
 *   - Brukere registrert FØR dette feltet ble lagt til har lastOnboardingEmail=0
 *     (default). De som allerede er > 14 dager gamle vil aldri matche noe vindu
 *     og slipper å få sene drip-eposter.
 *
 * Test lokalt:
 *   npm run job:onboarding-drip
 */
import prisma from "../lib/prisma";
import {
  sendEmail,
  desktopAppReminderEmail,
  feedbackPromptEmail,
  videocallOfferEmail,
  OnboardingUser,
} from "../lib/email";

type DripDay = 3 | 7 | 14;

interface DripCandidate {
  id: string;
  email: string;
  name: string;
  lastOnboardingEmail: number | null;
}

/**
 * Returnerer et tidsvindu rundt "N dager før nå" — 12 timer rundt N*24h.
 * Brukes som createdAt-filter for å fange brukere som passerte N-dagers-merket.
 */
function windowForDay(daysAgo: number): { gte: Date; lte: Date } {
  const now = Date.now();
  const center = now - daysAgo * 86400000;
  const half = 12 * 3600000;
  return {
    gte: new Date(center - half),
    lte: new Date(center + half),
  };
}

async function findCandidatesForDay(day: DripDay): Promise<DripCandidate[]> {
  const window = windowForDay(day);
  // Bruker kun de som ikke allerede har fått en e-post med samme eller høyere
  // dag-nummer (lastOnboardingEmail < day). Null behandles som 0.
  const users = await prisma.user.findMany({
    where: {
      createdAt: window,
      OR: [
        { lastOnboardingEmail: null },
        { lastOnboardingEmail: { lt: day } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastOnboardingEmail: true,
    },
  });
  return users;
}

/**
 * Filtrerer bort brukere som ALLEREDE har minst én AgentSession
 * (de har installert Windows-appen — trenger ikke påminnelse).
 */
async function filterOutInstalledApp(
  candidates: DripCandidate[]
): Promise<DripCandidate[]> {
  if (candidates.length === 0) return candidates;
  const userIds = candidates.map((u) => u.id);
  const withSession = await prisma.agentSession.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const installedSet = new Set(withSession.map((s) => s.userId));
  return candidates.filter((u) => !installedSet.has(u.id));
}

/**
 * Filtrerer bort brukere som ALLEREDE har sendt feedback (vi vil ikke mase
 * om videocall hvis de allerede har gitt tilbakemelding).
 */
async function filterOutHasFeedback(
  candidates: DripCandidate[]
): Promise<DripCandidate[]> {
  if (candidates.length === 0) return candidates;
  const userIds = candidates.map((u) => u.id);
  const withFeedback = await prisma.feedback.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const gaveFeedbackSet = new Set(withFeedback.map((f) => f.userId));
  return candidates.filter((u) => !gaveFeedbackSet.has(u.id));
}

async function sendDripForUser(
  user: DripCandidate,
  day: DripDay,
  templateFn: (u: OnboardingUser) => ReturnType<typeof desktopAppReminderEmail>
): Promise<"sent" | "failed"> {
  try {
    const result = await sendEmail(
      templateFn({ email: user.email, name: user.name })
    );
    if (!result.ok) {
      console.warn(
        `[onboarding-drip] dag ${day} — send feilet for ${user.email}: ${result.error}`
      );
      return "failed";
    }
    // Skriv dedupe-feltet KUN ved suksess, så vi får retry neste kjøring
    // hvis SMTP er midlertidig nede.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastOnboardingEmail: day },
    });
    console.log(
      `[onboarding-drip] dag ${day} sendt til ${user.email} (msg: ${result.messageId})`
    );
    return "sent";
  } catch (err) {
    console.error(
      `[onboarding-drip] dag ${day} — uventet feil for ${user.email}:`,
      err
    );
    return "failed";
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[onboarding-drip] starter ${new Date().toISOString()} (Oslo: ${new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })})`
  );

  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // ── Dag 3: påminn om Windows-appen ──────────────────────────────
  {
    const all = await findCandidatesForDay(3);
    const candidates = await filterOutInstalledApp(all);
    const skipped = all.length - candidates.length;
    totalSkipped += skipped;
    console.log(
      `[onboarding-drip] dag 3 — fant ${all.length} kandidat(er), ${skipped} har allerede installert app, sender til ${candidates.length}`
    );
    for (const user of candidates) {
      const status = await sendDripForUser(user, 3, desktopAppReminderEmail);
      if (status === "sent") totalSent++;
      else totalFailed++;
    }
  }

  // ── Dag 7: be om kort feedback ──────────────────────────────────
  {
    const candidates = await findCandidatesForDay(7);
    console.log(
      `[onboarding-drip] dag 7 — sender feedback-prompt til ${candidates.length} bruker(e)`
    );
    for (const user of candidates) {
      const status = await sendDripForUser(user, 7, feedbackPromptEmail);
      if (status === "sent") totalSent++;
      else totalFailed++;
    }
  }

  // ── Dag 14: tilby videocall til de som ikke har sagt fra ────────
  {
    const all = await findCandidatesForDay(14);
    const candidates = await filterOutHasFeedback(all);
    const skipped = all.length - candidates.length;
    totalSkipped += skipped;
    console.log(
      `[onboarding-drip] dag 14 — fant ${all.length} kandidat(er), ${skipped} har allerede gitt feedback, sender til ${candidates.length}`
    );
    for (const user of candidates) {
      const status = await sendDripForUser(user, 14, videocallOfferEmail);
      if (status === "sent") totalSent++;
      else totalFailed++;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[onboarding-drip] ferdig på ${elapsedMs}ms — sendt: ${totalSent}, hoppet over: ${totalSkipped}, feilet: ${totalFailed}`
  );

  await prisma.$disconnect();
  // Selv om noen sendinger feilet (typisk SMTP-rate-limit), exit 0 så lenge
  // jobben kom seg gjennom loopen. Harde krasj fanges av .catch() under.
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[onboarding-drip] FATAL — jobben kunne ikke kjøre:", err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignorer — vi er allerede på vei ut
  }
  process.exit(1);
});
