/**
 * Tripletex-integrasjon — direkte v2-API mot Sakspilot's Partner Consumer Token.
 *
 *   GET    /integrations/tripletex/status        — koblet/ikke + statistikk
 *   POST   /integrations/tripletex/connect       — lim inn EmployeeToken + verifiser
 *   DELETE /integrations/tripletex/disconnect    — slett integrasjon + tøm session-cache
 *   POST   /integrations/tripletex/push-invoice  — opprett fakturadraft fra sak
 *   POST   /integrations/tripletex/push-timers   — push billable timer som timesheet-entries
 *
 * Sikkerhet:
 *   - Alle ruter krever requireAuth
 *   - Skrive-operasjoner krever owner-rolle (tokenet er org-felles, kun owner
 *     bør kunne koble til/fra og pushe data utad)
 *   - EmployeeToken aldri i klartekst i DB — kryptert med AES-256-GCM
 *   - ConsumerToken bare i env, aldri returnert i responser
 *   - SessionToken cachet kun process-lokalt
 *   - Audit-log på connect/disconnect/push (uten tokens eller sak-innhold)
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/crypto";
import {
  verifyEmployeeToken,
  createInvoiceDraft,
  pushTimesheetEntry,
  clearSessionCache,
  TripletexError,
} from "../lib/tripletex";

const router = Router();
router.use(requireAuth);

// ── Hjelpere ─────────────────────────────────────────────────────

function handleTripletexError(res: Response, err: unknown, fallback = 502) {
  if (err instanceof TripletexError) {
    return res.status(err.status === 401 ? 401 : fallback).json({
      error: err.message,
      tripletexStatus: err.status,
      tripletexBody: err.body,
    });
  }
  return res.status(500).json({
    error: err instanceof Error ? err.message : "Ukjent feil mot Tripletex",
  });
}

// ── GET /status ──────────────────────────────────────────────────

router.get("/status", async (req: Request, res: Response) => {
  const session = req.session!;
  const integ = await prisma.tripletexIntegration.findUnique({
    where: { organizationId: session.organizationId },
    select: {
      companyId: true,
      companyName: true,
      employeeId: true,
      employeeName: true,
      useTestEnv: true,
      lastVerifiedAt: true,
      invoicesPushed: true,
      hoursPushed: true,
      createdAt: true,
    },
  });

  if (!integ) {
    return res.json({
      connected: false,
      docsUrl: "https://hjelp.tripletex.no/hc/no/articles/4409557117841",
      hint:
        "Generer en EmployeeToken i Tripletex under Mitt firma → Vår API-løsning → Generer ny token. Velg integrasjonen Sakspilot.",
    });
  }

  return res.json({
    connected: true,
    companyId: integ.companyId,
    companyName: integ.companyName,
    employeeId: integ.employeeId,
    employeeName: integ.employeeName,
    useTestEnv: integ.useTestEnv,
    lastVerifiedAt: integ.lastVerifiedAt,
    invoicesPushed: integ.invoicesPushed,
    hoursPushed: integ.hoursPushed,
    connectedAt: integ.createdAt,
  });
});

// ── POST /connect ────────────────────────────────────────────────

const ConnectSchema = z.object({
  employeeToken: z.string().min(20).max(1000),
  useTestEnv: z.boolean().optional().default(false),
});

router.post(
  "/connect",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const parsed = ConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Ugyldig input", details: parsed.error.flatten() });
    }
    const { employeeToken, useTestEnv } = parsed.data;
    const session = req.session!;

    let verified;
    try {
      verified = await verifyEmployeeToken(employeeToken, useTestEnv);
    } catch (err) {
      if (err instanceof TripletexError) {
        if (err.status === 401 || err.status === 403) {
          return res.status(400).json({
            error:
              "Tokenet ble avvist av Tripletex. Sjekk at det er riktig og at integrasjonen heter 'Sakspilot'.",
          });
        }
        return res.status(502).json({
          error: `Tripletex svarte med ${err.status}: ${err.message}`,
        });
      }
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Verifisering feilet",
      });
    }

    const encryptedEmployeeToken = encrypt(employeeToken);

    await prisma.tripletexIntegration.upsert({
      where: { organizationId: session.organizationId },
      update: {
        encryptedEmployeeToken,
        companyId: verified.companyId,
        companyName: verified.companyName,
        employeeId: verified.employeeId,
        employeeName: verified.employeeName,
        useTestEnv,
        lastVerifiedAt: new Date(),
      },
      create: {
        organizationId: session.organizationId,
        encryptedEmployeeToken,
        companyId: verified.companyId,
        companyName: verified.companyName,
        employeeId: verified.employeeId,
        employeeName: verified.employeeName,
        useTestEnv,
        lastVerifiedAt: new Date(),
      },
    });

    // Tøm evt gammel session-cache (hvis token ble byttet ut)
    clearSessionCache(session.organizationId);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        organizationId: session.organizationId,
        action: "tripletex.connected",
        entityType: "tripletex_integration",
        entityId: session.organizationId,
        metadata: {
          companyName: verified.companyName,
          useTestEnv,
        },
      },
    });

    return res.json({
      ok: true,
      connected: true,
      companyName: verified.companyName,
      employeeName: verified.employeeName,
    });
  }
);

// ── DELETE /disconnect ───────────────────────────────────────────

router.delete(
  "/disconnect",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const session = req.session!;
    await prisma.tripletexIntegration.deleteMany({
      where: { organizationId: session.organizationId },
    });
    clearSessionCache(session.organizationId);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        organizationId: session.organizationId,
        action: "tripletex.disconnected",
        entityType: "tripletex_integration",
        entityId: session.organizationId,
        metadata: {},
      },
    });

    return res.json({ ok: true });
  }
);

// ── POST /push-invoice ───────────────────────────────────────────

const PushInvoiceSchema = z.object({
  sakId: z.string().uuid(),
  onlyBillable: z.boolean().optional().default(true),
  daysUntilDue: z.number().int().min(0).max(180).optional().default(14),
});

router.post(
  "/push-invoice",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const parsed = PushInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Ugyldig input", details: parsed.error.flatten() });
    }
    const { sakId, onlyBillable, daysUntilDue } = parsed.data;
    const session = req.session!;

    const integ = await prisma.tripletexIntegration.findUnique({
      where: { organizationId: session.organizationId },
    });
    if (!integ) {
      return res.status(412).json({
        error:
          "Tripletex-integrasjon mangler. Koble til først via /innstillinger/tripletex.",
      });
    }

    const sak = await prisma.sak.findFirst({
      where: { id: sakId, organizationId: session.organizationId },
      include: {
        client: true,
        timeEntries: {
          where: onlyBillable ? { billable: true } : {},
          orderBy: { startedAt: "asc" },
        },
      },
    });
    if (!sak) return res.status(404).json({ error: "Prosjekt ikke funnet" });
    if (!sak.client) {
      return res.status(400).json({
        error:
          "Prosjektet har ingen klient - kan ikke opprette faktura uten mottaker.",
      });
    }
    if (sak.timeEntries.length === 0) {
      return res.status(400).json({
        error: onlyBillable
          ? "Ingen fakturerbare timer på prosjektet."
          : "Ingen timeregistreringer på prosjektet.",
      });
    }

    const totalSec = sak.timeEntries.reduce((s, e) => s + e.durationSec, 0);
    const totalHours = +(totalSec / 3600).toFixed(2);
    const hourlyRate =
      sak.hourlyRate ??
      sak.client.defaultHourlyRate ??
      sak.timeEntries.find((e) => e.hourlyRate)?.hourlyRate ??
      1200;

    let employeeToken: string;
    try {
      employeeToken = decrypt(integ.encryptedEmployeeToken);
    } catch {
      return res.status(500).json({
        error:
          "Klarte ikke å dekryptere Tripletex-token. Koble til på nytt under Innstillinger.",
      });
    }

    try {
      const result = await createInvoiceDraft(
        session.organizationId,
        employeeToken,
        integ.useTestEnv,
        {
          clientName: sak.client.name,
          clientEmail: sak.client.contactEmail,
          clientPhone: sak.client.contactPhone,
          clientOrgNumber: sak.client.orgNumber,
          description: `${sak.title}${sak.saksnummer ? ` (prosjektnr ${sak.saksnummer})` : ""} - ${totalHours} timer`,
          hours: totalHours,
          hourlyRate,
          daysUntilDue,
        }
      );

      await prisma.tripletexIntegration.update({
        where: { id: integ.id },
        data: {
          invoicesPushed: { increment: 1 },
          lastVerifiedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          organizationId: session.organizationId,
          action: "tripletex.invoice_pushed",
          entityType: "sak",
          entityId: sak.id,
          metadata: {
            invoiceId: result.invoiceId,
            hours: totalHours,
            // BEVISST: lagrer ikke beløp/beskrivelse i audit-log
          },
        },
      });

      return res.json({
        ok: true,
        tripletexInvoiceId: result.invoiceId,
        tripletexInvoiceNumber: result.invoiceNumber,
        hours: totalHours,
        amount: result.amount,
        customerId: result.customerId,
        viewUrl: result.viewUrl,
      });
    } catch (err) {
      return handleTripletexError(res, err);
    }
  }
);

// ── POST /push-timers ────────────────────────────────────────────

const PushTimersSchema = z.object({
  sakId: z.string().uuid(),
  dateFrom: z.string().optional(), // YYYY-MM-DD
  dateTo: z.string().optional(),
  activityId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
});

router.post(
  "/push-timers",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const parsed = PushTimersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Ugyldig input", details: parsed.error.flatten() });
    }
    const { sakId, dateFrom, dateTo, activityId, projectId } = parsed.data;
    const session = req.session!;

    const integ = await prisma.tripletexIntegration.findUnique({
      where: { organizationId: session.organizationId },
    });
    if (!integ) {
      return res.status(412).json({
        error: "Tripletex-integrasjon mangler. Koble til først.",
      });
    }
    if (!integ.employeeId) {
      return res.status(412).json({
        error:
          "Mangler Tripletex employee-id på integrasjonen. Koble til på nytt.",
      });
    }

    const sak = await prisma.sak.findFirst({
      where: { id: sakId, organizationId: session.organizationId },
      include: {
        timeEntries: {
          where: {
            billable: true,
            ...(dateFrom ? { startedAt: { gte: new Date(dateFrom) } } : {}),
            ...(dateTo ? { endedAt: { lte: new Date(dateTo) } } : {}),
          },
          orderBy: { startedAt: "asc" },
        },
      },
    });
    if (!sak) return res.status(404).json({ error: "Prosjekt ikke funnet" });
    if (sak.timeEntries.length === 0) {
      return res.status(400).json({
        error: "Ingen fakturerbare timer i valgt periode.",
      });
    }

    let employeeToken: string;
    try {
      employeeToken = decrypt(integ.encryptedEmployeeToken);
    } catch {
      return res.status(500).json({
        error: "Klarte ikke å dekryptere Tripletex-token.",
      });
    }

    // Grupper per dato (Tripletex' modell er én entry per dato per
    // employee/activity/project), summer timer per dag.
    const perDate = new Map<string, { hours: number; comments: string[] }>();
    for (const entry of sak.timeEntries) {
      const date = entry.startedAt.toISOString().slice(0, 10);
      const hours = entry.durationSec / 3600;
      const existing = perDate.get(date);
      if (existing) {
        existing.hours += hours;
        if (entry.note) existing.comments.push(entry.note);
      } else {
        perDate.set(date, {
          hours,
          comments: entry.note ? [entry.note] : [],
        });
      }
    }

    const pushed: Array<{ date: string; hours: number; entryId: number }> = [];
    const errors: Array<{ date: string; error: string }> = [];

    for (const [date, agg] of perDate.entries()) {
      try {
        const result = await pushTimesheetEntry(
          session.organizationId,
          employeeToken,
          integ.useTestEnv,
          {
            date,
            hours: +agg.hours.toFixed(2),
            activityId,
            projectId,
            employeeId: integ.employeeId,
            comment:
              agg.comments.length > 0
                ? agg.comments.join(" · ").slice(0, 500)
                : `Sakspilot: ${sak.title}`,
          }
        );
        pushed.push({ date, hours: +agg.hours.toFixed(2), entryId: result.id });
      } catch (err) {
        errors.push({
          date,
          error: err instanceof Error ? err.message : "Ukjent feil",
        });
      }
    }

    if (pushed.length > 0) {
      await prisma.tripletexIntegration.update({
        where: { id: integ.id },
        data: {
          hoursPushed: { increment: pushed.length },
          lastVerifiedAt: new Date(),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        organizationId: session.organizationId,
        action: "tripletex.timers_pushed",
        entityType: "sak",
        entityId: sak.id,
        metadata: {
          pushed: pushed.length,
          failed: errors.length,
        },
      },
    });

    return res.json({
      ok: errors.length === 0,
      pushed,
      errors,
    });
  }
);

export default router;
