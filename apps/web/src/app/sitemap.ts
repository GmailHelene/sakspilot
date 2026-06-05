import type { MetadataRoute } from 'next';

/**
 * sitemap.xml for sakspilot.no
 *
 * Liste over OFFENTLIGE sider Google + Bing skal indeksere.
 * Innloggede sider (/saker, /klienter, /fakturaer osv.) er disallowed i
 * robots.ts. Synk: hvis du legger til en ny innlogget rute, oppdater
 * BAADE robots.ts (disallow) og denne fila (ikke ta den med her).
 *
 * For aa oppdatere: legg til ny route, push, og Google plukker den opp
 * neste gang den crawler (typisk innen 24-72 timer). Bekreft i Google
 * Search Console under "Sitemaps".
 *
 * Oppdatert 5. juni 2026: lagt til /portal/login (klient-portal landing).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://sakspilot.no';
  const now = new Date();

  return [
    // Hovedside, viktigst, hoeyest prioritet
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // Prisside, viktig konverteringsmaal
    {
      url: `${base}/priser`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Sammenligning, long-tail SEO ('Sakspilot vs Tripletex' osv)
    {
      url: `${base}/sammenligning`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    // Registreringssiden, viktig konverteringsmaal
    {
      url: `${base}/registrer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Last ned-side, Windows + Mac + Linux desktop-app
    {
      url: `${base}/last-ned`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Personvernerklaeringen, viktig for tillit + GDPR
    {
      url: `${base}/personvern`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Login-siden, eksisterende brukere
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Klient-portal-landing (klienter som logger inn via egen lenke fra
    // frilanser). Lavere prio enn hovedlogin, men boer vaere kjent for
    // Google sa klienter ikke landerer paa 404 fra sok.
    {
      url: `${base}/portal/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    // Glemt passord (lav prioritet, men boer vaere kjent for Google)
    {
      url: `${base}/glemt-passord`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
