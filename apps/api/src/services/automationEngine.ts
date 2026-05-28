/**
 * Automation engine — evaluerer triggers + utfører actions.
 *
 * Hovedfunksjoner:
 *   - runAutomationsForTrigger(): kjøres inline ved hendelser (sak status-bytte osv.)
 *   - checkDueSoonAutomations(): kjøres lazy ved /agenter-fetch (sjekker tidsbaserte triggers)
 *
 * Pattern: hver trigger har en config (f.eks. { fromStatus, toStatus }) og hver
 * action har en config (f.eks. { stickyText, color }). Engine matcher og kjører.
 */
import prisma from "../lib/prisma";

interface TriggerContext {
  organizationId: string;
  userId?: string;
  sak?: {
    id: string;
    title: string;
    status: string;
    previousStatus?: string;
    client?: { id: string; name: string } | null;
  };
  milestone?: {
    id: string;
    title: string;
    sakId: string;
    sakTitle: string;
    dueDate: Date;
    daysUntil?: number;
  };
}

/**
 * Hovedfunksjon: kjør automatiseringer for én trigger-type med kontekst.
 * Kalles inline fra route-handlers (saker, milestones osv.).
 */
export async function runAutomationsForTrigger(
  triggerType:
    | "sak_status_changed"
    | "sak_created"
    | "milestone_completed"
    | "milestone_due_soon"
    | "time_entry_logged",
  ctx: TriggerContext
): Promise<{ executed: number; failed: number }> {
  const automations = await prisma.automation.findMany({
    where: {
      organizationId: ctx.organizationId,
      trigger: triggerType,
      enabled: true,
    },
  });

  let executed = 0;
  let failed = 0;

  for (const auto of automations) {
    try {
      if (!matchesTrigger(auto.triggerConfig as Record<string, unknown>, triggerType, ctx)) {
        continue;
      }
      await executeAction(auto.action, auto.actionConfig as Record<string, unknown>, ctx);
      await prisma.automation.update({
        where: { id: auto.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      });
      executed++;
    } catch (err) {
      console.error(`[Automation ${auto.id}] feilet:`, err);
      failed++;
    }
  }

  return { executed, failed };
}

/**
 * Sjekk om en trigger sin config matcher den faktiske hendelsen.
 * Eks: { fromStatus: "pagaaende", toStatus: "ferdig" } matcher kun
 * når sak gikk fra pågående til ferdig.
 */
function matchesTrigger(
  config: Record<string, unknown>,
  triggerType: string,
  ctx: TriggerContext
): boolean {
  if (triggerType === "sak_status_changed" && ctx.sak) {
    if (config.fromStatus && ctx.sak.previousStatus !== config.fromStatus) return false;
    if (config.toStatus && ctx.sak.status !== config.toStatus) return false;
    return true;
  }
  if (triggerType === "sak_created") {
    return true; // alle nye saker matches
  }
  if (triggerType === "milestone_completed") {
    return true;
  }
  if (triggerType === "milestone_due_soon" && ctx.milestone) {
    const daysWanted = Number(config.daysUntil ?? 7);
    return ctx.milestone.daysUntil === daysWanted;
  }
  return false;
}

/**
 * Utfør én action med dens config. Hver action har sin egen logikk.
 * Tekst-felter kan inneholde variabler som {sakTitle}, {clientName}, {milestoneTitle}.
 */
async function executeAction(
  action: string,
  config: Record<string, unknown>,
  ctx: TriggerContext
): Promise<void> {
  const interpolate = (s: string) => interpolateVars(s, ctx);

  if (action === "create_sticky") {
    const content = interpolate(String(config.stickyText || "Påminnelse"));
    const color = String(config.color || "yellow");
    await prisma.stickyNote.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        sakId: ctx.sak?.id ?? ctx.milestone?.sakId,
        content,
        color,
        pinned: true,
      },
    });
    return;
  }

  if (action === "create_milestone") {
    const targetSakId = ctx.sak?.id || ctx.milestone?.sakId;
    if (!targetSakId) return;
    const offsetDays = Number(config.offsetDays ?? 7);
    const dueDate = new Date(Date.now() + offsetDays * 86400000);
    await prisma.milestone.create({
      data: {
        sakId: targetSakId,
        title: interpolate(String(config.title || "Ny milepæl")),
        dueDate,
      },
    });
    return;
  }

  if (action === "change_sak_status") {
    if (!ctx.sak?.id) return;
    const newStatus = String(config.toStatus || "pagaaende");
    await prisma.sak.update({
      where: { id: ctx.sak.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: newStatus as any },
    });
    return;
  }

  // show_notification kommer i fase 2 (krever WebSocket eller polling)
}

