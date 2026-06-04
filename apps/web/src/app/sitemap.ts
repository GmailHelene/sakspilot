import type { MetadataRoute } from 'next';

/**
 * sitemap.xml for sakspilot.no
 *
 * Liste over OFFENTLIGE sider Google + Bing skal indeksere.
 * Innloggede sider (/saker, /klienter osv.) er disallowed i robots.ts.
 *
 * For å oppdatere: legg til ny route, push, og Google plukker den opp
 * neste gang den crawler (typisk innen 24-72 timer).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://sakspilot.no';
  const now = new Date();

  return [
    // Hovedside, viktigst, høyest prioritet
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // Registreringssiden, viktig konverteringsmål
    {
      url: `${base}/registrer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Login-siden, eksisterende brukere
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Personvernerklæringen, viktig for tillit + GDPR
    {
      url: `${base}/personvern`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Prisside, viktig konverteringsmål
    {
      url: `${base}/priser`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Last ned-side, Windows desktop-app
    {
      url: `${base}/last-ned`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Sammenligning, long-tail SEO ('Sakspilot vs Tripletex' osv)
    {
      url: `${base}/sammenligning`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Glemt passord (lav prioritet, men bør være kjent for Google)
    {
      url: `${base}/glemt-passord`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
