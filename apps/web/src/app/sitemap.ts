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
    // Hovedside — viktigst, høyest prioritet
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // FAQ er en seksjon på hovedsiden — fragment-URL for å hjelpe Google
    // forstå at innholdet er strukturert (selv om de ikke indekserer fragments)
    {
      url: `${base}/#faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Registreringssiden — viktig konverteringsmål
    {
      url: `${base}/registrer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Login-siden — eksisterende brukere
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Personvernerklæringen — viktig for tillit + GDPR
    {
      url: `${base}/personvern`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Prisside — viktig konverteringsmål
    {
      url: `${base}/priser`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
  ];
}
