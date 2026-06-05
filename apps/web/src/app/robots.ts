import type { MetadataRoute } from 'next';

/**
 * robots.txt - styrer hva Google + Bing skal crawle.
 *
 * Synkronisert med sitemap.ts: alt som STAR i sitemap er allow,
 * alt annet (innloggede ruter, admin, delte private lenker) er disallow.
 *
 * Oppdatert 5. juni 2026: lagt til alle nye innloggede ruter
 * (forespoersler, fakturaer, regnskap, mva-rapport, statistikk, gantt,
 * feedback, admin/*, portal/* private og delt/* private).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/login',
          '/registrer',
          '/personvern',
          '/priser',
          '/sammenligning',
          '/last-ned',
          '/glemt-passord',
          '/portal/login',
          '/portal/glemt-passord',
        ],
        disallow: [
          // Innloggede SaaS-ruter
          '/hjem',
          '/saker',
          '/klienter',
          '/foresporsler',
          '/fakturaer',
          '/regnskap',
          '/mva-rapport',
          '/statistikk',
          '/kalender',
          '/tidslinje',
          '/gantt',
          '/klistrelapper',
          '/agenter',
          '/rapport',
          '/innstillinger',
          '/feedback',
          // Admin-verktoy bare for pilot-admin
          '/admin/',
          // Klient-portal-innhold (login og glemt-passord er allowed over)
          '/portal',
          '/portal/fakturaer',
          '/portal/accept-invite',
          // Reset-passord-lenker er per-token, ikke crawlable
          '/reset-passord',
          // Team-invite-lenker er per-token, ikke crawlable
          '/team-invite',
          // Delte sak-lenker skal ikke indekseres (private snapshots)
          '/delt/',
          // API-ruter via Next.js rewrite (proxiet til api.sakspilot.no)
          '/api/',
        ],
      },
    ],
    sitemap: 'https://sakspilot.no/sitemap.xml',
    host: 'https://sakspilot.no',
  };
}
