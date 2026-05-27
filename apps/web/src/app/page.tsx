import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';

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
              title: 'Passiv tidsregistrering',
              desc: 'En diskret app i bakgrunnen logger automatisk hvilken sak du jobber på — basert på vindustittel og filsti. Du slipper å starte og stoppe timer.',
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

        {/* Footer */}
        <footer
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            color: tokens.color.textSubtle,
            fontSize: 13,
          }}
        >
          © 2026 Sakspilot · Helene Åsheim Grønberg · helene.cloud
        </footer>
      </main>
    </>
  );
}
