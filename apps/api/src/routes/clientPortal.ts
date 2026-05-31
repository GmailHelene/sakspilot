/**
 * Klient-portal-routes.
 *
 * Egen flow for KLIENTER (kjøperne av frilanserens tjenester) — IKKE for
 * frilanseren selv. Klienter logger inn med e-post + passord, ser sine egne
 * saker på tvers av alle prosjekter, milepæler og fakturahistorikk. Helt
 * separat scope fra User-auth (se services/auth.ts).
 *
 * Sikkerhetsprinsipper:
 *   - JWT med scope="client" (egen verify/sign — User-token virker ikke her,
 *     og klient-token virker ikke mot User-routes)
 *   - Cross-client lekkasje umulig: alle queries filtreres på
 *     sak.clientId === req.clientSession.clientId
 *   - Eksponerer KUN trygge felter (title, status, milepæler, fakturasummer)
 *     — IKKE matchingRules, timeEntries-details, audit-logg, interne notater
 *   - bcrypt 12 rounds, samme som User
 *   - Konstant-tids-respons ved feilet login (mot e-post-enumerasjon)
 *   - Token-versjon i JWT (klient.tokenVersion) → revoke ved passordbytte
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  createClientSessionToken,
  constantTimeDelay,
  SakspilotClientSession,
} from "../services/auth";
import { requireClientAuth } from "../middleware/auth";
import { sendEmail, clientPortalPasswordResetEmail } from "../lib/email";

const router = Router();

/**
 * Bygger en branding-blob basert på req.customDomain. Returnerer null hvis
 * requesten kom inn på default sakspilot.no — da skal frontend bruke standard
 * Sakspilot-branding.
 *
 * Returnert form gjenspeiler CustomDomainInfo, men begrenset til felter
 * frontend trenger for å whitelabele portal-UI (ikke organizationId — det
 * lekker org-id til klienter på andre orgs ved feilkonfig).
 */
function getBrandingFromRequest(req: Request) {
  if (!req.customDomain) return null;
  return {
    hostname: req.customDomain.hostname,
    brandName: req.customDomain.brandName,
    brandTagline: req.customDomain.brandTagline,
    brandPrimaryColor: req.customDomain.brandPrimaryColor,
    brandLogoUrl: req.customDomain.brandLogoUrl,
  };
}

// ── Schemas ─────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(12, "Passordet må være minst 12 tegn"),
});

const ForgotSchema = z.object({
  email: z.string().email().max(200),
});

const ResetSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: z.string().min(12, "Passordet må være minst 12 tegn"),
});

// ── POST /client-portal/login ───────────────────────────────────

router.post("/login", async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    await constantTimeDelay();
    return res.status(400).json({ error: "Fyll inn e-post og passord" });
  }

  const { email, password } = parsed.data;
  const client = await prisma.client.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { organization: { select: { name: true } } },
  });

  if (!client || !client.passwordHash || !client.portalEnabled) {
    await constantTimeDelay();
    return res.status(401).json({ error: "Feil e-post eller passord" });
  }

  const valid = await verifyPassword(password, client.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Feil e-post eller passord" });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { lastLoginAt: new Date() },
  });

  const session: SakspilotClientSession = {
    clientId: client.id,
    organizationId: client.organizationId,
    email: client.email!,
    name: client.name,
    scope: "client",
    tv: client.tokenVersion,
  };

  const token = createClientSessionToken(session);

  await prisma.auditLog.create({
    data: {
      organizationId: client.organizationId,
      action: "client_portal.login",
      entityType: "client",
      entityId: client.id,
    },
  });

  return res.json({
    ok: true,
    token,
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      organizationName: client.organization.name,
    },
    branding: getBrandingFromRequest(req),
  });
});

// ── GET /client-portal/me ───────────────────────────────────────

router.get("/me", requireClientAuth, async (req: Request, res: Response) => {
  const { clientId } = req.clientSession!;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { organization: { select: { name: true } } },
  });

  if (!client || !client.portalEnabled) {
    return res.status(401).json({ error: "Klienten finnes ikke lenger" });
  }

  return res.json({
    id: client.id,
    name: client.name,
    contactEmail: client.email,
    organizationName: client.organization.name,
    branding: getBrandingFromRequest(req),
  });
});

