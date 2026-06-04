/** @type {import('next').NextConfig} */

// Security headers, CSP håndteres her (helmet kjører API-only).
// Bruker rimelig strenge regler som matcher hva vi faktisk laster:
//   - Egne JS/CSS chunks (self)
//   - Google Fonts
//   - Umami Cloud (analytics)
//   - Plausible (legacy, kan fjernes når Umami er bekreftet eneste)
//   - Sakspilot API (rewrites går via /api/, samme origin, OK)
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cloud.umami.is https://plausible.io;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://www.google.com https://*.googleusercontent.com https://cdn.simpleicons.org blob:;
  connect-src 'self' https://api.sakspilot.no https://cloud.umami.is https://plausible.io https://api.anthropic.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspHeader },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // skjul X-Powered-By: Next.js
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
