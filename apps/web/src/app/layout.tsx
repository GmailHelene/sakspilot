import './globals.css';
import type { Metadata, Viewport } from 'next';
import PwaInit from '@/components/PwaInit';
import DesktopShortcutOverlay from '@/components/DesktopShortcutOverlay';
import DesktopAgentControls from '@/components/DesktopAgentControls';
import OnboardingModal from '@/components/OnboardingModal';

export const metadata: Metadata = {
  title: 'Sakspilot — Workspace for selvstendig næringsdrivende',
  description:
    'Sak-CRM, passiv tidsregistrering, Outlook-integrasjon og faktura — i ett verktøy. For ansvarlige søkere, arkitekter, advokater, regnskapsførere, designere og konsulenter.',
  manifest: '/manifest.json',
  applicationName: 'Sakspilot',
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
        {/* Plausible Analytics — GDPR-vennlig, ingen cookies, EU-host */}
        <script
          defer
          data-domain="sakspilot.no"
          src="https://plausible.io/js/script.outbound-links.tagged-events.js"
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
