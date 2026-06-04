/**
 * Team-routes, listing/invite/management av team-medlemmer i samme org.
 *
 * Roller (eksisterende):
 *   owner , full tilgang, eneste rolle som kan invitere/fjerne/endre roller
 *   admin , vanlig medlem med ekstra admin-rettigheter (per definisjon)
 *   member, vanlig medlem
 *
 * Sikkerhetsprinsipper (samme mønster som klient-portal):
 *   - bcrypt-hash av token i DB (klartekst KUN i e-posten)
 *   - 7 dagers utløp
 *   - Aksept er idempotent, hvis allerede akseptert eller utløpt, feiler
 *   - Konstant-tids-respons mot enumerering
 *   - Audit-log på alle mutasjoner (invited, accepted, removed, role_changed,
 *     invite_revoked)
 *   - Beskytt mot å slette siste owner i org (kan låse org permanent)
 *   - Beskytt mot å endre sin egen rolle (må gå via annen owner)
 *
 * Multi-tenancy: alle queries filtreres på session.organizationId, cross-org
 * tilgang er umulig fordi tokenet i JWT er bundet til org.
 *
 * Plan-gating: Solo-plan får 402 på POST /invites (kun pro/team-plan har team).
 * Pilot-orgs (Organization.pilotUntil > now) omgår dette inntil betaling er live.
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  constantTimeDelay,
  SakspilotSession,
} from "../services/auth";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendEmail, teamInviteEmail } from "../lib/email";

const router = Router();

// Maskerer e-post for logging (GDPR/PII): "kari.normann@example.com" -> "kar***@example.com".
function maskEmail(e: string): string {
  if (!e || typeof e !== "string") return "***@unknown";
  const [l, d] = e.split("@");
  return (l.slice(0, 3) + "***@" + (d || "unknown"));
}
router.use(requireAuth);

// ── Schemas ─────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().email("Ugyldig e-postadresse").max(200),
  role: z.enum(["member", "admin"]).default("member"),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(32).max(200),
  name: z.string().min(1, "Skriv inn navn").max(120),
  password: z.string().min(12, "Passordet må være minst 12 tegn"),
});

const ChangeRoleSchema = z.object({
  role: z.enum(["owner", "member", "admin"]),
});

// ── Hjelpere ────────────────────────────────────────────────────

/**
 * Sjekker om en org kan invitere team-medlemmer.
 * - Pilot-orgs (pilotUntil > now): alltid OK
 * - Plan = pro eller team: OK
 * - Plan = solo: 402 Payment Required
 */
async function canInviteTeam(organizationId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, pilotUntil: true },
  });
  if (!org) return { ok: false, reason: "Organisasjonen finnes ikke" };
  // Pilot bypasser alle plan-sjekker
  if (org.pilotUntil && org.pilotUntil > new Date()) return { ok: true };
  if (org.plan === "pro" || org.plan === "team") return { ok: true };
  return {
    ok: false,
    reason: "Team-funksjonen krever pro- eller team-plan. Oppgrader på /priser.",
  };
}

// ── GET /team/members ───────────────────────────────────────────
//
// Lister alle brukere i samme organisasjon. Returnerer kun trygge felter , 
// IKKE passwordHash, passwordResetTokenHash, tokenVersion eller andre interne
// auth-felter. Egen User kan se sin egen rad (markeres ikke spesielt).

router.get("/members", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const members = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return res.json({ members, total: members.length });
});

// ── GET /team/invites ───────────────────────────────────────────
//
// Pending invites, acceptedAt = null OG expiresAt > now. Utløpte invites
// vises ikke i UI (de er døde uansett).

