'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';

// Konfigurer per-plattform URL via NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL_<OS> i Vercel.
// Faller tilbake til den generiske URL-en eller mailto hvis ingen er satt.
const FALLBACK =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ||
  'mailto:helene@helene.cloud?subject=Sakspilot%20Desktop%20%E2%80%94%20be%20om%20lenke';

const DOWNLOADS = {
  windows: {
    url: process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL_WIN || FALLBACK,
    label: 'Windows 10/11 (x64)',
    sizeMb: 116,
    ext: '.zip',
  },
  mac: {
    url: process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL_MAC || FALLBACK,
    label: 'macOS (Apple Silicon)',
    sizeMb: 120,
    ext: '.zip',
  },
  linux: {
    url: process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL_LINUX || FALLBACK,
    label: 'Linux (x64)',
    sizeMb: 110,
    ext: '.tar.gz',
  },
} as const;

type OS = keyof typeof DOWNLOADS;

const VERSION = '0.0.1';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent.toLowerCase();
  const plat = (navigator.platform || '').toLowerCase();
  if (ua.includes('mac') || plat.includes('mac')) return 'mac';
  if (ua.includes('linux') || plat.includes('linux')) return 'linux';
  return 'windows';
}

const OS_ICON: Record<OS, string> = {
  windows: '🪟',
  mac: '🍎',
  linux: '🐧',
};

const OS_NAME: Record<OS, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
};

