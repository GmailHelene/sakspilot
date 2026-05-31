import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { Check, Clock, Mail, FileText, Zap, Share2, Lock, Smartphone, Target, Bot, Wallet, HardHat, Download } from 'lucide-react';
import DemoVideoModal from './_components/DemoVideoModal';
import ComparisonTable from './_components/ComparisonTable';
import Testimonials from './_components/Testimonials';
import { FAQ_HOME, landingJsonLd } from './_components/landing-faq';

export default function LandingPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: 'calc(100vh - 60px)', background: tokens.color.bg }}>
        {/* ============================================================ */}
        {/* HERO — to-kolonne på desktop, stablet på mobil                */}
        {/* ============================================================ */}
        <section
          style={{
            padding: '64px 24px 48px',
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 52px)',
                fontWeight: 800,
                color: tokens.color.navy,
                lineHeight: 1.08,
                marginBottom: 18,
                letterSpacing: '-0.5px',
              }}
            >
              Du jobber. Sakspilot teller timene.
            </h1>
            <p
              style={{
                fontSize: 19,
                color: tokens.color.textMuted,
                marginBottom: 28,
                lineHeight: 1.55,
                maxWidth: 540,
              }}
            >
              Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering,
              Outlook-integrasjon, AI-utkast og faktura — i ett verktøy.
            </p>

            {/* Trust-bullets */}
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              {[
                'Gratis ut 2026',
                'Norsk språk + support',
                'EU-data (Neon Frankfurt)',
                'Ingen kredittkort',
              ].map((b) => (
                <li
                  key={b}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: tokens.color.textMuted,
                    fontWeight: 500,
                  }}
                >
                  <Check size={14} strokeWidth={3} color={tokens.color.green} />
                  {b}
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          </div>

          {/* Hero-skjermbilde (placeholder).
              TODO (Helene): Bytt ut /icon-512.svg med ekte demo-skjermbilde
              fra app-en — gjerne saker-kanban med 3-4 ekte-aktige saker. */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 520,
              aspectRatio: '4 / 3',
              borderRadius: tokens.radius.lg,
              background: tokens.gradient.navy,
              padding: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: tokens.shadow.xl,
              margin: '0 auto',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 80% 20%, rgba(212,160,23,0.25) 0%, transparent 55%)',
              }}
            />
            <Image
              src="/icon-512.svg"
              alt="Sakspilot dashbord — TODO: bytt med ekte skjermbilde"
              width={220}
              height={220}
              style={{ position: 'relative', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))' }}
              priority
            />
          </div>
        </section>

        {/* ============================================================ */}
        {/* DEMO-VIDEO — klikkbar thumbnail med modal                     */}
        {/* ============================================================ */}
        <section
          style={{
            padding: '40px 24px 60px',
            maxWidth: 900,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 10 }}>
            Se Sakspilot på 90 sekunder
          </h2>
          <p style={{ color: tokens.color.textMuted, marginBottom: 28, fontSize: 15 }}>
            Fra første sak til ferdig faktura — uten å bytte verktøy.
          </p>
          <DemoVideoModal />
        </section>

        {/* ============================================================ */}
        {/* HVORFOR SAKSPILOT — 4 verdikort                               */}
        {/* ============================================================ */}
        <section
          style={{
            padding: '60px 24px',
            maxWidth: 1100,
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
            Hvorfor Sakspilot
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
            }}
          >
            {[
              {
                Icon: Target,
                tint: tokens.color.blueSoft,
                fg: tokens.color.blue,
                title: 'Auto-spor',
                desc: 'Én bryter — alt du åpner via Sakspilot telles automatisk på riktig sak. Du slipper start/stopp-timer.',
              },
              {
                Icon: Bot,
                tint: tokens.color.purpleSoft,
                fg: tokens.color.purple,
                title: 'AI-utkast til klient-eposter',
                desc: 'Claude under panseret. Oppsummer sak, foreslå svar, formuler tilbud — alltid på norsk.',
              },
              {
                Icon: Wallet,
                tint: tokens.color.greenSoft,
                fg: tokens.color.green,
                title: 'Faktura rett til Fiken',
                desc: 'Månedlig fakturagrunnlag pushes direkte til Fiken — eller eksporteres som PDF/CSV hvis du ikke har Fiken.',
              },
              {
                Icon: HardHat,
                tint: tokens.color.orangeSoft,
                fg: tokens.color.orange,
                title: 'Bransje-snarveier',
                desc: 'Ferdig oppsett for advokat, ansvarlig søker, IT-konsulent, designer m.fl. — du slipper å bygge fra bunnen.',
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  background: tokens.color.surface,
                  padding: 24,
                  borderRadius: tokens.radius.lg,
                  border: `1px solid ${tokens.color.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: tokens.radius.md,
                    background: item.tint,
                    color: item.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <item.Icon size={24} strokeWidth={2.2} />
                </div>
                <h3 style={{ fontSize: 18, color: tokens.color.navy, margin: 0 }}>{item.title}</h3>
                <p style={{ color: tokens.color.textMuted, fontSize: 14.5, margin: 0, lineHeight: 1.55 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* TESTIMONIALS (placeholder)                                    */}
        {/* ============================================================ */}
        <Testimonials />

        {/* ============================================================ */}
        {/* SAMMENLIGNINGSTABELL (kort)                                   */}
        {/* ============================================================ */}
        <ComparisonTable />

        {/* ============================================================ */}
        {/* FEATURES — kompakt grid                                       */}
        {/* ============================================================ */}
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
              { Icon: FileText, title: 'CSV / Fiken-eksport', desc: 'Månedsrapport én klikk unna' },
              { Icon: Mail, title: 'Outlook-integrasjon', desc: 'E-poster kobles automatisk til riktig sak' },
              { Icon: Zap, title: 'Agenter / automatiseringer', desc: 'Monday-stil: når X, gjør Y' },
              { Icon: Share2, title: 'Delt visning til klient', desc: 'Generer offentlig lenke per sak — uten innlogging' },
              { Icon: Lock, title: 'GDPR-klar', desc: 'Innsynsrett + sletteplikt innebygget' },
              { Icon: Smartphone, title: 'Mobil + desktop', desc: 'PWA på telefon, desktop-app på Windows' },
              { Icon: Check, title: 'AI-assistent', desc: 'Oppsummer saker og skriv klient-eposter' },
            ].map(({ Icon, title, desc }) => (
              <div
                key={title}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16 }}
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

        {/* ============================================================ */}
        {/* PRIS                                                          */}
        {/* ============================================================ */}
        <section
          style={{
            padding: '40px 24px 60px',
            maxWidth: 720,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 8 }}>
            Gratis i pilotperioden
          </h2>
          <p
            style={{
              color: tokens.color.textMuted,
              fontSize: 16,
              marginBottom: 24,
              maxWidth: 540,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Vi bygger Sakspilot sammen med de første brukerne. Full tilgang — i bytte mot
            tilbakemeldinger. Senere kommer 199 kr/mnd (eller 1990 kr/år).
          </p>
          <div
            style={{
              display: 'inline-block',
              padding: 24,
              background: tokens.color.surface,
              border: `2px solid ${tokens.color.gold}`,
              borderRadius: tokens.radius.lg,
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 4 }}>
              Pilotpris (frem til 2026-12-31)
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: tokens.color.navy }}>
              0 kr
              <span style={{ fontSize: 14, fontWeight: 400, color: tokens.color.textMuted }}>
                {' '}
                / mnd
              </span>
            </div>
            <div style={{ fontSize: 12, color: tokens.color.textSubtle, marginTop: 8 }}>
              Ingen kredittkort kreves
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* FAQ — kuratert subset (full liste går til JSON-LD)            */}
        {/* ============================================================ */}
        <section
          id="faq"
          style={{
            padding: '60px 24px',
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          <h2
            style={{
              fontSize: 28,
              color: tokens.color.navy,
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            Vanlige spørsmål
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {FAQ_HOME.map((q, i) => (
              <details
                key={i}
                style={{
                  background: tokens.color.surface,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  padding: 16,
                }}
              >
                <summary
                  style={{
                    fontWeight: 600,
                    color: tokens.color.navy,
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                >
                  {q.q}
                </summary>
                <p style={{ marginTop: 10, color: tokens.color.textMuted, lineHeight: 1.6 }}>
                  {q.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* FINAL CTA                                                     */}
        {/* ============================================================ */}
        <section
          style={{
            background: tokens.gradient.navy,
            padding: '64px 24px',
            textAlign: 'center',
            color: tokens.color.white,
          }}
        >
          <h2
            style={{
              fontSize: 32,
              color: tokens.color.white,
              marginBottom: 12,
              fontWeight: 800,
            }}
          >
            Klar til å prøve?
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 17,
              marginBottom: 28,
              maxWidth: 520,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            ~10 minutter fra registrering til alt er på plass — inkludert desktop-agent
            og Outlook-kobling.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/registrer"
              style={{
                background: tokens.color.gold,
                color: tokens.color.navy,
                padding: '14px 28px',
                borderRadius: tokens.radius.md,
                fontWeight: 700,
                fontSize: 16,
                boxShadow: tokens.shadow.md,
              }}
            >
              Opprett gratis konto
            </Link>
            <Link
              href="/last-ned"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: tokens.color.white,
                padding: '14px 28px',
                borderRadius: tokens.radius.md,
                fontWeight: 600,
                fontSize: 16,
                border: '1px solid rgba(255,255,255,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Download size={18} /> Last ned Windows-appen
            </Link>
          </div>
        </section>

        {/* ============================================================ */}
        {/* FOOTER                                                        */}
        {/* ============================================================ */}
        <footer
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            color: tokens.color.textSubtle,
            fontSize: 13,
          }}
        >
          © 2026 Sakspilot · Helene Åsheim Grønberg ·{' '}
          <a href="https://helene.cloud" style={{ color: 'inherit' }}>
            helene.cloud
          </a>
          <br />
          <span style={{ display: 'inline-flex', gap: 16, marginTop: 6 }}>
            <Link href="/priser" style={{ color: tokens.color.navy, fontWeight: 500 }}>
              Priser
            </Link>
            <Link href="/sammenligning" style={{ color: tokens.color.navy, fontWeight: 500 }}>
              Sammenligning
            </Link>
            <Link href="/personvern" style={{ color: tokens.color.navy, fontWeight: 500 }}>
              Personvern
            </Link>
          </span>
        </footer>
      </main>

      {/* JSON-LD: SoftwareApplication + FAQPage + Organization for SEO/AEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: landingJsonLd() }} />
    </>
  );
}