router.get("/invites", async (req: Request, res: Response) => {
  const { organizationId } = req.session!;
  const invites = await prisma.teamInvite.findMany({
    where: {
      organizationId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ invites, total: invites.length });
});

// ── POST /team/invites ──────────────────────────────────────────
//
// Krever owner-rolle. Plan-gating først (solo → 402). Sjekker at e-posten
// ikke allerede er User i samme org (409). Genererer crypto random token,
// lagrer bcrypt-hash, sender e-post. Upsert på (organizationId, email) , 
// re-invite overskriver gammel pending.

router.post(
  "/invites",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = req.session!;
    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Ugyldig input",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const emailNorm = parsed.data.email.toLowerCase().trim();
    const role = parsed.data.role;

    // Plan-gating
    const gate = await canInviteTeam(organizationId);
    if (!gate.ok) {
      return res.status(402).json({
        error: "Plan-grense",
        message: gate.reason,
      });
    }

    // Kollisjons-sjekk: e-post må ikke allerede være User et eller annet sted.
    // Vi tillater ikke å invitere noen som allerede er User i SAMME org
    // (tydelig 409). For brukere i andre orgs returnerer vi også 409 fordi
    // User.email er @unique globalt, vi kan ikke lage en ny rad uansett.
    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true, organizationId: true },
    });
    if (existing) {
      if (existing.organizationId === organizationId) {
        return res.status(409).json({
          error: "Allerede medlem",
          message: "Denne e-posten er allerede et team-medlem i organisasjonen.",
        });
      }
      return res.status(409).json({
        error: "E-post er i bruk",
        message:
          "E-postadressen er allerede knyttet til en konto. Brukeren må slette eller endre den eksisterende kontoen først.",
      });
    }

    // Hent inviter-navn for e-posten
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await hashPassword(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 86400000); // 7 dager

    // Upsert, én aktiv invite per (org, email). Re-invite overskriver gammel,
    // resetter acceptedAt så en gammel akseptert invite ikke blokkerer (selv om
    // det i praksis ikke kan skje, fordi aksept skaper User og denne sjekken
    // ovenfor da returnerer 409).
    await prisma.teamInvite.upsert({
      where: {
        organizationId_email: { organizationId, email: emailNorm },
      },
      create: {
        organizationId,
        invitedByUserId: userId,
        email: emailNorm,
        role,
        tokenHash,
        expiresAt,
      },
      update: {
        invitedByUserId: userId,
        role,
        tokenHash,
        expiresAt,
        acceptedAt: null,
        acceptedByUserId: null,
        createdAt: new Date(),
      },
    });

    const webOrigin = process.env.WEB_ORIGIN || "https://sakspilot.no";
    const acceptUrl = `${webOrigin}/team-invite?token=${rawToken}`;

    let emailSent = false;
    const sendResult = await sendEmail(
      teamInviteEmail({
        inviterName: inviter?.name || req.session!.name,
        organizationName: org?.name || "Sakspilot",
        recipientEmail: emailNorm,
        role,
        acceptUrl,
        expiresAt,
      })
    );
    emailSent = sendResult.ok;
    if (!sendResult.ok) {
      console.log(
        `[team invite] SMTP fallback - invite-lenke for ${maskEmail(emailNorm)}: ${acceptUrl}`
      );
    }

    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action: "team.invited",
        entityType: "team_invite",
        entityId: emailNorm,
        metadata: { email: emailNorm, role, expiresAt: expiresAt.toISOString() },
      },
    });

    // _devAcceptUrl bare for ikke-prod ELLER hvis SMTP feilet (siste utvei)
    const showDevUrl = process.env.NODE_ENV !== "production" || !emailSent;
    return res.status(201).json({
      ok: true,
      message: `Invitasjon sendt til ${emailNorm}`,
      ...(showDevUrl ? { _devAcceptUrl: acceptUrl } : {}),
    });
  }
);

// ── DELETE /team/invites/:inviteId ──────────────────────────────
//
// Owner kan slette pending invite. Hvis allerede akseptert, 404 (invite er
// "borte"). Aldri-akseptert + utløpt invite kan også slettes (rydding).

