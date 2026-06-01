/**
 * Agent-routes — endepunkter desktop-agenten bruker.
 *
 *   GET  /agent/rules   — hent alle aktive matching-regler for innloggets org
 *   POST /agent/sync    — batch-opplasting av session-poster fra agent → DB
 *
 * Begge bruker JWT-auth (samme som web). Multi-tenant filter på
 * organizationId fra session sikrer at agent for én bruker aldri kan
 * skrive til en annen bruker sine data.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/**
 * GET /agent/rules
 *
 * Returnerer en flat liste med matching-regler for alle ikke-arkiverte
 * saker i innloggets organisasjon. Desktop-agenten cacher dette og
 * evaluerer reglene lokalt på hver vinduslogging.
 */
router.get("/rules", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;

  const rules = await prisma.matchingRule.findMany({
    where: {
      enabled: true,
      sak: { organizationId, archived: false },
    },
    select: {
      id: true,
      type: true,
      pattern: true,
      priority: true,
      sak: { select: { id: true, title: true, hourlyRate: true } },
    },
    orderBy: { priority: "desc" },
  });

  // Flatten til formen agenten forventer
  const flat = rules.map((r) => ({
    ruleId: r.id,
    sakId: r.sak.id,
    sakTitle: r.sak.title,
    sakHourlyRate: r.sak.hourlyRate,
    type: r.type,
    pattern: r.pattern,
    priority: r.priority,
  }));

  return res.json({ rules: flat, count: flat.length });
});

// ── POST /agent/sync ────────────────────────────────────────────
const AgentSessionSchema = z.object({
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  durationSec: z.number().int().min(1).max(86400 * 7), // maks 7 dager per session
  app: z.string().max(255).optional(),
  title: z.string().max(1000).optional(),
  sakId: z.string().uuid().nullable().optional(),
  // matchedOn — utvidet med "auto-track" + "active-sak" fra auto-spor-flyten
  // (Sakspilot-snarveier som åpnes via Launcher) og fallback-attribusjon når
  // ingen matching-regel matcher men "aktiv sak" er satt.
  matchedOn: z
    .enum(["title", "path", "app", "email", "auto-track", "active-sak"])
    .nullable()
    .optional(),
  deviceId: z.string().max(120).optional(),
});

const SyncSchema = z.object({
  sessions: z.array(AgentSessionSchema).max(500),
  agentVersion: z.string().max(40).optional(),
  deviceName: z.string().max(120).optional(),
});

/**
 * POST /agent/sync
 *
 * Tar imot en batch med ferdig-loggede sessions fra desktop-agenten.
 * Hver session blir til én TimeEntry i DB. Hvis sakId ikke er satt
 * lagres entry'en som "ikke-matchet" (kan kategoriseres manuelt senere).
 *
 * Bekrefter at sakId tilhører innloggets org før vi lagrer — agent
 * kan ikke "smitte" entries inn på andre brukeres saker.
 */
router.post("/sync", async (req: Request, res: Response) => {
  const parsed = SyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const session = req.session!;
  const { sessions, agentVersion, deviceName } = parsed.data;

  if (sessions.length === 0) {
    return res.json({ created: 0, message: "Tom batch — ingenting å gjøre" });
  }

  // Valider sakId-tilhørighet + hent timesats for snapshot på TimeEntry
  const sakIds = [...new Set(sessions.map((s) => s.sakId).filter((id): id is string => !!id))];
  const rateMap = new Map<string, number>();
  if (sakIds.length > 0) {
    const validSaker = await prisma.sak.findMany({
      where: { id: { in: sakIds }, organizationId: session.organizationId },
      select: {
        id: true,
        hourlyRate: true,
        client: { select: { defaultHourlyRate: true } },
        organization: { select: { defaultHourlyRate: true } },
      },
    });
    const validSet = new Set(validSaker.map((s) => s.id));
    for (const sak of validSaker) {
      // Sats-prioritering: sak.hourlyRate → client.defaultHourlyRate → org.defaultHourlyRate
      const rate = sak.hourlyRate ?? sak.client?.defaultHourlyRate ?? sak.organization.defaultHourlyRate ?? 0;
      if (rate > 0) rateMap.set(sak.id, rate);
    }
    // Strip sakId fra entries som ikke matcher org (sikkerhet)
    for (const s of sessions) {
      if (s.sakId && !validSet.has(s.sakId)) s.sakId = null;
    }
  }

  // Bulk-insert via createMany (med snapshot av timesats)
  const result = await prisma.timeEntry.createMany({
    data: sessions.map((s) => ({
      sakId: s.sakId ?? null,
      userId: session.userId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSec: s.durationSec,
      source: "auto" as const,
      windowTitle: s.title?.slice(0, 1000),
      appName: s.app?.slice(0, 255),
      deviceId: s.deviceId,
      billable: true,
      hourlyRate: s.sakId ? rateMap.get(s.sakId) ?? null : null,
    })),
    skipDuplicates: false,
  });

  // Oppdater eller opprett AgentSession-tracking (siste sett-tid + versjon)
  const firstDeviceId = sessions.find((s) => s.deviceId)?.deviceId;
  if (firstDeviceId) {
    await prisma.agentSession.upsert({
      where: {
        userId_deviceId: {
          userId: session.userId,
          deviceId: firstDeviceId,
        },
      },
      update: {
        lastSeenAt: new Date(),
        agentVersion: agentVersion || "ukjent",
        deviceName: deviceName || undefined,
      },
      create: {
        userId: session.userId,
        deviceId: firstDeviceId,
        deviceName: deviceName || null,
        agentVersion: agentVersion || "ukjent",
        platform: "windows" as const,
      },
    });
  }

  // Audit-logg
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "agent.synced",
      entityType: "time_entry",
      metadata: { count: result.count, agentVersion: agentVersion || null },
    },
  });

  return res.json({
    created: result.count,
    skippedDueToOrgMismatch: sessions.filter((s) => s.sakId === null && sakIds.length > 0).length,
  });
});

export default router;
