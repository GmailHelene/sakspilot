import Link from 'next/link';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';

export const metadata: Metadata = {
  title: 'Last ned Sakspilot Desktop',
  description:
    'Last ned Sakspilot for Windows — desktop-appen som kobler timer automatisk til prosjekter via vindustittel.',
};

// Konfigurer via NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL i Vercel.
// Default = en placeholder så siden fungerer før hosting er satt opp.
const DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ||
  'mailto:helene@helene.cloud?subject=Sakspilot%20Desktop%20%E2%80%94%20be%20om%20lenke';

const VERSION = '0.0.1';
const FILE_SIZE_MB = 116;

export default function LastNedPage() {
  return (
    <>
      <Header />
      <main
        style={{
          minHeight: 'calc(100vh - 60px)',
          background: tokens.color.bg,
          padding: '40px 24px',
        }}
      >
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🪟</div>
            <h1
              style={{
                fontSize: 36,
                color: tokens.color.navy,
                marginBottom: 12,
              }}
            >
              Sakspilot Desktop
            </h1>
            <p
              style={{
                fontSize: 16,
                color: tokens.color.textMuted,
                maxWidth: 560,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              Windows-appen som logger automatisk hva du jobber på og kobler
              tid til riktig prosjekt. Krever ikke admin-rettigheter.
            </p>
          </div>

          {/* Hovedkort */}
          <div
            style={{
              background: 'white',
              borderRadius: tokens.radius.lg,
              border: `1px solid ${tokens.color.border}`,
              padding: 32,
              marginBottom: 24,
              boxShadow: tokens.shadow.md,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: tokens.color.textMuted,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Versjon {VERSION} · Windows 10/11 (x64)
                </div>
                <div style={{ fontSize: 14, color: tokens.color.textMuted }}>
                  {FILE_SIZE_MB} MB · ZIP-fil · ingen installasjon
                </div>
              </div>
              <a
                href={DOWNLOAD_URL}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 28px',
                  background: tokens.gradient.navy,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: tokens.radius.md,
                  fontWeight: 700,
                  fontSize: 15,
                  boxShadow: tokens.shadow.colored('#1E3A5F'),
                }}
              >
                ⬇ Last ned for Windows
              </a>
            </div>

            <div
              style={{
                padding: 14,
                background: tokens.color.yellowSoft,
                color: '#8B6F00',
                borderRadius: tokens.radius.sm,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <strong>Windows SmartScreen?</strong> Første gang du kjører
              Sakspilot.exe kan Windows vise «Beskyttet PC». Klikk{' '}
              <strong>«Mer info»</strong> → <strong>«Kjør likevel»</strong>.
              Sakspilot er ikke kodesignert ennå (kommer i v0.2).
            </div>
          </div>

          {/* Installasjonsguide */}
          <section style={cardStyle}>
            <h2 style={h2Style}>Slik installerer du</h2>
            <ol style={olStyle}>
              <li>Klikk «Last ned» og lagre ZIP-fila</li>
              <li>
                Høyreklikk filen → <strong>«Pakk ut alt…»</strong>. Velg et
                permanent sted, f.eks. <code>C:\Programmer\Sakspilot\</code>
              </li>
              <li>
                Åpne mappa <code>Sakspilot-win32-x64</code> og dobbeltklikk{' '}
                <strong>Sakspilot.exe</strong>
              </li>
              <li>
                Et innloggingsvindu åpnes. Bruk samme e-post + passord som på
                sakspilot.no
              </li>
              <li>
                Etter innlogging legger appen seg som <strong>tray-ikon</strong>{' '}
                nederst til høyre. Klikk på det for å åpne dashboardet
              </li>
              <li>
                <strong>Tips:</strong> Høyreklikk Sakspilot.exe → «Fest til
                startmeny» eller dra til oppgavelinjen
              </li>
            </ol>
          </section>

          {/* Hva den gjør */}
          <section style={cardStyle}>
            <h2 style={h2Style}>Hva gjør desktop-appen?</h2>
            <ul style={ulStyle}>
              <li>
                <strong>Automatisk tidsregistrering</strong> — leser aktivt
                vindu (tittel + app-navn) og kobler tid til riktig prosjekt
                basert på matching-regler du setter opp
              </li>
              <li>
                <strong>Embedded snarveier</strong> — åpner Outlook, Tripletex,
                Holte osv. som faner inni Sakspilot-vinduet
              </li>
              <li>
                <strong>Lokale program-snarveier</strong> — start Cyberduck,
                Notepad++, Postman osv. fra venstre Launcher
              </li>
              <li>
                <strong>Mappe-snarveier</strong> — åpne prosjekt-mapper i
                Windows Explorer med ett klikk
              </li>
              <li>
                <strong>Tray-ikon</strong> — kjører i bakgrunnen,
                start/stopp/pause arbeidsøkt fra hjørnet
              </li>
            </ul>
          </section>

          {/* Personvern + sikkerhet */}
          <section style={cardStyle}>
            <h2 style={h2Style}>Personvern</h2>
            <ul style={ulStyle}>
              <li>
                Vi logger <strong>kun vindustittel + applikasjonsnavn</strong>,
                ingen skjermbilder eller tastetrykk
              </li>
              <li>
                Du kan <strong>pause</strong> logging når som helst fra
                tray-menyen
              </li>
              <li>
                Sensitive vinduer (nettbank osv.) kan ekskluderes via{' '}
                <strong>excludedApps</strong>-listen
              </li>
              <li>
                Mer info:{' '}
                <Link
                  href="/personvern"
                  style={{ color: tokens.color.navy, fontWeight: 600 }}
                >
                  Personvernerklæring
                </Link>
              </li>
            </ul>
          </section>

          {/* Mac/Linux */}
          <section style={cardStyle}>
            <h2 style={h2Style}>Mac eller Linux?</h2>
            <p
              style={{
                fontSize: 14,
                color: tokens.color.textMuted,
                lineHeight: 1.6,
              }}
            >
              Desktop-appen er foreløpig kun for Windows (det er der
              get-windows-API-en for vindustittel-logging fungerer best).
              Mac/Linux-versjon kommer i v0.3. Du kan fortsatt bruke{' '}
              <Link
                href="/saker"
                style={{ color: tokens.color.navy, fontWeight: 600 }}
              >
                sakspilot.no
              </Link>{' '}
              i nettleseren — alle funksjoner unntatt automatisk
              tidsregistrering fungerer.
            </p>
          </section>

          <p
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: tokens.color.textSubtle,
              marginTop: 24,
            }}
          >
            Problemer med nedlasting eller installasjon? Send e-post til{' '}
            <a
              href="mailto:helene@helene.cloud"
              style={{ color: tokens.color.navy }}
            >
              helene@helene.cloud
            </a>
          </p>
        </div>
      </main>
    </>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  padding: 24,
  marginBottom: 16,
};

const h2Style: React.CSSProperties = {
  fontSize: 18,
  color: tokens.color.navy,
  marginBottom: 14,
};

const olStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  color: tokens.color.text,
  lineHeight: 1.8,
};

const ulStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  color: tokens.color.text,
  lineHeight: 1.8,
};
