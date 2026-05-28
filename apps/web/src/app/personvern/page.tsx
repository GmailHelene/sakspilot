import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';

export const metadata: Metadata = {
  title: 'Personvernerklæring',
  description:
    'Hvordan Sakspilot samler, lagrer og deler personopplysninger. GDPR-kompatibel — EU-host, ingen tracking-cookies, full innsyn og slette-rett.',
  alternates: { canonical: '/personvern' },
};

const SECTIONS = [
  { id: 'kort', title: 'Kort fortalt' },
  { id: 'behandlingsansvarlig', title: 'Behandlingsansvarlig' },
  { id: 'data-vi-samler', title: 'Hva vi samler' },
  { id: 'rettslig-grunnlag', title: 'Rettslig grunnlag' },
  { id: 'hvor-lagres', title: 'Hvor data lagres' },
  { id: 'underdatabehandlere', title: 'Underdatabehandlere' },
  { id: 'ai-bruk', title: 'AI-bruk (Claude)' },
  { id: 'desktop-agent', title: 'Desktop-agent (tidsregistrering)' },
  { id: 'retention', title: 'Hvor lenge vi beholder data' },
  { id: 'rettighetene-dine', title: 'Dine rettigheter' },
  { id: 'cookies', title: 'Cookies og sporing' },
  { id: 'sikkerhet', title: 'Sikkerhet' },
  { id: 'endringer', title: 'Endringer' },
  { id: 'kontakt', title: 'Kontakt' },
];

