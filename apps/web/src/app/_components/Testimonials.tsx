import { tokens } from '@/lib/tokens';

/**
 * TODO (Helene): Bytt ut med ekte sitater fra piloter når de har testet.
 * Helst med fornavn + yrke + (valgfritt) lenke til LinkedIn/firma.
 * Behold visuell layout — bare endre TESTIMONIALS-arrayen og fjern
 * PLACEHOLDER_LABEL-banneret.
 */

const PLACEHOLDER_LABEL = '(eksempel — ekte sitater kommer når piloter har testet)';

const TESTIMONIALS = [
  {
    quote: 'Endelig ett verktøy som ikke føles overdimensjonert for solo-bruk.',
    name: 'Anders',
    role: 'IT-konsulent',
    color: tokens.color.blueSoft,
    fg: tokens.color.blue,
  },
  {
    quote: 'Tidsregistreringen tar 0 minutter per dag — den bare skjer.',
    name: 'Sara',
    role: 'Designer',
    color: tokens.color.pinkSoft,
    fg: tokens.color.pink,
  },
  {
    quote: 'Fiken-koblingen sparer meg 4 timer per måned.',
    name: 'Henrik',
    role: 'Advokat',
    color: tokens.color.greenSoft,
    fg: tokens.color.green,
  },
];

export default function Testimonials() {
  return (
    <section
      style={{
        padding: '60px 24px',
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h2 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 6 }}>
          Hva piloter sier
        </h2>
        <p
          style={{
            color: tokens.color.textSubtle,
            fontSize: 13,
            fontStyle: 'italic',
          }}
        >
          {PLACEHOLDER_LABEL}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            style={{
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
              padding: 24,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <blockquote
              style={{
                margin: 0,
                fontSize: 17,
                lineHeight: 1.5,
                color: tokens.color.text,
                fontStyle: 'italic',
              }}
            >
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 'auto',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: t.color,
                  color: t.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {t.name.charAt(0)}
              </span>
              <span>
                <div style={{ fontWeight: 600, color: tokens.color.navy, fontSize: 14 }}>
                  {t.name}
                </div>
                <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>{t.role}</div>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