function interpolateVars(template: string, ctx: TriggerContext): string {
  const result = template
    .replace(/\{sakTitle\}/g, ctx.sak?.title || ctx.milestone?.sakTitle || "")
    // Intern sak (uten klient): bruk «(intern)» istedenfor tom streng
    // for å unngå stygge mellomrom i tekstmaler
    .replace(/\{clientName\}/g, ctx.sak?.client?.name || "(intern)")
    .replace(/\{status\}/g, ctx.sak?.status || "")
    .replace(/\{previousStatus\}/g, ctx.sak?.previousStatus || "")
    .replace(/\{milestoneTitle\}/g, ctx.milestone?.title || "")
    .replace(/\{dueDate\}/g, ctx.milestone?.dueDate?.toLocaleDateString("nb-NO") || "")
    .replace(/\{daysUntil\}/g, String(ctx.milestone?.daysUntil ?? ""));

  // Belt-and-braces: kollaps multiple mellomrom og trim linjevis,
  // i tilfelle en variabel fortsatt ender opp tom (f.eks. {milestoneTitle}
  // på sak_created-trigger).
  return result
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").replace(/ +$/g, ""))
    .join("\n");
}

/**
 * Lazy-evaluering av tidsbaserte triggers (milestone_due_soon).
 * Kalles ved hver GET /automations slik at vi ikke trenger en cron-jobb.
 * Sjekker alle ufullførte milepæler og kjører matchende automasjoner én gang per dag.
 */
export async function checkDueSoonAutomations(organizationId: string): Promise<void> {
  const dueSoonAutos = await prisma.automation.findMany({
    where: { organizationId, trigger: "milestone_due_soon", enabled: true },
  });
  if (dueSoonAutos.length === 0) return;

  // Hent ufullførte milepæler i organisasjonen
  const milestones = await prisma.milestone.findMany({
    where: {
      completedAt: null,
      sak: { organizationId },
    },
    include: { sak: { include: { client: { select: { id: true, name: true } } } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const m of milestones) {
    const due = new Date(m.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((due.getTime() - today.getTime()) / 86400000);
    if (daysUntil < 0 || daysUntil > 30) continue; // bare relevante

    for (const auto of dueSoonAutos) {
      const config = auto.triggerConfig as { daysUntil?: number };
      const wantedDays = Number(config.daysUntil ?? 7);
      if (daysUntil !== wantedDays) continue;

      // Sjekk om vi har kjørt for denne milepælen i dag
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (auto.lastRunAt && auto.lastRunAt >= todayStart) continue;

      try {
        await executeAction(
          auto.action,
          auto.actionConfig as Record<string, unknown>,
          {
            organizationId,
            milestone: {
              id: m.id,
              title: m.title,
              sakId: m.sakId,
              sakTitle: m.sak.title,
              dueDate: m.dueDate,
              daysUntil,
            },
            sak: {
              id: m.sak.id,
              title: m.sak.title,
              status: m.sak.status,
              client: m.sak.client,
            },
          }
        );
        await prisma.automation.update({
          where: { id: auto.id },
          data: { lastRunAt: new Date(), runCount: { increment: 1 } },
        });
      } catch (err) {
        console.error(`[Automation ${auto.id}] due_soon-feil:`, err);
      }
    }
  }
}