export default function PersonvernPage() {
  return (
    <>
      <Header />
      <main
        style={{
          minHeight: 'calc(100vh - 60px)',
          background: tokens.color.bg,
          padding: '60px 24px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 13, color: tokens.color.textMuted, textDecoration: 'none' }}>
            ← Tilbake til forsiden
          </Link>

          <h1 style={{ fontSize: 36, color: tokens.color.navy, marginTop: 16, marginBottom: 8 }}>
            Personvernerklæring
          </h1>
          <p style={{ color: tokens.color.textMuted, marginBottom: 32 }}>
            Sist oppdatert: 28. mai 2026
          </p>

          {/* Innholdsfortegnelse */}
          <nav
            style={{
              background: tokens.color.white,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
              padding: 20,
              marginBottom: 32,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Innhold
            </div>
            <ol style={{ paddingLeft: 20, margin: 0, color: tokens.color.text, lineHeight: 1.9 }}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} style={{ color: tokens.color.navy, textDecoration: 'none' }}>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Innhold */}
          <div style={contentStyle}>
            <Section id="kort" title="Kort fortalt">
              <p>
                Sakspilot er et arbeidsverktøy for selvstendig næringsdrivende. Vi samler
                kun data du selv legger inn, samt teknisk metadata for at appen skal fungere.
              </p>
              <ul>
                <li>✅ All data lagres i EU (Neon, Frankfurt)</li>
                <li>✅ Ingen tracking-cookies — analytics uten samtykke-krav (Umami)</li>
                <li>✅ Full innsyn og slette-rett innebygget i appen (Innstillinger → Sikkerhet)</li>
                <li>✅ AI-funksjoner er valgfrie og merket tydelig</li>
              </ul>
            </Section>

            <Section id="behandlingsansvarlig" title="Behandlingsansvarlig">
              <p>
                <strong>Sakspilot</strong> v/Helene Åsheim Grønberg<br />
                ENK, org.nr. (oppgis ved første betalende kunde)<br />
                E-post: <a href="mailto:helene@helene.cloud" style={linkStyle}>helene@helene.cloud</a><br />
                Adresse: Norge
              </p>
            </Section>

            <Section id="data-vi-samler" title="Hva vi samler">
              <h3 style={subheadStyle}>1. Kontoinformasjon</h3>
              <p>Navn, e-postadresse, kryptert passord, organisasjonsnavn, brukerrolle.</p>

              <h3 style={subheadStyle}>2. Innhold du legger inn</h3>
              <p>
                Klienter du registrerer (navn, organisasjonsnummer, kontaktinfo), saker (tittel,
                beskrivelse, frister, status), milepæler, klistrelapper, matching-regler for
                tidsregistrering, og tidsregistreringer (varighet, vindustittel, applikasjonsnavn).
              </p>

              <h3 style={subheadStyle}>3. E-post-data (hvis du kobler til Outlook)</h3>
              <p>
                Hvis du aktiverer Outlook-integrasjonen, leser vi metadata om innkommende e-poster:
                avsender, mottaker, emne og første 200 tegn av brødteksten. Vi sender aldri e-poster
                på dine vegne.
              </p>

              <h3 style={subheadStyle}>4. Teknisk metadata</h3>
              <p>
                IP-adresse (kun for sikkerhet/rate-limiting, ikke lagret langsiktig), nettleserversjon,
                tidssone, og audit-logg over endringer i kontoen din.
              </p>

              <h3 style={subheadStyle}>5. AI-prompts (hvis du bruker AI-assistenten)</h3>
              <p>
                Når du klikker «Oppsummer sak» eller «Skriv epost-utkast», sender vi den relevante
                sak-konteksten (tittel, status, milepæler, eventuell klientnavn) til Anthropic Claude.
                Se eget avsnitt om AI-bruk under.
              </p>
            </Section>

            <Section id="rettslig-grunnlag" title="Rettslig grunnlag">
              <p>Vi behandler personopplysninger på følgende grunnlag (GDPR art. 6):</p>
              <ul>
                <li>
                  <strong>Avtale (art. 6.1.b)</strong> — for å levere tjenesten du har registrert deg for
                </li>
                <li>
                  <strong>Berettiget interesse (art. 6.1.f)</strong> — for sikkerhet, feilretting,
                  og produktforbedring uten å påvirke dine rettigheter
                </li>
                <li>
                  <strong>Samtykke (art. 6.1.a)</strong> — for valgfrie funksjoner som Outlook-integrasjon
                  og AI-assistent
                </li>
                <li>
                  <strong>Lovkrav (art. 6.1.c)</strong> — for regnskapsdata som må oppbevares iht.
                  bokføringsloven (5 år)
                </li>
              </ul>
            </Section>

            <Section id="hvor-lagres" title="Hvor data lagres">
              <p>All data lagres på servere i EU/EØS:</p>
              <ul>
                <li><strong>Neon Postgres</strong> — Frankfurt, Tyskland (kunde-, sak- og tidsdata)</li>
                <li><strong>Render</strong> — Frankfurt, Tyskland (API-host, ingen vedvarende lagring)</li>
                <li><strong>Vercel</strong> — global CDN for statiske ressurser (ingen personopplysninger)</li>
                <li><strong>Umami Cloud</strong> — EU (anonym analytics)</li>
                <li><strong>Microsoft Graph</strong> — EU eller annet område avhengig av din 365-tenant</li>
              </ul>
              <p>
                <strong>Unntak:</strong> Anthropic Claude (AI) er hostet i USA. Se eget avsnitt.
              </p>
            </Section>

            <Section id="underdatabehandlere" title="Underdatabehandlere">
              <p>Vi bruker følgende databehandlere som behandler personopplysninger på våre vegne:</p>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Leverandør</th>
                    <th style={thStyle}>Formål</th>
                    <th style={thStyle}>Region</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Neon (Databricks)', 'Database', 'EU (Frankfurt)'],
                    ['Render', 'API-host', 'EU (Frankfurt)'],
                    ['Vercel', 'Web-host', 'Global CDN'],
                    ['Anthropic', 'AI (Claude)', 'USA *'],
                    ['Microsoft', 'Outlook-integrasjon', 'EU (avh. tenant)'],
                    ['Umami', 'Analytics', 'EU'],
                  ].map(([navn, formaal, region]) => (
                    <tr key={navn}>
                      <td style={tdStyle}>{navn}</td>
                      <td style={tdStyle}>{formaal}</td>
                      <td style={tdStyle}>{region}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 12 }}>
                * Anthropic behandler kun det du eksplisitt sender via AI-funksjonene. Standard
                30-dagers retention; vi søker om Zero Data Retention.
              </p>
              <p>
                Databehandleravtale (DPA) med hver leverandør er på plass. Du kan be om innsyn ved
                å sende e-post til <a href="mailto:helene@helene.cloud" style={linkStyle}>helene@helene.cloud</a>.
              </p>
            </Section>

            <Section id="ai-bruk" title="AI-bruk (Claude)">
              <p>
                Sakspilot tilbyr valgfrie AI-funksjoner som bruker <strong>Anthropic Claude</strong>.
                Når du klikker «Oppsummer sak», «Skriv epost-utkast» eller stiller et fritekst-spørsmål,
                sender vi følgende til Anthropic:
              </p>
              <ul>
                <li>Saks-tittel, status, beskrivelse</li>
                <li>Milepæler og frister</li>
                <li>Klientens navn (firmanavn — for at AI-en skal kunne tilpasse tonen)</li>
                <li>Tidsstatistikk (totaltimer, ikke detaljer)</li>
                <li>Din spørsmål-tekst</li>
              </ul>
              <p>
                <strong>PII-minimisering — hva Anthropic IKKE får:</strong>
              </p>
              <ul>
                <li>Klient-eposter eller telefonnumre</li>
                <li>Dine matching-regler for tidsregistrering</li>
                <li>E-post-innhold fra Outlook</li>
                <li>Tidsregistreringer-detaljer (vindustittel, appname)</li>
                <li>Informasjon om andre saker enn den du jobber med</li>
                <li>Personnumre, fødselsdato, eller andre identifikatorer</li>
              </ul>
              <p>
                <strong>Retention:</strong> Anthropic beholder prompts i opptil 30 dager for
                «trust &amp; safety»-vurdering. Vi har søkt om Zero Data Retention og er
                i dialog med Anthropic. <strong>Data brukes ikke til å trene modellene</strong>{' '}
                (kontraktsfestet i Anthropic Commercial Terms).
              </p>
              <p>
                <strong>Lokasjon:</strong> Anthropic Claude er hostet i USA. Dataoverføring
                er regulert av Standard Contractual Clauses (SCC) iht. GDPR art. 46.
              </p>
              <p>
                Du kan deaktivere AI-funksjoner helt ved å la dem være — alle andre funksjoner i
                Sakspilot fungerer uten AI.
              </p>
            </Section>

            <Section id="desktop-agent" title="Desktop-agent (tidsregistrering)">
              <p>
                Sakspilot Desktop er en valgfri Windows-app som logger hvilket vindu du har aktivt
                hvert 15. sekund. Den ser:
              </p>
              <ul>
                <li>✅ Vindustittel (f.eks. «Bygdøy 12 — rammetillatelse.docx — Word»)</li>
                <li>✅ Applikasjonsnavn (f.eks. «WINWORD.EXE»)</li>
                <li>✅ Filsti hvis et dokument er åpent</li>
                <li>✅ Tidsstempel</li>
              </ul>
              <p>
                <strong>Den ser IKKE:</strong> skjermbilder, tastetrykk, innhold av dokumenter,
                nettleserhistorikk, eller andre brukeres aktivitet.
              </p>
              <p>
                Vindustitler kan inneholde klient-navn fra dokumenter — det regnes som
                personopplysninger. Vår behandling baseres på berettiget interesse: selvstendig
                næringsdrivende trenger korrekt tidsføring per sak for fakturering.
              </p>
              <p>
                Du kan stoppe agenten når som helst via tray-menyen og slette all logget tid fra
                Innstillinger → Sikkerhet.
              </p>
            </Section>

            <Section id="retention" title="Hvor lenge vi beholder data">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Type data</th>
                    <th style={thStyle}>Beholdes</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Aktiv konto (alt innhold)', 'Til du sletter kontoen'],
                    ['Slettet konto (cascade)', 'Umiddelbart, irreversibelt'],
                    ['Audit-logg', '12 måneder'],
                    ['Ikke-matchede tidsregistreringer', '30 dager (konfigurerbart)'],
                    ['Matchede tidsregistreringer (fakturert)', '5 år (bokføringsloven)'],
                    ['IP-adresser i logs', '30 dager (rate-limit)'],
                    ['AI-prompts (Anthropic)', '30 dager (Anthropic-side)'],
                    ['Umami analytics', '12 måneder, aggregert'],
                  ].map(([type, periode]) => (
                    <tr key={type}>
                      <td style={tdStyle}>{type}</td>
                      <td style={tdStyle}>{periode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section id="rettighetene-dine" title="Dine rettigheter">
              <p>Du har følgende rettigheter under GDPR:</p>
              <ul>
                <li>
                  <strong>Innsyn (art. 15):</strong> Last ned all din data som JSON i appen
                  (Innstillinger → Sikkerhet → Eksporter mine data)
                </li>
                <li>
                  <strong>Sletting (art. 17):</strong> Slett kontoen din direkte i appen.
                  Alle relasjoner cascades — ingenting beholdes utover audit-logg (12 mnd) og
                  fakturahistorikk (5 år, lovpålagt).
                </li>
                <li>
                  <strong>Korrigering (art. 16):</strong> Du kan redigere all egen-lagt data
                  direkte i appen
                </li>
                <li>
                  <strong>Begrensning (art. 18):</strong> Kontakt oss for å midlertidig fryse
                  behandling
                </li>
                <li>
                  <strong>Dataportabilitet (art. 20):</strong> JSON-eksporten er strukturert og
                  maskinlesbar
                </li>
                <li>
                  <strong>Innsigelse (art. 21):</strong> Du kan deaktivere AI-funksjoner og
                  Outlook-integrasjon når som helst
                </li>
              </ul>
              <p>
                Henvendelser besvares innen 30 dager. Send til{' '}
                <a href="mailto:helene@helene.cloud" style={linkStyle}>helene@helene.cloud</a>.
              </p>
              <p>
                <strong>Klagerett:</strong> Du kan klage til{' '}
                <a href="https://www.datatilsynet.no/personvern/klage/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  Datatilsynet
                </a>
                .
              </p>
            </Section>

            <Section id="cookies" title="Cookies og sporing">
              <p>
                Sakspilot bruker <strong>kun nødvendige cookies</strong> for å holde deg innlogget
                (httpOnly session-cookie). Ingen tracking-cookies, ingen tredjeparts-annonsesystemer.
              </p>
              <p>
                Vi bruker <strong>Umami Cloud</strong> for analytics, som er GDPR-vennlig:
                ingen cookies, kun anonyme aggregater (sidevisninger per dag, hvilke land,
                generelle bruksmønstre). Vi ser <strong>ikke</strong> hvem som har gjort hva.
              </p>
            </Section>

            <Section id="sikkerhet" title="Sikkerhet">
              <p>Vi tar sikkerhet seriøst:</p>
              <ul>
                <li>HTTPS overalt (TLS 1.3+), HSTS-preload</li>
                <li>Passord lagres som bcrypt-hash (12 rounds)</li>
                <li>JWT-tokens kan invalideres globalt (logg-ut-alle-enheter)</li>
                <li>Database-passord rotert og kun i hemmelighetsstore (aldri i kode)</li>
                <li>Content Security Policy + X-Frame-Options + andre HTTP-headere</li>
                <li>Rate-limiting på alle skrive- og AI-endepunkter</li>
                <li>Audit-logg per skrivehandling</li>
                <li>OAuth refresh-tokens kryptert (AES-256-GCM) i database</li>
              </ul>
              <p>
                Hvis du oppdager en sårbarhet, send e-post til{' '}
                <a href="mailto:helene@helene.cloud" style={linkStyle}>helene@helene.cloud</a>{' '}
                med emne «Security report». Vi setter pris på ansvarlig disclosure.
              </p>
            </Section>

            <Section id="endringer" title="Endringer i denne erklæringen">
              <p>
                Vi kan oppdatere denne erklæringen ved nye funksjoner eller endrede leverandører.
                Du varsles via e-post ved vesentlige endringer (f.eks. ny databehandler eller
                endret rettslig grunnlag) <strong>minst 30 dager før endringen trer i kraft</strong>.
              </p>
              <p>
                Mindre endringer (formuleringer, klargjøringer) publiseres med oppdatert dato øverst
                på denne siden.
              </p>
            </Section>

            <Section id="kontakt" title="Kontakt">
              <p>
                Spørsmål om personvern, ønske om innsyn, eller henvendelser om denne erklæringen:
              </p>
              <p>
                <strong>E-post:</strong>{' '}
                <a href="mailto:helene@helene.cloud" style={linkStyle}>helene@helene.cloud</a><br />
                <strong>Postadresse:</strong> Helene Åsheim Grønberg, Norge<br />
                <strong>Responstid:</strong> Innen 5 virkedager
              </p>
            </Section>
          </div>

          <div
            style={{
              marginTop: 48,
              padding: 24,
              background: tokens.color.bgAlt,
              borderRadius: tokens.radius.lg,
              textAlign: 'center',
              color: tokens.color.textMuted,
              fontSize: 13,
            }}
          >
            © 2026 Sakspilot · Helene Åsheim Grønberg
          </div>
        </div>
      </main>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 12, scrollMarginTop: 80 }}>
        {title}
      </h2>
      <div style={{ color: tokens.color.text, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

const contentStyle: React.CSSProperties = {
  background: tokens.color.white,
  padding: 32,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
};

const subheadStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: tokens.color.navy,
  marginTop: 16,
  marginBottom: 8,
};

const linkStyle: React.CSSProperties = {
  color: tokens.color.navy,
  fontWeight: 500,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 8,
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: tokens.color.navy,
  borderBottom: `2px solid ${tokens.color.border}`,
  background: tokens.color.bgAlt,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${tokens.color.border}`,
  color: tokens.color.text,
};
