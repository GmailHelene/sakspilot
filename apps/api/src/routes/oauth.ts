/**
 * OAuth-routes for tredjeparts-tilkoblinger.
 *
 *   POST /oauth/microsoft/start    — autentisert, returnerer consent-URL
 *   GET  /oauth/microsoft/callback — Azure sender brukeren hit etter consent
 *   DELETE /oauth/microsoft        — kobler fra (sletter GraphAccount)
 *   GET  /oauth/microsoft/status   — er konto koblet til?
 *
 * State-validering: vi signerer state med JWT_SECRET så vi vet det er vår
 * forespørsel (ikke CSRF). State inneholder userId.
 */
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../lib/crypto";
import {
  isMicrosoftConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchUserProfile,
} from "../services/microsoftGraph";

const router = Router();

// ── Auth: returner consent-URL ──────────────────────────────────
router.post("/microsoft/start", requireAuth, (req: Request, res: Response) => {
  if (!isMicrosoftConfigured()) {
    return res.status(503).json({
      error:
        "Microsoft Graph er ikke konfigurert. Be administrator sette AZURE_CLIENT_ID + AZURE_CLIENT_SECRET.",
    });
  }

  const session = req.session!;
  // Signert state — kobler tilbake til riktig user ved callback
  const state = jwt.sign(
    { userId: session.userId, t: Date.now() },
    (process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET mangler - kan ikke signere OAuth-state"); })()),
    { expiresIn: "10m" }
  );

  return res.json({ url: buildAuthUrl(state) });
});

// ── Callback: Azure sender brukeren hit ─────────────────────────
router.get("/microsoft/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const stateStr = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  // Bygg HTML-respons (popup-vinduet vi åpnet i frontend)
  function html(message: string, success: boolean) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${success ? "OK" : "Feil"}</title></head>
<body style="font-family:Inter,system-ui;padding:40px;text-align:center;background:#F8F9FB;color:#172B4D;">
  <h1 style="color:${success ? "#00B884" : "#E2445C"}">${success ? "✓ Outlook koblet til!" : "⚠ Tilkobling feilet"}</h1>
  <p>${message}</p>
  <p style="font-size:13px;color:#5E6C84;margin-top:24px;">Du kan lukke dette vinduet.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth:microsoft:${success ? "ok" : "error"}', message: ${JSON.stringify(message)} }, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body></html>`);
  }

  if (error) {
    return html(`Azure returnerte: ${error}`, false);
  }
  if (!code || !stateStr) {
    return html("Mangler code eller state.", false);
  }

  // Verifiser state
  let userId: string;
  try {
    const decoded = jwt.verify(stateStr, (process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET mangler - kan ikke signere OAuth-state"); })())) as {
      userId: string;
    };
    userId = decoded.userId;
  } catch {
    return html("Ugyldig state (utløpt eller forfalsket).", false);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchUserProfile(tokens.access_token);

    await prisma.graphAccount.upsert({
      where: { userId },
      update: {
        microsoftId: profile.id,
        email: profile.mail || profile.userPrincipalName,
        refreshToken: encrypt(tokens.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope,
      },
      create: {
        userId,
        microsoftId: profile.id,
        email: profile.mail || profile.userPrincipalName,
        refreshToken: encrypt(tokens.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope,
      },
    });

    return html(`Logget inn som ${profile.mail || profile.userPrincipalName}`, true);
  } catch (err) {
    console.error("[oauth/microsoft/callback]", err);
    return html(
      err instanceof Error ? err.message : "Ukjent feil ved token-utveksling",
      false
    );
  }
});

// ── Status: er konto koblet til? ────────────────────────────────
router.get("/microsoft/status", requireAuth, async (req: Request, res: Response) => {
  const session = req.session!;
  const account = await prisma.graphAccount.findUnique({
    where: { userId: session.userId },
    select: { id: true, email: true, lastSyncAt: true, createdAt: true },
  });

  return res.json({
    configured: isMicrosoftConfigured(),
    connected: !!account,
    account,
  });
});

// ── Koble fra ───────────────────────────────────────────────────
router.delete("/microsoft", requireAuth, async (req: Request, res: Response) => {
  const session = req.session!;
  await prisma.graphAccount.deleteMany({ where: { userId: session.userId } });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      organizationId: session.organizationId,
      action: "microsoft.disconnected",
      entityType: "graph_account",
    },
  });
  return res.json({ ok: true });
});

export default router;
