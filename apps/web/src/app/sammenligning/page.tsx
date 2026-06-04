import Link from 'next/link';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';

export const metadata: Metadata = {
  title: 'Sakspilot vs Tripletex, Toggl, Notion, Asana - sammenligning',
  description:
    'Hvordan Sakspilot skiller seg fra Tripletex, Toggl, Notion og Asana. Bygd for norske ENK-er som vil ha prosjekt-CRM, automatisk tidsregistrering og AI-utkast i ett verktøy.',
  alternates: { canonical: '/sammenligning' },
};

interface Comparison {
  competitor: string;
  tagline: string;
  bestFor: string;
  whereSakspilotWins: string[];
  whereTheyWin: string[];
  verdict: string;
}

const COMPARISONS: Comparison[] = [
  {
    competitor: 'Tripletex',
    tagline: 'Komplett regnskapssystem for SMB',
    bestFor: 'Full regnskapsføring (bilag, mva, lønn, balanse). Norsk regnskapsstandard.',
    whereSakspilotWins: [
      'Automatisk tidsregistrering basert på vindustittel (Tripletex krever manuell start/stopp av timer)',
      'Prosjekt-CRM med kanban-visning',
      'AI-utkast til klient-eposter (Tripletex har ingen AI)',
      'Innebygd Outlook-kobling per prosjekt',
      'Mye lavere pris (199 kr/mnd vs 200-800+ for Tripletex)',
    ],
    whereTheyWin: [
      'Full regnskapsføring + lønn + bilag',
      'Etablert leverandør med stor brukerbase',
      'Bedre integrasjoner mot bank og offentlig sektor',
    ],
    verdict:
      'De fleste bruker BÅDE - Sakspilot for daglig arbeidsflyt + tidsføring, Tripletex for selve regnskapet. Vi pusher timer fra Sakspilot til Tripletex via CSV (direkte API kommer Q3 2026).',
  },
  {
    competitor: 'Toggl',
    tagline: 'Tidsregistrering-stoppeklokke',
    bestFor: 'Frilansere som bare vil ha en enkel timer å starte/stoppe.',
    whereSakspilotWins: [
      'Automatisk tidsregistrering (Toggl krever manuell start)',
      'Klient-CRM, prosjekt-CRM, kalender, klistrelapper, agenter - Toggl har ingen av disse',
      'AI-utkast til klient-eposter',
      'Outlook-integrasjon',
      'Fakturering via Fiken',
      'Norsk språk og support',
    ],
    whereTheyWin: [
      'Etablert merkevare med 5+ millioner brukere globalt',
      'Mer modne mobile-apper (iOS/Android native)',
      'Integrasjon med 100+ andre verktøy via Zapier',
    ],
    verdict:
      'Hvis du bare trenger en stoppeklokke: Toggl. Hvis du vil ha hele workspace-en + tidsføring uten å starte timer: Sakspilot.',
  },
  {
    competitor: 'Notion',
    tagline: 'All-in-one note-taking og workspace',
    bestFor: 'Fleksibel dokumenter-database. Wiki. Personlig produktivitet.',
    whereSakspilotWins: [
      'Bransje-spesifikk for ENK (ferdig oppsett, ikke "bygg-fra-bunnen")',
      'Automatisk tidsregistrering (Notion har ingen)',
      'Faktura-flyt mot Fiken',
      'Norsk språk og support',
      'Mindre å sette opp - Notion krever du bygger din egen mal',
    ],
    whereTheyWin: [
      'Mye mer fleksibel hvis du har egne arbeidsflyt-behov',
      'Stor mal-markedsplass',
      'Bedre for content/wiki/personlig kunnskaps-base',
      'Engelsk-fokus med stor community',
    ],
    verdict:
      'Notion er en blank skiferplate - du må bygge alt. Sakspilot er ferdig oppsett for norske frilansere. Bruk Notion for personlig kunnskap, Sakspilot for kunde-arbeid.',
  },
  {
    competitor: 'Asana / ClickUp / Monday',
    tagline: 'Prosjektstyring for team',
    bestFor: 'Team på 5-50 personer som koordinerer komplekse prosjekter.',
    whereSakspilotWins: [
      'Bygget for ENN-bruker (Asana er bygget for team - solo-bruk føles overdimensjonert)',
      'Innebygd timeregistrering + faktura - Asana krever ekstra abonnement på Asana Goals + Harvest',
      'Norsk språk og EU-data (Asana er amerikansk, data i USA som default)',
      'Ingen abonnement-fastlås - pilot gratis ut 2026, ingen kredittkort',
    ],
    whereTheyWin: [
      'Skikkelig team-koordinering med roller og rettigheter',
      'Bedre Gantt og roadmap-visninger',
      'Integrasjon med tusenvis av tredjeparter',
    ],
    verdict:
      'Hvis du er ett team på 10+ personer: Asana/ClickUp. Hvis du er en ENK eller frilanser med 1-5 klienter: Sakspilot.',
  },
];

