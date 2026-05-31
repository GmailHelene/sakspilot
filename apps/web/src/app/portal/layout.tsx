/**
 * Klient-portal layout — minimal topp-bar, ingen Sakspilot-sidebar/launcher.
 * Vi vil at klienten ikke ser noen frilanser-funksjoner (snarveier, agenter, kalender).
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Klient-portal · Sakspilot',
  description: 'Logg inn for å se status på prosjektene dine.',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
