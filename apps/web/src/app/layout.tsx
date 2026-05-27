import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sakspilot — Workspace for selvstendig næringsdrivende',
  description:
    'Sak-CRM, passiv tidsregistrering, Outlook-integrasjon og faktura — i ett verktøy. For ansvarlige søkere, arkitekter, advokater, regnskapsførere, designere og konsulenter.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
