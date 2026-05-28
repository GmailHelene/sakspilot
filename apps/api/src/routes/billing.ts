/**
 * Billing-routes — subscription-status + manuell admin.
 *
 *   GET  /billing/status — hvor er kontoen i livssyklusen?
 *
 * STATUS:
 *   - I pilotperioden: alle orgs har pilotUntil > now → returnerer "pilot"
 *   - Etter pilot: trialEndsAt > now → "trial"
 *   - Etter trial: subscription.status === 'active' → "active"
 *   - Ellers → "expired"
 *
 * Stripe-integrasjon kommer senere (POST /billing/create-checkout-session osv.)
 */
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/status", async (req: Request, res: Response) => {
  const session = req.session!;
  const now = new Date();

  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { trialEndsAt: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { pilotUntil: true, plan: true, subscription: true },
    }),
  ]);

  if (!user || !org) {
    return res.status(404).json({ error: "Bruker eller org ikke funnet" });
  }

  // Pilot-modus overstyrer alt
  const inPilot = org.pilotUntil && org.pilotUntil > now;
  const pilotDaysLeft = inPilot
    ? Math.ceil((org.pilotUntil!.getTime() - now.getTime()) / 86400000)
    : 0;

  // Trial-status (relevant ETTER pilot)
  const inTrial = user.trialEndsAt && user.trialEndsAt > now;
  const trialDaysLeft = inTrial
    ? Math.ceil((user.trialEndsAt!.getTime() - now.getTime()) / 86400000)
    : 0;

  // Subscription-status
  const sub = org.subscription;
  const hasActiveSubscription =
    sub && sub.status === "active" && sub.currentPeriodEnd > now;

  // Slutt-status
  let status: "pilot" | "trial" | "active" | "expired" | "past_due";
  if (inPilot) status = "pilot";
  else if (hasActiveSubscription) status = "active";
  else if (inTrial) status = "trial";
  else if (sub?.status === "past_due") status = "past_due";
  else status = "expired";

  return res.json({
    status,
    pilotUntil: org.pilotUntil,
    pilotDaysLeft,
    trialEndsAt: user.trialEndsAt,
    trialDaysLeft,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          invoiceMethod: sub.invoiceMethod,
        }
      : null,
    // Skal vi vise "snart må du betale"-banner i UI?
    showWarning:
      (inPilot && pilotDaysLeft <= 14) ||
      (!inPilot && inTrial && trialDaysLeft <= 3) ||
      status === "past_due" ||
      status === "expired",
  });
});

export default router;