router.delete(
  "/invites/:inviteId",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = req.session!;
    const invite = await prisma.teamInvite.findFirst({
      where: { id: req.params.inviteId, organizationId },
    });
    if (!invite) return res.status(404).json({ error: "Invitasjon ikke funnet" });
    if (invite.acceptedAt) {
      return res.status(409).json({
        error: "Allerede akseptert",
        message:
          "Denne invitasjonen er allerede tatt i bruk. Slett brukeren via Medlemmer hvis du vil fjerne tilgangen.",
      });
    }
    await prisma.teamInvite.delete({ where: { id: invite.id } });
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action: "team.invite_revoked",
        entityType: "team_invite",
        entityId: invite.id,
        metadata: { email: invite.email },
      },
    });
    return res.json({ ok: true });
  }
);

// ── POST /team/invites/accept ───────────────────────────────────
//
// PUBLIC endpoint (ingen requireAuth). Aksepterer invite-token, oppretter
// User i samme org, returnerer JWT så bruker er logget inn direkte.
//
// Mønster portet fra klient-portal accept-invite:
//   - Hent ALLE aktive (ikke-aksepterte, ikke-utløpte) invites
//   - bcrypt.compare token mot hver, i praksis er det få samtidige
//   - Hvis match: opprett User med samme organizationId + invite.role,
//     marker invite som acceptedAt + acceptedByUserId
//   - Konstant-tids-respons (delay før error-response) mot token-enumerering
//
// VIKTIG: Plasseres FØR router.use(requireAuth) i index? Nei, vi monter
// hele teamRouter med requireAuth, men dette endepunktet trenger ingen
// session. Vi hopper over requireAuth eksplisitt ved å bypasse middleware:
// vi monter den utenfor via egen path i index.ts.

// ── PATCH /team/members/:userId/role ────────────────────────────
//
// Endrer en brukers rolle. Owner-only. Sjekker:
//   - Kan ikke endre EGEN rolle (forhindre at owner ved uhell degraderer seg)
//   - Hvis target er owner: må ikke være SISTE owner (eller andre må forfremmes
//     først via egen flyt)

router.patch(
  "/members/:userId/role",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId: actorId } = req.session!;
    const targetId = req.params.userId;

    if (targetId === actorId) {
      return res.status(400).json({
        error: "Kan ikke endre egen rolle",
        message:
          "Be en annen owner endre rollen din. Du kan ikke degradere deg selv.",
      });
    }

    const parsed = ChangeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Ugyldig input",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const newRole = parsed.data.role;

    const target = await prisma.user.findFirst({
      where: { id: targetId, organizationId },
      select: { id: true, role: true, email: true },
    });
    if (!target) return res.status(404).json({ error: "Bruker ikke funnet" });

    // Hvis target er en owner og blir degradert: må være minst én annen owner
    if (target.role === "owner" && newRole !== "owner") {
      const ownerCount = await prisma.user.count({
        where: { organizationId, role: "owner" },
      });
      if (ownerCount <= 1) {
        return res.status(409).json({
          error: "Siste owner",
          message:
            "Kan ikke degradere siste owner i organisasjonen. Forfremme en annen til owner først.",
        });
      }
    }

    if (target.role === newRole) {
      return res.json({ ok: true, message: "Rollen er allerede satt" });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: newRole },
    });

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        organizationId,
        action: "team.role_changed",
        entityType: "user",
        entityId: target.id,
        metadata: { from: target.role, to: newRole, email: target.email },
      },
    });

    return res.json({ ok: true });
  }
);

// ── DELETE /team/members/:userId ────────────────────────────────
//
// Owner-only. Fjerner medlem. Sjekker:
//   - Kan ikke fjerne seg selv (egen flyt: /me/delete)
//   - Hvis target er owner: må ikke være siste owner

