import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import PwaInit from '@/components/PwaInit';
import DesktopShortcutOverlay from '@/components/DesktopShortcutOverlay';
import DesktopAgentControls from '@/components/DesktopAgentControls';
import OnboardingModal from '@/components/OnboardingModal';
import ThemeInit from '@/components/ThemeInit';

// Tilbakemelding 4. juni: Google Fonts (Inter) returnerte 503 ved kall fra
// fonts.googleapis.com under feedback-okten. Vi self-hoster naa via next/font,
// som henter font-filene paa byggetidspunktet og serverer dem fra /_next/static.
// Resultat: ingen kjoretids-avhengighet til Google, raskere first paint,
// fungerer fortsatt offline (etter forste lasting).
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://sakspilot.no'),
  title: {
    default: 'Sakspilot - Workspace for selvstendig næringsdrivende',
    template: '%s · Sakspilot',
  },
  description:
    'Prosjekt-CRM, passiv tidsregistrering, Outlook-integrasjon og faktura - i ett verktøy. For ansvarlige søkere, arkitekter, advokater, regnskapsførere, designere og konsulenter.',
  applicationName: 'Sakspilot',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  keywords: [
    'sakshåndtering',
    'prosjektstyring',
    'tidsregistrering',
    'automatisk tidsregistrering',
    'selvstendig næringsdrivende',
    'ENK',
    'enkeltpersonforetak',
    'frilanser',
    'workspace',
    'CRM',
    'klient-CRM',
    'Tripletex',
    'Fiken',
    'Outlook',
    'Microsoft Graph',
    'AI-assistent',
    'Claude AI',
    'ansvarlig søker',
    'arkitekt',
    'advokat',
    'regnskap',
    'IT-konsulent',
    'designer',
    'GDPR',
    'EU-data',
    'norsk SaaS',
    'Sakspilot vs Tripletex',
    'Sakspilot vs Toggl',
  ],
  authors: [{ name: 'Helene Åsheim Grønberg', url: 'https://helene.cloud' }],
  creator: 'Helene Åsheim Grønberg',
  publisher: 'Sakspilot',
  openGraph: {
    type: 'website',
    locale: 'nb_NO',
    url: 'https://sakspilot.no',
    siteName: 'Sakspilot',
    title: 'Sakspilot - Workspace for selvstendig næringsdrivende',
    description:
      'Prosjekt-CRM + automatisk tidsregistrering + Outlook + AI-assistent + faktura - i ett verktøy. Gratis i pilotperioden.',
    images: [
      {
        url: '/icon-512.svg',
        width: 512,
        height: 512,
        alt: 'Sakspilot - workspace for selvstendig næringsdrivende',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sakspilot - Workspace for selvstendig næringsdrivende',
    description:
      'Du jobber. Sakspilot teller timene. Prosjekt-CRM, passiv tidsregistrering, AI-assistent, faktura.',
    images: ['/icon-512.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  // Site-verifisering for Search Console + Bing Webmaster Tools.
  // Settes via env-vars i Vercel:
  //   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION (fra Search Console → HTML-tag-metoden)
  //   NEXT_PUBLIC_BING_SITE_VERIFICATION (fra Bing Webmaster)
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sakspilot',
  },
};

export const viewport: Viewport = {
  themeColor: '#1F1F1F', // charcoal - matcher S-ikonet
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb" className={inter.variable}>
      <head>
        {/* Fonten er na self-hosted via next/font/google. Se inter-konstanten over. */}
        {/* Umami Analytics - GDPR-vennlig, ingen cookies */}
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="bfb51e02-b13e-420f-9396-c2704965af39"
        />
      </head>
      <body>
        <ThemeInit />
        <DesktopShortcutOverlay />
        {children}
        <DesktopAgentControls />
        <OnboardingModal />
        <PwaInit />
      </body>
    </html>
  );
}