export default function SammenligningPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: 'calc(100vh - 60px)', background: tokens.color.bg, padding: '60px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h1 style={{ fontSize: 40, color: tokens.color.navy, marginBottom: 12, fontWeight: 800, letterSpacing: '-0.5px' }}>
            Sakspilot vs andre verktøy
          </h1>
          <p style={{ fontSize: 17, color: tokens.color.textMuted, lineHeight: 1.6, marginBottom: 40, maxWidth: 700 }}>
            Vi gir ærlige svar. Sakspilot er ikke best for alle - under finner du hvor vi vinner og hvor andre verktøy passer bedre.
          </p>

          {COMPARISONS.map((c) => (
            <section
              key={c.competitor}
              style={{
                background: 'white',
                borderRadius: tokens.radius.lg,
                border: `1px solid ${tokens.color.border}`,
                padding: 28,
                marginBottom: 24,
                boxShadow: tokens.shadow.sm,
              }}
            >
              <h2 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 4 }}>
                Sakspilot vs {c.competitor}
              </h2>
              <p style={{ fontSize: 13, color: tokens.color.textSubtle, fontStyle: 'italic', marginBottom: 18 }}>
                {c.competitor}: {c.tagline}
              </p>
              <p style={{ fontSize: 14, color: tokens.color.text, marginBottom: 20, lineHeight: 1.6 }}>
                <strong>{c.competitor} passer best for:</strong> {c.bestFor}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontSize: 14, color: '#00B884', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                    ✓ Hvor Sakspilot vinner
                  </h3>
                  <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: tokens.color.text }}>
                    {c.whereSakspilotWins.map((point, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                    Hvor {c.competitor} vinner
                  </h3>
                  <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: tokens.color.textMuted }}>
                    {c.whereTheyWin.map((point, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div
                style={{
                  background: tokens.color.bgAlt,
                  borderLeft: `3px solid ${tokens.color.navy}`,
                  padding: 14,
                  borderRadius: tokens.radius.sm,
                  fontSize: 14,
                  color: tokens.color.text,
                  lineHeight: 1.6,
                }}
              >
                <strong>Bunnlinje:</strong> {c.verdict}
              </div>
            </section>
          ))}

          <div style={{ textAlign: 'center', marginTop: 48, padding: 32, background: 'white', borderRadius: tokens.radius.lg, border: `1px solid ${tokens.color.border}` }}>
            <h2 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 12 }}>
              Vil du prøve uten å forplikte deg?
            </h2>
            <p style={{ fontSize: 15, color: tokens.color.textMuted, marginBottom: 20 }}>
              Pilot-tilgang gratis ut 2026. Ingen kredittkort. Fullt eksporterbart hvis du ombestemmer deg.
            </p>
            <Link
              href="/registrer"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                background: tokens.gradient.navy,
                color: 'white',
                borderRadius: tokens.radius.md,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Opprett gratis konto →
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