router.delete(
  "/members/:userId",
  requireRole("owner"),
  async (req: Request, res: Response) => {
    const { organizationId, userId: actorId } = req.session!;
    const targetId = req.params.userId;

    if (targetId === actorId) {
      return res.status(400).json({
        error: "Kan ikke fjerne deg selv",
        message:
          "Bruk Sikkerhet → Slett konto hvis du vil fjerne din egen tilgang.",
      });
    }

    const target = await prisma.user.findFirst({
      where: { id: targetId, organizationId },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!target) return res.status(404).json({ error: "Bruker ikke funnet" });

    if (target.role === "owner") {
      const ownerCount = await prisma.user.count({
        where: { organizationId, role: "owner" },
      });
      if (ownerCount <= 1) {
        return res.status(409).json({
          error: "Siste owner",
          message:
            "Kan ikke fjerne siste owner. Forfremme en annen til owner først.",
        });
      }
    }

    // Cascade: timeEntries kobles fra (sakId beholdes hvis vi hadde
    // SetNull, userId er Cascade i schema, så time-entries SLETTES sammen
    // med brukeren). For å beholde historikk anbefales arkivering på sikt.
    // Inntil videre: cascade-delete (matcher User-modellens onDelete: Cascade
    // i alle relasjoner).
    await prisma.user.delete({ where: { id: target.id } });

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        organizationId,
        action: "team.member_removed",
        entityType: "user",
        entityId: target.id,
        metadata: { email: target.email, name: target.name, role: target.role },
      },
    });

    return res.json({ ok: true });
  }
);

export default router;

// ────────────────────────────────────────────────────────────────
// Separat router for PUBLIC accept-invite (ingen requireAuth).
// Monteres på /team-invites/accept i index.ts utenfor team-routeren.
// ────────────────────────────────────────────────────────────────
export const acceptInviteRouter = Router();

acceptInviteRouter.post(
  "/accept",
  async (req: Request, res: Response) => {
    const parsed = AcceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      await constantTimeDelay();
      return res.status(400).json({
        error: "Ugyldig input - passordet må være minst 12 tegn",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const { token, name, password } = parsed.data;

    // Hent alle aktive invites, bcrypt.compare mot hver. I praksis er antall
    // pending invites lavt (vanligvis < 10 per org, total < 200). Hvis dette
    // vokser kraftig: legg inn 8-char-prefix av tokenet som indekserbart hint.
    const candidates = await prisma.teamInvite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      include: { organization: { select: { id: true, name: true } } },
    });

    let matched: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      if (await verifyPassword(token, c.tokenHash)) {
        matched = c;
        break;
      }
    }

    if (!matched) {
      await constantTimeDelay();
      return res.status(400).json({
        error: "Lenken er ugyldig eller utløpt. Be om en ny invitasjon.",
      });
    }

    const emailNorm = matched.email.toLowerCase().trim();

    // En bruker kan ha blitt opprettet med samme e-post via en annen vei
    // mellom invitasjon og aksept (uvanlig, men teoretisk mulig). Sjekk
    // global User.email @unique-konflikt.
    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({
        error:
          "En bruker med denne e-posten finnes allerede. Logg inn vanlig i stedet for å akseptere invitasjonen.",
      });
    }

    const passwordHash = await hashPassword(password);

    // Atomisk: opprett User + marker invite akseptert + audit-log
    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailNorm,
          passwordHash,
          name: name.trim(),
          role: matched!.role,
          organizationId: matched!.organizationId,
          lastLoginAt: new Date(),
          // Trial-felter brukes IKKE for team-medlemmer, de er på org-eierens
          // plan. Settes null så det er tydelig at de ikke har egen trial.
          trialEndsAt: null,
        },
      });
      await tx.teamInvite.update({
        where: { id: matched!.id },
        data: {
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: matched!.organizationId,
          action: "team.invite_accepted",
          entityType: "user",
          entityId: user.id,
          metadata: { invitedByUserId: matched!.invitedByUserId, role: matched!.role },
        },
      });
      return { user };
    });

    const session: SakspilotSession = {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role as SakspilotSession["role"],
      tv: user.tokenVersion,
    };
    const jwtToken = createSessionToken(session);

    return res.status(201).json({
      ok: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: matched.organization.name,
      },
    });
  }
);
