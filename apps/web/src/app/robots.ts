import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/registrer', '/personvern', '/priser'],
        disallow: [
          '/hjem',
          '/saker',
          '/klienter',
          '/kalender',
          '/tidslinje',
          '/klistrelapper',
          '/agenter',
          '/rapport',
          '/innstillinger',
          '/delt/', // delte sak-lenker skal ikke indekseres (privat)
        ],
      },
    ],
    sitemap: 'https://sakspilot.no/sitemap.xml',
    host: 'https://sakspilot.no',
  };
}
