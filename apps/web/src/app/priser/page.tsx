import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Zap, Briefcase } from 'lucide-react';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';

export const metadata: Metadata = {
  title: 'Priser',
  description:
    'Sakspilot er gratis i pilotperioden frem til 2026-12-31. Etter det: 199 kr/mnd eller 1990 kr/år for selvstendig næringsdrivende. 14 dagers gratis prøveperiode.',
  alternates: { canonical: '/priser' },
};

// Pilot-fokus 2026-06: lista speiler kjernen vi faktisk viser (tid -> faktura
// -> eksport). Skjulte features (Outlook, AI, klient-portal, agenter,
// klistrelapper, tidslinje) er tatt ut til de evt. re-aktiveres.
const FEATURES = [
  'Prosjekt-CRM med kanban + tabell',
  'Automatisk tidsregistrering (Windows-app)',
  'Fakturagrunnlag med MVA-rapport',
  'Regnskapsoversikt (utgifter + inntekter)',
  'CSV-eksport til Tripletex / Fiken',
  'Kalender med frister',
  'GDPR-eksport + slette-rett',
  'Mobil-app (PWA - iOS + Android)',
  'Ubegrenset antall prosjekter + klienter',
];

export default function PriserPage() {
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
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Pilot-banner */}
          <div
            style={{
              background: tokens.gradient.gold,
              color: tokens.color.navy,
              padding: '14px 20px',
              borderRadius: tokens.radius.md,
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: tokens.shadow.colored(tokens.color.gold),
            }}
          >
            <Zap size={16} strokeWidth={2.5} />
            Pilotperiode pågår - alle planer er <strong>helt gratis</strong> frem til 31. desember 2026
          </div>

          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h1 style={{ fontSize: 42, color: tokens.color.navy, marginBottom: 12, fontWeight: 800 }}>
              Ærlig pris
            </h1>
            <p style={{ fontSize: 18, color: tokens.color.textMuted, maxWidth: 600, margin: '0 auto', lineHeight: 1.5 }}>
              Gratis i pilotperioden, så 199 kr/mnd når vi går live.{' '}
              <strong style={{ color: tokens.color.navy }}>14 dagers gratis prøveperiode</strong>{' '}
              også etter pilotperioden - ingen kredittkort kreves.
            </p>
          </div>

          {/* Plan-kort */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 20,
              marginBottom: 48,
            }}
          >
            <PlanCard
              name="Solo Månedlig"
              tagline="For selvstendig næringsdrivende"
              price="199 kr"
              period="/mnd"
              pilotPrice="Gratis i pilotperioden"
              cta="Kom i gang gratis"
              features={FEATURES}
            />
            <PlanCard
              name="Solo Årlig"
              tagline="To måneder gratis"
              price="1 990 kr"
              period="/år"
              pilotPrice="Gratis i pilotperioden"
              cta="Kom i gang gratis"
              features={FEATURES}
              badge="Spar 17%"
              featured
            />
          </div>

          {/* FAQ + garanti */}
          <div
            style={{
              background: tokens.color.white,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
              padding: 32,
            }}
          >
            <h2 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 20 }}>
              Vanlige spørsmål om pris
            </h2>
            <div style={{ display: 'grid', gap: 16 }}>
              {[
                {
                  q: 'Hva skjer når pilotperioden slutter (31. desember 2026)?',
                  a: 'Pilotbrukere får 14 dager ekstra gratis (trial-periode) for å bestemme seg, og 50% pilot-rabatt for alltid (199 → 99 kr/mnd) hvis du fortsetter. Du beholder all data uavhengig av valget.',
                },
                {
                  q: 'Hvordan betaler jeg?',
                  a: 'I pilotperioden: ingenting. Når vi går live: månedlig faktura via Fiken med Vipps/kortlenke. Senere kommer Stripe-subscription med kort eller AvtaleGiro.',
                },
                {
                  q: 'Kan jeg si opp når som helst?',
                  a: 'Ja. Ingen bindingstid. Du beholder all data, kan eksportere når som helst (GDPR §15), og kan slette kontoen for godt med ett klikk.',
                },
                {
                  q: 'Er det rabatter for studenter / nystartet?',
                  a: 'Send oss en e-post på helene@helene.cloud, så finner vi noe. Vi er selv selvstendig næringsdrivende og forstår hvordan tidlig-fase økonomi ser ut.',
                },
                {
                  q: 'Får jeg refundert hvis jeg ikke er fornøyd?',
                  a: 'Ja - full refusjon innen 30 dager etter første betaling, uten spørsmål. Etter det: pro-rata refusjon for ubrukt periode.',
                },
                {
                  q: 'Trenger jeg å koble til kort i pilotperioden?',
                  a: 'Nei. Du registrerer deg med e-post + passord. Vi spør først om betaling når pilotperioden er over (og du får 14 dagers gratis trial til å bestemme deg).',
                },
              ].map((item, i) => (
                <details
                  key={i}
                  style={{
                    background: tokens.color.bgAlt,
                    borderRadius: tokens.radius.md,
                    padding: 14,
                  }}
                >
                  <summary style={{ fontWeight: 600, color: tokens.color.navy, cursor: 'pointer' }}>
                    {item.q}
                  </summary>
                  <p style={{ marginTop: 10, color: tokens.color.textMuted, lineHeight: 1.6, fontSize: 14 }}>
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link
              href="/registrer"
              style={{
                display: 'inline-block',
                padding: '16px 36px',
                background: tokens.gradient.navy,
                color: 'white',
                borderRadius: tokens.radius.md,
                fontWeight: 600,
                fontSize: 16,
                textDecoration: 'none',
                boxShadow: tokens.shadow.colored(tokens.color.navy),
              }}
            >
              Start gratis nå →
            </Link>
            <div style={{ marginTop: 12, fontSize: 13, color: tokens.color.textMuted }}>
              Ingen kredittkort. Avbryt når som helst.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function PlanCard({
  name,
  tagline,
  price,
  period,
  pilotPrice,
  cta,
  features,
  badge,
  featured,
}: {
  name: string;
  tagline: string;
  price: string;
  period: string;
  pilotPrice: string;
  cta: string;
  features: string[];
  badge?: string;
  featured?: boolean;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        border: `${featured ? 2 : 1}px solid ${featured ? tokens.color.navy : tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: 32,
        position: 'relative',
        boxShadow: featured ? tokens.shadow.lg : tokens.shadow.sm,
      }}
    >
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 24,
            background: tokens.color.gold,
            color: tokens.color.navy,
            padding: '4px 12px',
            borderRadius: tokens.radius.pill,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {badge}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
          color: tokens.color.textMuted,
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <Briefcase size={12} />
        {name}
      </div>
      <p style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 16 }}>
        {tagline}
      </p>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: tokens.color.navy }}>
          {price}
        </span>
        <span style={{ color: tokens.color.textMuted, fontSize: 16 }}>{period}</span>
      </div>
      <div style={{ fontSize: 13, color: tokens.color.green, fontWeight: 600, marginBottom: 24 }}>
        ✓ {pilotPrice}
      </div>

      <Link
        href="/registrer"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '12px 20px',
          background: featured ? tokens.gradient.navy : tokens.color.white,
          color: featured ? 'white' : tokens.color.navy,
          border: featured ? 'none' : `1px solid ${tokens.color.navy}`,
          borderRadius: tokens.radius.md,
          fontWeight: 600,
          textDecoration: 'none',
          marginBottom: 24,
          boxShadow: featured ? tokens.shadow.colored(tokens.color.navy) : 'none',
        }}
      >
        {cta}
      </Link>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {features.map((f) => (
          <li
            key={f}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 14,
              color: tokens.color.text,
            }}
          >
            <Check size={16} strokeWidth={2.5} style={{ color: tokens.color.green, flexShrink: 0, marginTop: 2 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
