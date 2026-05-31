/**
 * Automations-routes — CRUD for agenter (Monday/Notion-stil automatiseringer).
 *
 *   GET    /automations              — liste alle for org
 *   POST   /automations              — opprett ny
 *   PATCH  /automations/:id          — oppdater (også enable/disable)
 *   DELETE /automations/:id
 *   GET    /automations/templates    — returner ferdige maler
 *   POST   /automations/:id/test     — kjør én gang manuelt for å teste
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { checkDueSoonAutomations, runAutomationsForTrigger } from "../services/automationEngine";

const router = Router();
router.use(requireAuth);

const TriggerEnum = z.enum([
  "sak_status_changed",
  "sak_created",
  "milestone_completed",
  "milestone_due_soon",
  "time_entry_logged",
]);

const ActionEnum = z.enum([
  "create_sticky",
  "create_milestone",
  "change_sak_status",
  "show_notification",
]);

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: TriggerEnum,
  triggerConfig: z.record(z.unknown()).default({}),
  action: ActionEnum,
  actionConfig: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional(),
});

const UpdateSchema = CreateSchema.partial();

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;

  // Lazy-sjekk tidsbaserte triggers ved hver visning (en slags poor-man's cron)
  await checkDueSoonAutomations(organizationId).catch((err) =>
    console.error("[automations] due-soon-sjekk feilet:", err)
  );

  const automations = await prisma.automation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ automations });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const { organizationId } = req.session!;
  const automation = await prisma.automation.create({
    data: {
      ...parsed.data,
      triggerConfig: parsed.data.triggerConfig as Prisma.InputJsonValue,
      actionConfig: parsed.data.actionConfig as Prisma.InputJsonValue,
      organizationId,
    },
  });
  return res.status(201).json(automation);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const session = req.session!;
  const existing = await prisma.automation.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Agent ikke funnet" });

  // Cast Json-felter til Prisma.InputJsonValue når de er med
  const { triggerConfig, actionConfig, ...rest } = parsed.data;
  const data: Prisma.AutomationUpdateInput = { ...rest };
  if (triggerConfig !== undefined) {
    data.triggerConfig = triggerConfig as Prisma.InputJsonValue;
  }
  if (actionConfig !== undefined) {
    data.actionConfig = actionConfig as Prisma.InputJsonValue;
  }

  const automation = await prisma.automation.update({
    where: { id: req.params.id },
    data,
  });
  return res.json(automation);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const session = req.session!;
  const existing = await prisma.automation.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: "Agent ikke funnet" });
  await prisma.automation.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

/**
 * GET /automations/templates
 * Ferdige maler brukeren kan klikke for å opprette automatiseringer raskt.
 */
router.get("/templates", async (_req: Request, res: Response) => {
  const templates = [
    {
      id: "faktura-paaminnelse",
      name: "Faktura-påminnelse når prosjekt ferdig",
      icon: "💰",
      description: "Når et prosjekt markeres Ferdig, opprett klistrelapp som minner om å sende faktura",
      trigger: "sak_status_changed",
      triggerConfig: { toStatus: "ferdig" },
      action: "create_sticky",
      actionConfig: {
        stickyText: "💰 Send faktura til {clientName} for «{sakTitle}»",
        color: "green",
      },
    },
    {
      id: "frist-7d",
      name: "Frist-varsel 7 dager før",
      icon: "📅",
      description: "Når en milepæl er 7 dager unna, opprett påminnelse",
      trigger: "milestone_due_soon",
      triggerConfig: { daysUntil: 7 },
      action: "create_sticky",
      actionConfig: {
        stickyText: "⏰ {milestoneTitle} forfaller {dueDate} — prosjekt: {sakTitle}",
        color: "yellow",
      },
    },
    {
      id: "frist-1d",
      name: "Akutt frist-varsel 1 dag før",
      icon: "🚨",
      description: "Når en milepæl er bare 1 dag unna, opprett rød påminnelse",
      trigger: "milestone_due_soon",
      triggerConfig: { daysUntil: 1 },
      action: "create_sticky",
      actionConfig: {
        stickyText: "🚨 IMORGEN: {milestoneTitle} — prosjekt: {sakTitle}",
        color: "pink",
      },
    },
    {
      id: "auto-pagaa",
      name: "Auto-flytt til Pågående ved tidslogging",
      icon: "▶️",
      description: "Når desktop-agent logger tid på et prosjekt, sett status til Pågående",
      trigger: "time_entry_logged",
      triggerConfig: {},
      action: "change_sak_status",
      actionConfig: { toStatus: "pagaaende" },
    },
    {
      id: "faktura-milestone",
      name: "Auto-frist for fakturering",
      icon: "📨",
      description: "Når prosjekt går til Ferdig, opprett milepæl 'Send faktura' 7 dager frem",
      trigger: "sak_status_changed",
      triggerConfig: { toStatus: "ferdig" },
      action: "create_milestone",
      actionConfig: { title: "Send faktura", offsetDays: 7 },
    },
    {
      id: "ny-sak-welcome",
      name: "Klistrelapp ved nytt prosjekt",
      icon: "✨",
      description: "Ved opprettelse av nytt prosjekt, opprett huskelapp med standard sjekkliste",
      trigger: "sak_created",
      triggerConfig: {},
      action: "create_sticky",
      actionConfig: {
        stickyText: "Nytt prosjekt: {sakTitle}\n\n☐ Sett timesats\n☐ Lag matching-regel\n☐ Sett frist\n☐ Avtal første møte",
        color: "blue",
      },
    },
    {
      id: "milestone-done-celebrate",
      name: "Feiring ved fullført milepæl",
      icon: "🎉",
      description: "Når en milepæl markeres fullført, opprett grønn klistrelapp",
      trigger: "milestone_completed",
      triggerConfig: {},
      action: "create_sticky",
      actionConfig: {
        stickyText: "🎉 Fullført: {milestoneTitle}",
        color: "green",
      },
    },
  ];
  return res.json({ templates });
});

/**
 * POST /automations/:id/test
 * Test-kjør en agent uten ekte trigger (for å se at action funker).
 */
router.post("/:id/test", async (req: Request, res: Response) => {
  const session = req.session!;
  const automation = await prisma.automation.findFirst({
    where: { id: req.params.id, organizationId: session.organizationId },
  });
  if (!automation) return res.status(404).json({ error: "Agent ikke funnet" });

  // Lag dummy-kontekst for test
  const sak = await prisma.sak.findFirst({
    where: { organizationId: session.organizationId },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!sak) {
    return res.status(400).json({ error: "Du må ha minst ett prosjekt for å teste agenten" });
  }

  await runAutomationsForTrigger(automation.trigger, {
    organizationId: session.organizationId,
    userId: session.userId,
    sak: { id: sak.id, title: sak.title, status: sak.status, previousStatus: sak.status, client: sak.client },
    milestone: {
      id: "test",
      title: "Test-milepæl",
      sakId: sak.id,
      sakTitle: sak.title,
      dueDate: new Date(Date.now() + 7 * 86400000),
      daysUntil: 7,
    },
  });
  return res.json({ ok: true, message: "Test-kjøring ferdig — sjekk klistrelapper eller prosjektet." });
});

export default router;