// ── POST /client-portal/accept-invite ───────────────────────────
//
// Token kommer fra klienten — vi henter ALLE ikke-aksepterte, ikke-utløpte
// invites og bcrypt.compare mot tokenHash for hver. Vanligvis er det få;
// klient-portalen er en liten flate. Hvis det vokser legger vi inn et
// klart-tekst-hint i tokenet for å indeksere.
router.post("/accept-invite", async (req: Request, res: Response) => {
  const parsed = AcceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input — passord må være minst 12 tegn",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { token, password } = parsed.data;

  // Hent kandidater (alle aktive invites) — vi bcrypt-compare mot hver
  const candidates = await prisma.clientPortalInvite.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { client: true },
  });

  let matched: typeof candidates[number] | null = null;
  // bcrypt.compare er konstant-tids per kall → vi MÅ sjekke alle, men
  // i praksis vil dette være < 20 rader. Hvis det blir > 1000: legg inn
  // 8-char-prefix av tokenet som indekserbart hint-felt.
  for (const c of candidates) {
    if (await verifyPassword(token, c.tokenHash)) {
      matched = c;
      break;
    }
  }

  if (!matched) {
    return res.status(400).json({
      error: "Lenken er ugyldig eller utløpt. Be frilanseren sende ny invitasjon.",
    });
  }

  const client = matched.client;
  if (!client.contactEmail) {
    return res.status(400).json({
      error: "Klienten mangler kontakt-e-post. Frilanseren må fylle inn denne først.",
    });
  }

  // E-posten må være unik på Client.email — frilanseren kan ha brukt
  // contactEmail som ikke kolliderer, men teoretisk kan to klienter ha
  // samme e-post. Failer i så fall med tydelig melding.
  const emailNorm = client.contactEmail.toLowerCase().trim();
  const conflict = await prisma.client.findFirst({
    where: { email: emailNorm, id: { not: client.id } },
    select: { id: true },
  });
  if (conflict) {
    return res.status(409).json({
      error:
        "Denne e-postadressen er allerede knyttet til en annen klient med portal-tilgang.",
    });
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.client.update({
      where: { id: client.id },
      data: {
        email: emailNorm,
        passwordHash,
        portalEnabled: true,
        lastLoginAt: new Date(),
        // Bump tokenVersion så ev. gamle (umulige) tokens ikke virker
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.clientPortalInvite.update({
      where: { id: matched.id },
      data: { acceptedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: client.organizationId,
        action: "client_portal.invite_accepted",
        entityType: "client",
        entityId: client.id,
      },
    }),
  ]);

  // Hent oppdatert versjon for korrekt tv
  const updated = await prisma.client.findUnique({
    where: { id: client.id },
    include: { organization: { select: { name: true } } },
  });
  if (!updated) {
    return res.status(500).json({ error: "Klient forsvant under aksept" });
  }

  const session: SakspilotClientSession = {
    clientId: updated.id,
    organizationId: updated.organizationId,
    email: updated.email!,
    name: updated.name,
    scope: "client",
    tv: updated.tokenVersion,
  };

  const jwtToken = createClientSessionToken(session);

  return res.json({
    ok: true,
    token: jwtToken,
    client: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      organizationName: updated.organization!.name,
    },
    branding: getBrandingFromRequest(req),
  });
});

// ── POST /client-portal/forgot-password ─────────────────────────

router.post("/forgot-password", async (req: Request, res: Response) => {
  const parsed = ForgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Ugyldig e-post" });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const client = await prisma.client.findUnique({ where: { email } });
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 time

  if (client && client.portalEnabled) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: client.organizationId,
        action: "client_portal.password_reset_requested",
        entityType: "client",
        entityId: client.id,
      },
    });
  }

  const webOrigin = process.env.WEB_ORIGIN || "https://sakspilot.no";
  const resetUrl = `${webOrigin}/portal/reset-passord?token=${rawToken}`;

  let emailSent = false;
  if (client && client.portalEnabled) {
    const result = await sendEmail(clientPortalPasswordResetEmail(email, resetUrl));
    emailSent = result.ok;
    if (!result.ok) {
      console.log(
        `[client-portal forgot] SMTP fallback — reset-lenke for ${email}: ${resetUrl}`
      );
    }
  }

  const showDevUrl =
    client && (process.env.NODE_ENV !== "production" || !emailSent);

  return res.json({
    ok: true,
    message:
      "Hvis kontoen finnes, har vi sendt en reset-lenke til e-postadressen.",
    ...(showDevUrl ? { _devResetUrl: resetUrl } : {}),
  });
});

