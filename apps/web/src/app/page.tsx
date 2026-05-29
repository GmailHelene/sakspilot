import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { Check, Clock, Mail, FileText, Zap, Share2, Lock, Smartphone } from 'lucide-react';

// FAQ — også injisert som JSON-LD i bunnen for AEO (ChatGPT/Perplexity/Claude-svar)
const FAQ = [
  {
    q: 'Hva er Sakspilot?',
    a: 'Sakspilot er et workspace for selvstendig næringsdrivende — sak-CRM, automatisk tidsregistrering, Outlook-integrasjon, AI-assistent og fakturagrunnlag i ett verktøy. Du slipper å hoppe mellom Excel, klistrelapper og 3 forskjellige timeregistreringer.',
  },
  {
    q: 'Hvor mye koster Sakspilot?',
    a: 'Sakspilot er gratis i pilotperioden frem til 2026-12-31. Etter det vil prisen være rundt 199 kr/mnd. Ingen kredittkort kreves for å prøve.',
  },
  {
    q: 'Hvordan fungerer den automatiske tidsregistreringen?',
    a: 'Du installerer en liten Windows-app (Sakspilot Desktop). Den ser hva du jobber på basert på vindustittel og filsti, og kobler tiden til riktig sak via dine egne matching-regler. Ingen behov for å starte og stoppe timer manuelt.',
  },
  {
    q: 'Fungerer Sakspilot med Tripletex eller Fiken?',
    a: 'Ja — du kan eksportere månedlig fakturagrunnlag som CSV som importeres rett til Tripletex, Fiken eller Excel. Direkte API-integrasjon kommer snart.',
  },
  {
    q: 'Er Sakspilot GDPR-trygt?',
    a: 'Ja. All data lagres på EU-servere (Neon i Frankfurt). Du har full data-eksport (GDPR §15) og slette-rett (§17) tilgjengelig i innstillinger. Ingen tracking-cookies — bruker Umami analytics (samtykke-fritt).',
  },
  {
    q: 'Hvilke yrkesgrupper passer Sakspilot for?',
    a: 'Sakspilot er bygget for selvstendig næringsdrivende: ansvarlige søkere, arkitekter, advokater, regnskapsførere, designere, konsulenter, og andre med klientoppdrag og timeføring.',
  },
  {
    q: 'Hvordan kobler jeg Outlook til Sakspilot?',
    a: 'Gå til Innstillinger → Integrasjoner → "Koble til Outlook". Logg inn med Microsoft-kontoen din (Outlook.com, Hotmail eller jobb-Microsoft 365). Sakspilot kobler automatisk innkommende e-poster til riktig sak basert på avsender eller emnefelt.',
  },
  {
    q: 'Kan jeg dele en sak med klienten min?',
    a: 'Ja — generer en offentlig delt lenke per sak. Klienten ser status, milepæler og fremdrift uten å logge inn. Sensitive data (notater, tidsregistreringer, beløp) deles ikke.',
  },
  {
    q: 'Hvordan er Sakspilot forskjellig fra Tripletex eller Toggl?',
    a: 'Tripletex er et regnskapssystem — Sakspilot er et arbeids-workspace. Vi push timer TIL Tripletex via CSV/API, vi erstatter ikke det. Toggl er bare en stoppeklokke — Sakspilot har CRM, kalender, AI-utkast, e-postkobling og faktura-flyt innebygd. Stort sett bruker våre brukere både Sakspilot og Tripletex/Fiken sammen.',
  },
  {
    q: 'Hva slags Windows-versjon trengs?',
    a: 'Sakspilot Desktop kjører på Windows 10 og Windows 11 (64-bit). Ikke kodesignert ennå — Windows SmartScreen kan vise advarsel første gang. Mac- og Linux-versjon kommer senere.',
  },
  {
    q: 'Hvilke språk støtter AI-assistenten?',
    a: 'AI-en (Claude Sonnet 4.5) svarer på norsk bokmål som standard, men kan skrive på engelsk hvis du ber om det. Brukerflaten er foreløpig norsk-only — engelsk språkversjon planlagt 2026.',
  },
  {
    q: 'Kan jeg invitere flere i organisasjonen?',
    a: 'Solo-plan støtter én bruker per organisasjon. Team-plan (flere brukere, delte prosjekter, roller) lanseres Q2 2027. Hvis du er midlertidig flere som vil teste, kontakt helene@helene.cloud.',
  },
  {
    q: 'Lagres data hos OpenAI eller Anthropic?',
    a: 'AI-assistent bruker Anthropic Claude. Vi sender KUN klient-navn + prosjekt-metadata (titler, status, milepæler) — aldri klient-epost, telefon eller fritekst-notater. Anthropic har 30-dagers default retention. Zero Data Retention er tilgjengelig på Enterprise-avtale. For EU-residency kan vi rute via AWS Bedrock i Frankfurt (kunde-konfigurerbart).',
  },
  {
    q: 'Hva skjer hvis Sakspilot legges ned?',
    a: 'Du kan eksportere ALL din data som JSON via Innstillinger → Sikkerhet → Last ned mine data (GDPR-rettighet, alltid tilgjengelig). Hvis Sakspilot legges ned vil vi gi minst 90 dagers varsel + samme JSON-eksport.',
  },
  {
    q: 'Kan jeg bruke Sakspilot mobilt?',
    a: 'Ja — sakspilot.no fungerer i mobil-nettleser, og du kan "installere som app" via Chrome/Safari (PWA). Native iOS/Android-app er ikke prioritert ennå siden PWA dekker 95% av behovet.',
  },
  {
    q: 'Hvor lang tid tar det å komme i gang?',
    a: 'Registrering + bransje-onboarding tar ~3 min. Last ned Windows-app for tidsregistrering: ytterligere ~5 min. Outlook-kobling: 1 min. Totalt ~10 min før alt er på plass.',
  },
];

