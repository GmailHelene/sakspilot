/**
 * Notifications-counts — ett samlet endpoint for badge-counter i sidebar.
 *
 *   GET /notifications/counts?since[area]=ISO&since[other]=ISO
 *
 * Returnerer { area: { unread, total } } for hver nav-fane som har varsler.
 *   - total: hvor mange "aktive" elementer finnes (forfalt, ulest, etc.) akkurat nå
 *   - unread: hvor mange av disse som ble opprettet/oppdatert etter `since[area]`
 *
 * Klienten lagrer `lastVisited[area]` i localStorage og sender det som
 * `since[area]`. Når brukeren åpner fanen, oppdaterer klienten tidspunktet
 * lokalt og badge-count blir 0 (basert på nye since).
 *
 * Hvorfor ett samlet endpoint? Ellers ville sidebar trigget 5-6 separate
 * API-kall per polling-runde (hvert 30. sek) = 12 requests/min * antall
 * brukere = unødvendig last på Neon. Med samlet endpoint = 2 req/min.
 *
 * Hva som IKKE er med:
 *   - Hjem, Klienter, Regnskap, MVA, Statistikk, Rapport: ingen meningsfull
 *     varsel-kilde
 *   - Integrasjoner: vi har ikke token-feil-logging enda
 *   - Snarveier (eksterne URLs): kan ikke pollet server-side
 *
 * Multi-tenant: alle queries filtreres på organizationId fra session.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Parse since[area]=ISO query-params til { area: Date | null }
function parseSinceParams(req: Request): Record<string, Date | null> {
  const since: Record<string, Date | null> = {};
  const q = req.query.since;
  if (q && typeof q === "object" && !Array.isArray(q)) {
    for (const [area, value] of Object.entries(q as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      const d = new Date(value);
      if (!isNaN(d.getTime())) since[area] = d;
    }
  }
  return since;
}

router.get("/counts", async (req: Request, res: Response) => {
  const { organizationId, userId } = req.session!;
  const session = req.session!;
  const since = parseSinceParams(req);
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 86400_000);

  // Hent epost for team-invite-matching (kun denne brukerens pending invites)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  // Alle queries parallelliseres — 7 queries, 1 round-trip per Prisma
  const [
    foresporslerTotal,
    foresporslerUnread,
    sakerTotal,
    sakerUnread,
    fakturaerTotal,
    fakturaerUnread,
    kalenderTotal,
    kalenderUnread,
    stickyTotal,
    stickyUnread,
    teamInvites,
  ] = await Promise.all([
    // Forespørsler: aktive (ny + i_dialog) som total, "ny" som unread-bucket
    prisma.foresporsel.count({
      where: { organizationId, status: { in: ["ny", "i_dialog"] } },
    }),
    prisma.foresporsel.count({
      where: {
        organizationId,
        status: "ny",
        ...(since.foresporsler ? { createdAt: { gt: since.foresporsler } } : {}),
      },
    }),

    // Prosjekter: saker med overskredet deadline (uavhengig av status, men IKKE arkiverte/ferdige)
    prisma.sak.count({
      where: {
        organizationId,
        archived: false,
        status: { notIn: ["ferdig", "arkivert"] },
        deadline: { lt: now },
      },
    }),
    prisma.sak.count({
      where: {
        organizationId,
        archived: false,
        status: { notIn: ["ferdig", "arkivert"] },
        deadline: { lt: now },
        ...(since.saker ? { updatedAt: { gt: since.saker } } : {}),
      },
    }),

    // Fakturaer: forfalte ubetalte (dueDate < now, paidAt null, status != cancelled)
    prisma.invoice.count({
      where: {
        organizationId,
        status: { not: "cancelled" },
        paidAt: null,
        dueDate: { lt: now, not: null },
      },
    }),
    prisma.invoice.count({
      where: {
        organizationId,
        status: { not: "cancelled" },
        paidAt: null,
        dueDate: { lt: now, not: null },
        ...(since.fakturaer ? { updatedAt: { gt: since.fakturaer } } : {}),
      },
    }),

    // Kalender: milepæler i dag eller neste 24t som ikke er ferdige
    prisma.milestone.count({
      where: {
        sak: { organizationId, archived: false },
        completedAt: null,
        dueDate: { lte: in24h },
      },
    }),
    prisma.milestone.count({
      where: {
        sak: { organizationId, archived: false },
        completedAt: null,
        dueDate: { lte: in24h },
        ...(since.kalender ? { createdAt: { gt: since.kalender } } : {}),
      },
    }),

    // Klistrelapper: remindAt passert, ikke notifisert (eller bare ikke notifisert siden last-visit)
    prisma.stickyNote.count({
      where: {
        userId,
        remindAt: { lt: now, not: null },
        notifiedAt: null,
      },
    }),
    prisma.stickyNote.count({
      where: {
        userId,
        remindAt: { lt: now, not: null },
        notifiedAt: null,
        ...(since.klistrelapper ? { updatedAt: { gt: since.klistrelapper } } : {}),
      },
    }),

    // Team-invitasjoner som er rettet til denne brukerens epost og ennå ikke akseptert
    user
      ? prisma.teamInvite.count({
          where: {
            email: user.email,
            acceptedAt: null,
            expiresAt: { gt: now },
          },
        })
      : Promise.resolve(0),
  ]);

  return res.json({
    counts: {
      foresporsler:    { total: foresporslerTotal,  unread: foresporslerUnread },
      saker:           { total: sakerTotal,         unread: sakerUnread },
      fakturaer:       { total: fakturaerTotal,     unread: fakturaerUnread },
      kalender:        { total: kalenderTotal,      unread: kalenderUnread },
      klistrelapper:   { total: stickyTotal,        unread: stickyUnread },
      team:            { total: teamInvites,        unread: teamInvites },
    },
    serverTime: now.toISOString(),
  });
});

export default router;