// ── POST /client-portal/reset-password ──────────────────────────

router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Ugyldig input — passordet må være minst 12 tegn",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const { token, newPassword } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const client = await prisma.client.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gte: new Date() },
      portalEnabled: true,
    },
  });
  if (!client) {
    return res.status(400).json({
      error: "Lenken er ugyldig eller utløpt. Be om ny reset-lenke.",
    });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.client.update({
    where: { id: client.id },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: client.organizationId,
      action: "client_portal.password_reset_completed",
      entityType: "client",
      entityId: client.id,
    },
  });

  return res.json({
    ok: true,
    message: "Passord oppdatert. Logg inn med det nye passordet.",
  });
});

// ── GET /client-portal/saker ────────────────────────────────────
//
// Lister ALLE saker der sak.clientId === innlogget klient. Cross-client-
// lekkasje sikret av WHERE-klausulen + JWT-scope-check i middleware.
// Eksponerer KUN trygge felter — IKKE matchingRules, interne notater,
// hourlyRate, folderPath, eller time-entry-detaljer.
router.get("/saker", requireClientAuth, async (req: Request, res: Response) => {
  const { clientId } = req.clientSession!;

  const saker = await prisma.sak.findMany({
    where: {
      clientId, // tett: filtrert på klient-id fra JWT, ikke fra query
      archived: false,
    },
    select: {
      id: true,
      title: true,
      saksnummer: true,
      status: true,
      deadline: true,
      createdAt: true,
      closedAt: true,
      description: true,
      milestones: {
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          title: true,
          dueDate: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Beregn progress per sak i serveren, ikke i klienten
  const enriched = saker.map((s) => {
    const total = s.milestones.length;
    const done = s.milestones.filter((m) => m.completedAt).length;
    return {
      ...s,
      progressPct: total > 0 ? Math.round((done / total) * 100) : null,
      milestonesTotal: total,
      milestonesCompleted: done,
    };
  });

  return res.json({ saker: enriched, total: enriched.length });
});

// ── GET /client-portal/saker/:sakId ─────────────────────────────
// Enkelt-sak-detalj (samme felter som /saker, men én rad).
router.get(
  "/saker/:sakId",
  requireClientAuth,
  async (req: Request, res: Response) => {
    const { clientId } = req.clientSession!;
    const sak = await prisma.sak.findFirst({
      where: { id: req.params.sakId, clientId, archived: false },
      select: {
        id: true,
        title: true,
        saksnummer: true,
        status: true,
        deadline: true,
        createdAt: true,
        closedAt: true,
        description: true,
        milestones: {
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            title: true,
            dueDate: true,
            completedAt: true,
          },
        },
      },
    });
    if (!sak) return res.status(404).json({ error: "Prosjekt ikke funnet" });

    const total = sak.milestones.length;
    const done = sak.milestones.filter((m) => m.completedAt).length;
    return res.json({
      ...sak,
      progressPct: total > 0 ? Math.round((done / total) * 100) : null,
      milestonesTotal: total,
      milestonesCompleted: done,
    });
  }
);

// ── GET /client-portal/saker/:sakId/invoices ────────────────────
//
// Fakturahistorikk for én sak. Kun draft-fakturaer skjules (klienten skal
// ikke se utkast som frilanseren ikke har sendt enda). Eksponerer
// summer + perioder, IKKE timeEntries-detaljer.
router.get(
  "/saker/:sakId/invoices",
  requireClientAuth,
  async (req: Request, res: Response) => {
    const { clientId } = req.clientSession!;

    // Bekreft først at saken tilhører klienten — ellers kan en innlogget
    // klient prøve å hente fakturaer for fremmed sak ved å gjette UUID.
    const sak = await prisma.sak.findFirst({
      where: { id: req.params.sakId, clientId },
      select: { id: true },
    });
    if (!sak) return res.status(404).json({ error: "Prosjekt ikke funnet" });

    const invoices = await prisma.invoice.findMany({
      where: {
        sakId: sak.id,
        // Klienten ser KUN exported-fakturaer — draft er internt utkast.
        status: "exported",
      },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        totalHours: true,
        totalAmount: true,
        currency: true,
        status: true,
        exportedAt: true,
        externalRef: true,
      },
      orderBy: { periodStart: "desc" },
    });

    return res.json({ invoices, total: invoices.length });
  }
);

export default router;