export default function LandingPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: 'calc(100vh - 60px)', background: tokens.color.bg }}>
        {/* Hero */}
        <section
          style={{
            padding: '80px 24px 60px',
            textAlign: 'center',
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          <h1
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: tokens.color.navy,
              lineHeight: 1.1,
              marginBottom: 20,
              letterSpacing: '-0.5px',
            }}
          >
            Du jobber. Sakspilot teller timene.
          </h1>
          <p
            style={{
              fontSize: 20,
              color: tokens.color.textMuted,
              maxWidth: 680,
              margin: '0 auto 36px',
              lineHeight: 1.5,
            }}
          >
            Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering,
            Outlook-integrasjon og faktura — i ett verktøy.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/registrer"
              style={{
                background: tokens.color.navy,
                color: tokens.color.white,
                padding: '14px 28px',
                borderRadius: tokens.radius.md,
                fontWeight: 600,
                fontSize: 16,
                boxShadow: tokens.shadow.md,
              }}
            >
              Kom i gang gratis
            </Link>
            <Link
              href="/login"
              style={{
                background: tokens.color.white,
                color: tokens.color.navy,
                padding: '14px 28px',
                borderRadius: tokens.radius.md,
                fontWeight: 600,
                fontSize: 16,
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              Logg inn
            </Link>
          </div>
        </section>

        {/* Tre kolonner */}
        <section
          style={{
            padding: '40px 24px 80px',
            maxWidth: 1100,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {[
            {
              icon: '⏱',
              title: 'Passiv tidsregistrering (Windows)',
              desc: 'En diskret app i bakgrunnen logger automatisk hvilken sak du jobber på — basert på vindustittel og filsti. Du slipper å starte og stoppe timer. Desktop-agenten kjører på Windows. Web-app + Outlook-integrasjon funker på alle plattformer.',
            },
            {
              icon: '📋',
              title: 'Sak-CRM med status',
              desc: 'Kanban-oversikt: pågår, venter på kunde, ferdig. Tidsfrister med varsler. All e-postkorrespondanse per sak samlet via Outlook-integrasjon.',
            },
            {
              icon: '📤',
              title: 'Faktura på 30 sekunder',
              desc: 'Eksporter månedlig fakturagrunnlag rett til Tripletex, Fiken eller som CSV. Ingen flere underestimerte timer.',
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                background: tokens.color.white,
                padding: 28,
                borderRadius: tokens.radius.lg,
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{ fontSize: 19, color: tokens.color.navy, marginBottom: 10 }}>
                {item.title}
              </h3>
              <p style={{ color: tokens.color.textMuted, fontSize: 15 }}>{item.desc}</p>
            </div>
          ))}
        </section>

        {/* Features-liste */}
        <section
          style={{
            padding: '60px 24px',
            maxWidth: 980,
            margin: '0 auto',
          }}
        >
          <h2
            style={{
              fontSize: 28,
              color: tokens.color.navy,
              textAlign: 'center',
              marginBottom: 36,
            }}
          >
            Alt du trenger for å holde styr på saker og timer
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {[
              { Icon: Clock, title: 'Automatisk tidsregistrering', desc: 'Desktop-agent logger tid basert på matching-regler' },
              { Icon: FileText, title: 'CSV til Tripletex / Fiken', desc: 'Månedsrapport én klikk unna' },
              { Icon: Mail, title: 'Outlook-integrasjon', desc: 'E-poster kobles automatisk til riktig sak' },
              { Icon: Zap, title: 'Agenter / automatiseringer', desc: 'Monday-stil: når X, gjør Y' },
              { Icon: Share2, title: 'Delt visning til klient', desc: 'Generer offentlig lenke per sak — uten innlogging' },
              { Icon: Lock, title: 'GDPR-klar', desc: 'Innsynsrett + sletteplikt innebygget' },
              { Icon: Smartphone, title: 'Mobil + desktop', desc: 'PWA på telefon, desktop-app på Windows' },
              { Icon: Check, title: 'AI-assistent', desc: 'Oppsummer saker og skriv klient-eposter' },
            ].map(({ Icon, title, desc }) => (
              <div
                key={title}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: tokens.color.bgAlt,
                    color: tokens.color.navy,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: tokens.color.navy, marginBottom: 2 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: 14, color: tokens.color.textMuted, lineHeight: 1.5 }}>
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pris */}
        <section
          style={{
            padding: '60px 24px',
            maxWidth: 720,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 8 }}>
            Gratis i pilotperioden
          </h2>
          <p style={{ color: tokens.color.textMuted, fontSize: 16, marginBottom: 24, maxWidth: 540, margin: '0 auto 24px' }}>
            Vi bygger Sakspilot sammen med de første brukerne. Du får full tilgang,
            i bytte mot at du gir oss tilbakemeldinger på hva som mangler. Senere kommer
            en abonnementspris på rundt 199 kr/mnd.
          </p>
          <div
            style={{
              display: 'inline-block',
              padding: 24,
              background: tokens.color.white,
              border: `2px solid ${tokens.color.gold}`,
              borderRadius: tokens.radius.lg,
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 4 }}>
              Pilotpris (frem til 2026-12-31)
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: tokens.color.navy }}>
              0 kr<span style={{ fontSize: 14, fontWeight: 400, color: tokens.color.textMuted }}> / mnd</span>
            </div>
            <div style={{ fontSize: 12, color: tokens.color.textSubtle, marginTop: 8 }}>
              Ingen kredittkort kreves
            </div>
          </div>
        </section>

        {/* For hvem */}
        <section
          style={{
            background: tokens.color.bgAlt,
            padding: '60px 24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 14 }}>
            For deg som jobber for deg selv
          </h2>
          <p style={{ color: tokens.color.textMuted, fontSize: 16, marginBottom: 28 }}>
            Ansvarlige søkere · Arkitekter · Advokater · Regnskapsførere · Designere · Konsulenter
          </p>
          <Link
            href="/registrer"
            style={{
              display: 'inline-block',
              background: tokens.color.gold,
              color: tokens.color.navy,
              padding: '12px 24px',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
            }}
          >
            Prøv gratis i pilotperioden →
          </Link>
        </section>

        {/* FAQ — viktig for AEO (ChatGPT/Perplexity/Claude-svar) */}
        <section
          id="faq"
          style={{
            padding: '60px 24px',
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 24, textAlign: 'center' }}>
            Vanlige spørsmål
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {FAQ.map((q, i) => (
              <details
                key={i}
                style={{
                  background: tokens.color.white,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  padding: 16,
                }}
              >
                <summary style={{ fontWeight: 600, color: tokens.color.navy, cursor: 'pointer', fontSize: 16 }}>
                  {q.q}
                </summary>
                <p style={{ marginTop: 10, color: tokens.color.textMuted, lineHeight: 1.6 }}>
                  {q.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            color: tokens.color.textSubtle,
            fontSize: 13,
          }}
        >
          © 2026 Sakspilot · Helene Åsheim Grønberg ·{' '}
          <a href="https://helene.cloud" style={{ color: 'inherit' }}>helene.cloud</a>
          <br />
          <span style={{ display: 'inline-flex', gap: 16, marginTop: 6 }}>
            <Link href="/priser" style={{ color: tokens.color.navy, fontWeight: 500 }}>Priser</Link>
            <Link href="/personvern" style={{ color: tokens.color.navy, fontWeight: 500 }}>Personvern</Link>
          </span>
        </footer>
      </main>

      {/* JSON-LD: SoftwareApplication + FAQPage for SEO/AEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'SoftwareApplication',
                name: 'Sakspilot',
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Web, Windows',
                description:
                  'Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering, Outlook-integrasjon, AI-assistent og fakturagrunnlag i ett verktøy.',
                url: 'https://sakspilot.no',
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'NOK',
                  availability: 'https://schema.org/InStock',
                  description: 'Gratis i pilotperioden frem til 2026-12-31',
                },
                creator: {
                  '@type': 'Person',
                  name: 'Helene Åsheim Grønberg',
                  url: 'https://helene.cloud',
                },
                inLanguage: 'nb-NO',
                featureList: [
                  'Sak-CRM med kanban',
                  'Passiv tidsregistrering (desktop-agent)',
                  'Outlook-integrasjon (Microsoft Graph)',
                  'AI-assistent (Claude)',
                  'Klient-portal med delte lenker',
                  'CSV-eksport til Tripletex og Fiken',
                  'PWA / installerbar mobil-app',
                  'GDPR-klar (data-eksport + slett konto)',
                ],
              },
              {
                '@type': 'FAQPage',
                mainEntity: FAQ.map((q) => ({
                  '@type': 'Question',
                  name: q.q,
                  acceptedAnswer: { '@type': 'Answer', text: q.a },
                })),
              },
              {
                '@type': 'Organization',
                name: 'Sakspilot',
                url: 'https://sakspilot.no',
                logo: 'https://sakspilot.no/icon-512.svg',
                founder: { '@type': 'Person', name: 'Helene Åsheim Grønberg' },
                contactPoint: {
                  '@type': 'ContactPoint',
                  email: 'helene@helene.cloud',
                  contactType: 'customer support',
                  availableLanguage: ['Norwegian', 'English'],
                },
              },
            ],
          }),
        }}
      />
    </>
  );
}
