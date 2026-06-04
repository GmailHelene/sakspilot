/**
 * GET /admin/pilot-stats
 *
 * Cross-tenant superadmin-statistikk for Helene som operator. Samler:
 *   - Brukere registrert (totalt, siste 7d, siste 30d)
 *   - Aktive brukere (login innen siste 7d / 30d)
 *   - Organisasjoner (totalt + per plan)
 *   - Saker/fakturaer/forespørsler totaler
 *   - GitHub-nedlastinger (cross-platform, alle releases)
 *
 * Gating: email-whitelist (helene721@gmail.com + helene@helene.cloud).
 * Ikke per-tenant data, men aggregert pilot-status sa Helene ser
 * hvor mange som tester appen uten å logge inn pa Umami separat.
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import prisma from "../lib/prisma";

const router = Router();

// Hardkodet liste med pilot-admin-emails. Cross-tenant data skal ikke vaere
// tilgjengelig for vanlige org-eiere selv om de har "owner"-rollen.
// Liten liste sa vi unngaar database-roundtrip for sjekk.
const PILOT_ADMINS = new Set([
  "helene721@gmail.com",
  "helene@helene.cloud",
]);

function requirePilotAdmin(req: Request, res: Response): boolean {
  if (!req.session) {
    res.status(401).json({ error: "Ikke innlogget" });
    return false;
  }
  if (!PILOT_ADMINS.has(req.session.email)) {
    res.status(403).json({ error: "Ingen tilgang. Cross-tenant statistikk krever pilot-admin-rolle." });
    return false;
  }
  return true;
}

// Cache GitHub-download-tall i memory i 10 min sa vi ikke hammrer GH API
let githubCache: { fetchedAt: number; data: { win: number; mac: number; linux: number; total: number; perRelease: Array<{ tag: string; downloads: number }> } } | null = null;
const GITHUB_CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchGithubDownloads(): Promise<typeof githubCache extends { data: infer D } | null ? D : never> {
  if (githubCache && Date.now() - githubCache.fetchedAt < GITHUB_CACHE_TTL_MS) {
    return githubCache.data;
  }

  try {
    // Public repo, ingen auth nodvendig
    const res = await fetch("https://api.github.com/repos/GmailHelene/sakspilot/releases?per_page=30", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "sakspilot-pilot-stats" },
    });
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    const releases = (await res.json()) as Array<{
      tag_name: string;
      assets: Array<{ name: string; download_count: number }>;
    }>;

    let win = 0, mac = 0, linux = 0;
    const perRelease: Array<{ tag: string; downloads: number }> = [];
    for (const rel of releases) {
      let releaseTotal = 0;
      for (const a of rel.assets) {
        const n = a.name.toLowerCase();
        if (n.includes("win")) win += a.download_count;
        else if (n.includes("mac") || n.includes("darwin")) mac += a.download_count;
        else if (n.includes("linux")) linux += a.download_count;
        releaseTotal += a.download_count;
      }
      perRelease.push({ tag: rel.tag_name, downloads: releaseTotal });
    }
    const data = {
      win,
      mac,
      linux,
      total: win + mac + linux,
      perRelease: perRelease.slice(0, 5), // siste 5 releases
    };
    githubCache = { fetchedAt: Date.now(), data };
    return data;
  } catch (err) {
    console.warn("[pilot-stats] GitHub download-fetch feilet:", err);
    return { win: 0, mac: 0, linux: 0, total: 0, perRelease: [] };
  }
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  if (!requirePilotAdmin(req, res)) return;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  // Parallelt: alle DB-queries pluss GitHub-fetch
  const [
    totalUsers,
    usersLast7d,
    usersLast30d,
    activeUsers7d,
    activeUsers30d,
    totalOrgs,
    orgsByPlan,
    totalSaker,
    totalInvoices,
    totalForesporsler,
    recentRegistrations,
    githubDownloads,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    prisma.organization.count(),
    prisma.organization.groupBy({
      by: ["plan"],
      _count: { _all: true },
    }),
    prisma.sak.count(),
    prisma.invoice.count(),
    prisma.foresporsel.count(),
    // Siste 10 registreringer (uten email-domene-filter, men anonymisert)
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        email: true,
        name: true,
        createdAt: true,
        lastLoginAt: true,
        organization: { select: { name: true, plan: true } },
      },
    }),
    fetchGithubDownloads(),
  ]);

  // Email-anonymisering: vis bare forste 3 tegn + domene
  const anonymizedRegistrations = recentRegistrations.map((u) => {
    const at = u.email.indexOf("@");
    const local = u.email.slice(0, at);
    const domain = u.email.slice(at);
    const shown = local.length <= 3 ? local : local.slice(0, 3) + "***";
    return {
      emailShort: shown + domain,
      name: u.name,
      orgName: u.organization?.name ?? null,
      plan: u.organization?.plan ?? null,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    };
  });

  return res.json({
    asOf: now.toISOString(),
    users: {
      total: totalUsers,
      registeredLast7d: usersLast7d,
      registeredLast30d: usersLast30d,
      activeLast7d: activeUsers7d,
      activeLast30d: activeUsers30d,
    },
    organizations: {
      total: totalOrgs,
      byPlan: orgsByPlan.map((g) => ({ plan: g.plan, count: g._count._all })),
    },
    workload: {
      sakerTotal: totalSaker,
      invoicesTotal: totalInvoices,
      foresporslerTotal: totalForesporsler,
    },
    desktopDownloads: githubDownloads,
    recentRegistrations: anonymizedRegistrations,
    links: {
      umamiDashboard: "https://cloud.umami.is/websites/bfb51e02-b13e-420f-9396-c2704965af39",
      githubReleases: "https://github.com/GmailHelene/sakspilot/releases",
    },
  });
});

export default router;
