'use client';

/**
 * Tripletex/Fiken — info-side med CSV-import-veiledning.
 *
 * Full OAuth-integrasjon krever app-registrering hos Tripletex/Fiken
 * (uker av godkjenningsprosess). Inntil videre: CSV-eksport fungerer
 * perfekt mot import-funksjonene i begge systemer.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileText, ExternalLink, Check, AlertTriangle, ArrowLeft } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';

export default function TripletexPage() {
  const [system, setSystem] = useState<'tripletex' | 'fiken'>('tripletex');

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
        <Link
          href="/innstillinger/integrasjoner"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: tokens.color.textMuted,
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={14} /> Tilbake til integrasjoner
        </Link>

        <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 6 }}>
          Tripletex & Fiken
        </h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
          Direkte API-integrasjon kommer snart. Inntil videre: bruk CSV-eksport fra
          <Link href="/rapport" style={{ color: tokens.color.navy, fontWeight: 500 }}> Rapport-siden</Link>{' '}
          for å sende fakturagrunnlag rett inn i regnskapssystemet ditt.
        </p>

        {/* System-velger */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['tripletex', 'fiken'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSystem(s)}
              style={{
                padding: '10px 18px',
                background: system === s ? tokens.gradient.navy : tokens.color.white,
                color: system === s ? tokens.color.white : tokens.color.text,
                border: `1px solid ${system === s ? tokens.color.navy : tokens.color.border}`,
                borderRadius: tokens.radius.md,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
                boxShadow: system === s ? tokens.shadow.colored(tokens.color.navy) : 'none',
              }}
            >
              {s === 'tripletex' ? 'Tripletex' : 'Fiken'}
            </button>
          ))}
        </div>

        {/* Hoved-instruksjon */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 16 }}>
            Slik importerer du timer til {system === 'tripletex' ? 'Tripletex' : 'Fiken'}
          </h2>

          <Step
            n={1}
            title="Last ned CSV fra Sakspilot"
            body={
              <>
                Gå til <Link href="/rapport" style={linkStyle}>Rapport</Link> →
                velg måned → klikk <strong>Last ned CSV</strong>. Filen får navn som
                {' '}<code style={codeStyle}>sakspilot-2026-05.csv</code>.
              </>
            }
            icon={<Download size={18} />}
          />

          {system === 'tripletex' ? (
            <>
              <Step
                n={2}
                title="Logg inn på Tripletex"
                body={
                  <>
                    Gå til <a href="https://tripletex.no" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                      tripletex.no <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                    </a> og logg inn.
                  </>
                }
              />
              <Step
                n={3}
                title="Naviger til Timer → Importer"
                body={
                  <>
                    Hovedmeny: <strong>Timer</strong> → <strong>Verktøy</strong> →
                    <strong> Importer timer fra fil</strong>.
                  </>
                }
              />
              <Step
                n={4}
                title="Velg filformat og kolonner"
                body={
                  <>
                    Velg <strong>CSV</strong> som format og <strong>semikolon (;)</strong> som skille-tegn.
                    Map kolonnene slik:
                    <ColumnMap
                      mapping={[
                        ['Dato', 'Dato'],
                        ['Varighet (timer)', 'Antall timer'],
                        ['Klient', 'Kunde'],
                        ['Prosjekt', 'Prosjekt eller Aktivitet'],
                        ['Notat', 'Kommentar'],
                      ]}
                    />
                  </>
                }
              />
              <Step
                n={5}
                title="Bekreft import"
                body={
                  <>
                    Klikk <strong>Importer</strong>. Tripletex sjekker dataene mot prosjekter og kunder.
                    Hvis noen ikke finnes, opprett dem først eller hopp over de linjene.
                  </>
                }
              />
            </>
          ) : (
            <>
              <Step
                n={2}
                title="Logg inn på Fiken"
                body={
                  <>
                    Gå til <a href="https://fiken.no" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                      fiken.no <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                    </a> og logg inn.
                  </>
                }
              />
              <Step
                n={3}
                title="Lag faktura manuelt"
                body={
                  <>
                    Fiken har ikke direkte timer-import — men du kan bruke CSV-en som
                    grunnlag når du lager fakturalinjer manuelt.
                    <br />Gå til <strong>Salg</strong> → <strong>Ny faktura</strong> →
                    legg til linjer basert på CSV-summen per kunde.
                  </>
                }
              />
              <Step
                n={4}
                title="Tips: én faktura per måned per kunde"
                body={
                  <>
                    Vår CSV grupperer timer per prosjekt og kunde. Lag én Fiken-faktura per
                    kunde med fakturerbare timer × timesats fra CSV-en.
                  </>
                }
              />
            </>
          )}
        </div>

        {/* CSV-format */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>
            Vårt CSV-format
          </h2>
          <p style={{ color: tokens.color.textMuted, fontSize: 13, marginBottom: 12 }}>
            UTF-8 med BOM (Excel-vennlig), semikolon som skille-tegn, norsk dato- og tallformat.
          </p>
          <div
            style={{
              background: '#1A1A1A',
              color: '#E5E5E5',
              padding: 14,
              borderRadius: tokens.radius.md,
              fontFamily: tokens.font.mono,
              fontSize: 12,
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >
            <div style={{ color: '#7FD9C0' }}>
              Dato;Start;Slutt;Varighet (timer);Klient;Prosjekt;App / vindu;Notat;Fakturerbar;Timesats;Beløp
            </div>
            <div>
              28.05.2026;09:00;11:30;2,50;Nordvik & Co. AS;Rebranding 2026;Figma;Logo-skisse;Ja;1450 kr;3 625 kr
            </div>
            <div>
              28.05.2026;13:15;14:45;1,50;Berg Eiendom AS;Skatteoppgjør 2025;Excel;Avstemming;Ja;1800 kr;2 700 kr
            </div>
            <div style={{ color: '#A1A1A1', marginTop: 6 }}>
              ...
            </div>
            <div style={{ color: '#F7B500' }}>
              ;;;14,50;;;;;SUM FAKTURERBART;;26 100 kr
            </div>
          </div>
        </div>

        {/* Direkte API kommer */}
        <div
          style={{
            ...cardStyle,
            background: tokens.color.blueSoft,
            borderColor: tokens.color.blue,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: tokens.color.blue,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={16} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: tokens.color.navy, marginBottom: 4 }}>
                Direkte API-integrasjon kommer
              </h3>
              <p style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.5 }}>
                Når du har koblet til Tripletex/Fiken via OAuth, sender Sakspilot
                fakturagrunnlaget direkte uten manuell CSV-import. Vi venter på
                godkjenning av Sakspilot-appen hos Tripletex (~ 2-4 uker etter første
                pilot-kunde). <strong>Vil du varsles?</strong>{' '}
                <a
                  href="mailto:helene@helene.cloud?subject=Tripletex-integrasjon%20-%20vil%20bli%20varslet"
                  style={{ color: tokens.color.navy, fontWeight: 500 }}
                >
                  Send oss en e-post
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Step({
  n,
  title,
  body,
  icon,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: tokens.gradient.navy,
          color: 'white',
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon || n}
      </div>
      <div style={{ flex: 1, paddingTop: 4 }}>
        <div style={{ fontWeight: 600, color: tokens.color.navy, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: tokens.color.textMuted, lineHeight: 1.6 }}>
          {body}
        </div>
      </div>
    </div>
  );
}

