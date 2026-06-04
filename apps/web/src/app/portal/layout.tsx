/**
 * Klient-portal layout, minimal topp-bar, ingen Sakspilot-sidebar/launcher.
 * Vi vil at klienten ikke ser noen frilanser-funksjoner (snarveier, agenter, kalender).
 *
 * Whitelabel: hvis requesten kommer inn på et CustomDomain blir branding satt
 * dynamisk via _PortalTopBar (CSS-var + brandName/logo). HTML <title> kan IKKE
 * branding-overstyres her fordi metadata er statisk per route, frontend kan
 * sette document.title client-side fra _PortalTopBar hvis vi vil gå dit senere.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Klient-portal',
  description: 'Logg inn for å se status på prosjektene dine.',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
