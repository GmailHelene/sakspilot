import './globals.css';
import type { Metadata, Viewport } from 'next';
import PwaInit from '@/components/PwaInit';
import DesktopShortcutOverlay from '@/components/DesktopShortcutOverlay';
import DesktopAgentControls from '@/components/DesktopAgentControls';
import OnboardingModal from '@/components/OnboardingModal';

export const metadata: Metadata = {
  metadataBase: new URL('https://sakspilot.no'),
  title: {
    default: 'Sakspilot — Workspace for selvstendig næringsdrivende',
    template: '%s · Sakspilot',
  },
  description:
    'Sak-CRM, passiv tidsregistrering, Outlook-integrasjon og faktura — i ett verktøy. For ansvarlige søkere, arkitekter, advokater, regnskapsførere, designere og konsulenter.',
  applicationName: 'Sakspilot',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  keywords: [
    'sakshåndtering',
    'tidsregistrering',
    'selvstendig næringsdrivende',
    'frilanser',
    'CRM',
    'Tripletex',
    'Fiken',
    'Outlook',
    'ansvarlig søker',
    'arkitekt',
    'advokat',
    'regnskap',
  ],
  authors: [{ name: 'Helene Åsheim Grønberg', url: 'https://helene.cloud' }],
  creator: 'Helene Åsheim Grønberg',
  publisher: 'Sakspilot',
  openGraph: {
    type: 'website',
    locale: 'nb_NO',
    url: 'https://sakspilot.no',
    siteName: 'Sakspilot',
    title: 'Sakspilot — Workspace for selvstendig næringsdrivende',
    description:
      'Sak-CRM + automatisk tidsregistrering + Outlook + AI-assistent + faktura — i ett verktøy. Gratis i pilotperioden.',
    images: [
      {
        url: '/icon-512.svg',
        width: 512,
        height: 512,
        alt: 'Sakspilot — workspace for selvstendig næringsdrivende',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sakspilot — Workspace for selvstendig næringsdrivende',
    description:
      'Du jobber. Sakspilot teller timene. Sak-CRM, passiv tidsregistrering, AI-assistent, faktura.',
    images: ['/icon-512.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
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
  themeColor: '#1E3A5F',
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
    <html lang="nb">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Umami Analytics — GDPR-vennlig, ingen cookies */}
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="bfb51e02-b13e-420f-9396-c2704965af39"
        />
      </head>
      <body>
        <DesktopShortcutOverlay />
        {children}
        <DesktopAgentControls />
        <OnboardingModal />
        <PwaInit />
      </body>
    </html>
  );
}