function ColumnMap({ mapping }: { mapping: [string, string][] }) {
  return (
    <table
      style={{
        width: '100%',
        marginTop: 8,
        borderCollapse: 'collapse',
        fontSize: 13,
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.sm,
        overflow: 'hidden',
      }}
    >
      <thead>
        <tr>
          <th style={mapThStyle}>Sakspilot CSV-kolonne</th>
          <th style={mapThStyle}>Tripletex-felt</th>
        </tr>
      </thead>
      <tbody>
        {mapping.map(([a, b]) => (
          <tr key={a}>
            <td style={mapTdStyle}>
              <Check size={12} style={{ verticalAlign: 'middle', marginRight: 4, color: tokens.color.green }} />
              {a}
            </td>
            <td style={mapTdStyle}>→ {b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cardStyle: React.CSSProperties = {
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 24,
  marginBottom: 16,
  boxShadow: tokens.shadow.sm,
};

const linkStyle: React.CSSProperties = {
  color: tokens.color.navy,
  fontWeight: 500,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
};

const codeStyle: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 12,
  background: tokens.color.bgAlt,
  padding: '1px 6px',
  borderRadius: 4,
};

const mapThStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: tokens.color.navy,
  borderBottom: `1px solid ${tokens.color.border}`,
};

const mapTdStyle: React.CSSProperties = {
  padding: '8px 12px',
  color: tokens.color.text,
};
