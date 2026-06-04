/**
 * Daglig automasjons-trigger, standalone Node-script.
 *
 * Skedulert via Render Cron Job, kjøres hver natt kl 02:00 Oslo-tid
 * (= 01:00 UTC sommertid / 00:00 UTC vintertid). Cron-uttrykk i Render:
 *   "0 0 * * *"  (UTC midnatt; treffer 01:00 vinter / 02:00 sommer Oslo)
 * Bytt evt. til "0 1 * * *" om du heller vil ha konsekvent 02:00 sommer / 03:00 vinter.
 *
 * Hvorfor:
 *   Tidsbaserte triggers (spesielt `milestone_due_soon`) ble tidligere kun
 *   evaluert lazy ved GET /automations. Hvis ingen åpnet agent-siden den dagen,
 *   gikk varselet tapt. Denne jobben scanner alle organisasjoner uavhengig av
 *   brukeraktivitet.
 *
 * Gjenbruker logikken fra services/automationEngine.ts, vi importerer
 * `checkDueSoonAutomations()` istedenfor å duplisere matching/action-koden.
 *
 * Test lokalt:
 *   npm run job:daily-automations
 *
 * Avslutter alltid med exit code 0 ved suksess. Ved DB-feil: exit 1
 * (Render markerer da jobben som mislykket og sender alert).
 */
import prisma from "../lib/prisma";
import { checkDueSoonAutomations } from "../services/automationEngine";

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[daily-automation-trigger] starter ${new Date().toISOString()} (Oslo: ${new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })})`
  );

  // Hent alle organisasjoner som har minst én aktiv tidsbasert automatisering.
  // Filtrerer her i stedet for å scanne alle org-er for å holde jobben rask
  // når kun et fåtall faktisk har milestone_due_soon-agenter satt opp.
  const orgs = await prisma.organization.findMany({
    where: {
      automations: {
        some: {
          enabled: true,
          trigger: "milestone_due_soon",
        },
      },
    },
    select: { id: true, name: true },
  });

  console.log(`[daily-automation-trigger] fant ${orgs.length} organisasjon(er) med aktive due_soon-agenter`);

  let okCount = 0;
  let failCount = 0;

  for (const org of orgs) {
    try {
      console.log(`[daily-automation-trigger] -> sjekker org "${org.name}" (${org.id})`);
      // checkDueSoonAutomations gjør jobben:
      //   - henter alle ufullførte milepæler for org-en
      //   - matcher mot daysUntil-config på hver agent
      //   - dedupe via Automation.lastRunAt (kjørt i dag? → skip)
      //   - utfører action (create_sticky / create_milestone / change_sak_status)
      //   - oppdaterer lastRunAt + runCount på automation
      await checkDueSoonAutomations(org.id);
      okCount++;
    } catch (err) {
      failCount++;
      console.error(`[daily-automation-trigger] feil for org ${org.id}:`, err);
      // Fortsett med neste org, én org sin feil skal ikke stoppe hele jobben.
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[daily-automation-trigger] ferdig på ${elapsedMs}ms - ok: ${okCount}, feilet: ${failCount}`
  );

  // Lukk Prisma rent slik at Node-prosessen kan avslutte uten å henge.
  await prisma.$disconnect();

  // failCount > 0 betyr at minst én org feilet, men jobben som helhet
  // klarte å kjøre, vi exiter 0 så lenge selve loopen kom gjennom.
  // Render alerter da kun ved harde krasj (uncaught exception).
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[daily-automation-trigger] FATAL - jobben kunne ikke kjøre:", err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignorer, vi er allerede på vei ut
  }
  process.exit(1);
});
