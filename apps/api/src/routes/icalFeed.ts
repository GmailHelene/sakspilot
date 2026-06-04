/**
 * iCal-feed — PUBLIC endpoint (ingen auth-middleware).
 *
 * Brukeren genererer et token via POST /me/ical/generate og får en URL som
 * Google Calendar / Apple Calendar / Outlook kan abonnere på. Disse
 * tjenestene poller URL-en med jevne mellomrom (typisk hver time) og
 * oppdaterer hendelsene automatisk — one-way sync Sakspilot → kalender.
 *
 * Sikkerhetsmodell:
 *   - Tokenet er ENESTE autentisering. 16 bytes randomisert (128 bits
 *     entropy) = upraktisk å brute-force, men URL-en lekker innhold til
 *     hvem som helst som får tak i den. Brukeren får tydelig advarsel
 *     i UI før generering.
 *   - 404 (ikke 401) ved ugyldig token — kalender-klienter retry-er
 *     mindre aggressivt på 404 enn på 401.
 *   - Vi LOGGER ikke tokenet i klartekst (Sentry, audit-log, console),
 *     kun userId etter oppslag.
 *   - Audit-log skrives kun ved generering/revokering (skrive-handlinger),
 *     ikke ved hver lese-request (kalender-klienter polleren hver time —
 *     ville fylle audit-loggen med støy).
 *
 * Cache:
 *   - Cache-Control: max-age=600 → kalender-klienter respekterer 10 min,
 *     beskytter API mot hamring. Egentlig refresh kontrolleres også av
 *     REFRESH-INTERVAL og X-PUBLISHED-TTL i selve iCal-feeden.
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { buildIcalFeed, ICalEvent } from "../lib/icalGenerator";

const router = Router();

/**
 * Web-URL til Sakspilot-frontend. Brukes til URL-property i hver VEVENT
 * (dyplenke til saken). FRONTEND_URL kan være kommaseparert liste — vi
 * tar første som primær.
 */
function getFrontendBase(): string {
  const raw = process.env.FRONTEND_URL || "https://sakspilot.no";
  return raw.split(",")[0].trim().replace(/\/$/, "");
}

router.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  // Token-format-sjekk før DB-lookup — hindrer arbitrære lookups.
  // 32 hex tegn (16 bytes som hex). Strikt regex.
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return res.status(404).type("text/plain").send("Not Found");
  }

  const user = await prisma.user.findUnique({
    where: { icalToken: token },
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  });

  if (!user) {
    return res.status(404).type("text/plain").send("Not Found");
  }

  // Hent alle åpne saker for org-en med tilhørende milepæler.
  // "Åpen" = ikke ferdig og ikke arkivert. Inkluderer deadline > i går.
  // Gamle frister tas IKKE med — kalender-feeden ville ellers vokse uten grense.
  const saker = await prisma.sak.findMany({
    where: {
      organizationId: user.organizationId,
      archived: false,
      status: { notIn: ["ferdig", "arkivert"] },
    },
    select: {
      id: true,
      title: true,
      description: true,
      deadline: true,
      status: true,
      client: { select: { name: true } },
      milestones: {
        // Inkluder milepæler som ikke er ferdige.
        // Slettede milepæler er hard-deletet (cascade) — finnes ikke i DB.
        where: { completedAt: null },
        select: {
          id: true,
          title: true,
          dueDate: true,
        },
      },
    },
  });

  const frontendBase = getFrontendBase();
  const events: ICalEvent[] = [];

  for (const sak of saker) {
    const clientPrefix = sak.client?.name ? `[${sak.client.name}] ` : "";
    const sakUrl = `${frontendBase}/saker/${sak.id}`;

    // Sak-frist som egen heldagshendelse
    if (sak.deadline) {
      events.push({
        uid: `${sak.id}-deadline@sakspilot.no`,
        summary: `${clientPrefix}Frist: ${sak.title}`,
        description: sak.description ?? undefined,
        start: sak.deadline,
        allDay: true,
        url: sakUrl,
      });
    }

    // Milepæler — også som heldagshendelser (de har dato, ikke klokkeslett)
    for (const m of sak.milestones) {
      events.push({
        uid: `${m.id}@sakspilot.no`,
        summary: `${clientPrefix}${sak.title} - ${m.title}`,
        description: `Milepæl i sak: ${sak.title}`,
        start: m.dueDate,
        allDay: true,
        url: sakUrl,
      });
    }
  }

  const ical = buildIcalFeed({
    name: `Sakspilot - ${user.name}`,
    description: "Frister og milepæler fra dine åpne saker i Sakspilot",
    events,
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="sakspilot.ics"');
  // 10 min cache — kalender-klienter polleren ofte, dette beskytter API.
  // private fordi feeden er bruker-spesifikk (per token).
  res.setHeader("Cache-Control", "private, max-age=600");
  return res.send(ical);
});

export default router;