export default function LastNedClient() {
  // SSR-default = windows (mest sannsynlig brukergruppe). Hydreres til
  // faktisk OS på client-side så CTA-knappen blir riktig før første interact.
  const [os, setOs] = useState<OS>('windows');

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const primary = DOWNLOADS[os];

  return (
    <main
      style={{
        minHeight: 'calc(100vh - 60px)',
        background: tokens.color.bg,
        padding: '40px 24px',
      }}
    >
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{OS_ICON[os]}</div>
          <h1 style={{ fontSize: 36, color: tokens.color.navy, marginBottom: 12 }}>
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
            Desktop-appen som logger automatisk hva du jobber på og kobler tid
            til riktig prosjekt. Krever ikke admin-rettigheter.
          </p>
        </div>

        {/* Hovedkort - primær CTA for detektert OS */}
        <div
          style={{
            background: 'white',
            borderRadius: tokens.radius.lg,
            border: `1px solid ${tokens.color.border}`,
            padding: 32,
            marginBottom: 16,
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
                Versjon {VERSION} · {primary.label}
              </div>
              <div style={{ fontSize: 14, color: tokens.color.textMuted }}>
                {primary.sizeMb} MB · {primary.ext}-fil · ingen installasjon
              </div>
            </div>
            <a
              href={primary.url}
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
              ⬇ Last ned for {OS_NAME[os]}
            </a>
          </div>

          {/* Andre OS som sekundære lenker */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 13,
              color: tokens.color.textMuted,
              borderTop: `1px solid ${tokens.color.border}`,
              paddingTop: 16,
            }}
          >
            <span style={{ marginRight: 4 }}>Annen plattform?</span>
            {(Object.keys(DOWNLOADS) as OS[])
              .filter((p) => p !== os)
              .map((p) => (
                <a
                  key={p}
                  href={DOWNLOADS[p].url}
                  style={{
                    color: tokens.color.navy,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {OS_ICON[p]} {OS_NAME[p]} ({DOWNLOADS[p].sizeMb} MB)
                </a>
              ))}
          </div>
        </div>

        {/* Plattform-spesifikk advarsel */}
        {os === 'windows' && (
          <div
            style={{
              padding: 14,
              background: tokens.color.yellowSoft,
              color: '#8B6F00',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            <strong>Windows SmartScreen?</strong> Første gang du kjører
            Sakspilot.exe kan Windows vise «Beskyttet PC». Klikk{' '}
            <strong>«Mer info»</strong> → <strong>«Kjør likevel»</strong>.
            Sakspilot er ikke kodesignert ennå (kommer i v0.2).
          </div>
        )}
        {os === 'mac' && (
          <div
            style={{
              padding: 14,
              background: tokens.color.yellowSoft,
              color: '#8B6F00',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            <strong>macOS Gatekeeper?</strong> Første gang du åpner
            Sakspilot.app må du <strong>høyreklikke → «Åpne»</strong> og
            bekrefte i dialogen. Etter det åpner appen seg normalt. Den må
            også få <strong>Accessibility-tilgang</strong> for å lese aktivt
            vindu (du blir bedt om det første gang).
          </div>
        )}
        {os === 'linux' && (
          <div
            style={{
              padding: 14,
              background: tokens.color.yellowSoft,
              color: '#8B6F00',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            <strong>Linux:</strong> Pakk ut .tar.gz og kjør{' '}
            <code>./Sakspilot</code> direkte. Window-tracking krever{' '}
            <strong>X11</strong> (Wayland gir bare app-navn, ikke
            window-tittel). GNOME trenger gjerne{' '}
            <code>gnome-shell-extension-appindicator</code> for tray-ikon.
          </div>
        )}

        {/* Installasjonsguide - plattform-spesifikk */}
        <section style={cardStyle}>
          <h2 style={h2Style}>Slik installerer du</h2>
          {os === 'windows' && (
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
                nederst til høyre.
              </li>
            </ol>
          )}
          {os === 'mac' && (
            <ol style={olStyle}>
              <li>Klikk «Last ned» og pakk ut ZIP-fila</li>
              <li>
                Dra <strong>Sakspilot.app</strong> til <code>/Applications</code>
              </li>
              <li>
                <strong>Første gang:</strong> Høyreklikk Sakspilot.app →{' '}
                <strong>«Åpne»</strong> → bekreft i dialog (Gatekeeper-bypass)
              </li>
              <li>
                Godkjenn <strong>Accessibility-tilgang</strong> når macOS
                spør: System Settings → Privacy &amp; Security → Accessibility
                → huk av Sakspilot
              </li>
              <li>
                Ikon dukker opp i <strong>menubaren øverst</strong>. Logg inn
                med samme e-post som på sakspilot.no
              </li>
            </ol>
          )}
          {os === 'linux' && (
            <ol style={olStyle}>
              <li>Last ned .tar.gz</li>
              <li>
                Pakk ut: <code>tar -xzf Sakspilot-*-linux-x64.tar.gz</code>
              </li>
              <li>
                Gå inn i mappa og start:{' '}
                <code>cd Sakspilot-linux-x64 && ./Sakspilot</code>
              </li>
              <li>
                Logg inn med samme e-post som på sakspilot.no. Tray-ikon i
                system tray (krever StatusNotifierItem-støtte).
              </li>
              <li>
                <strong>Auto-start ved login:</strong> lag en .desktop-fil i{' '}
                <code>~/.config/autostart/</code>
              </li>
            </ol>
          )}
        </section>

        {/* Hva den gjør */}
        <section style={cardStyle}>
          <h2 style={h2Style}>Hva gjør desktop-appen?</h2>
          <ul style={ulStyle}>
            <li>
              <strong>Automatisk tidsregistrering</strong> - leser aktivt
              vindu (tittel + app-navn) og kobler tid til riktig prosjekt
              basert på matching-regler du setter opp
            </li>
            <li>
              <strong>Embedded snarveier</strong> - åpner Outlook, Tripletex,
              Holte osv. som faner inni Sakspilot-vinduet
            </li>
            <li>
              <strong>Lokale program-snarveier</strong> - start Cyberduck,
              Notepad++, Postman osv. fra venstre Launcher
            </li>
            <li>
              <strong>Mappe-snarveier</strong> - åpne prosjekt-mapper med ett
              klikk
            </li>
            <li>
              <strong>Tray-/menubar-ikon</strong> - kjører i bakgrunnen,
              start/stopp/pause arbeidsøkt fra hjørnet
            </li>
          </ul>
        </section>

        {/* Personvern */}
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
