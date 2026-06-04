import { tokens } from '@/lib/tokens';

/**
 * STATUS 4. juni 2026: Komponenten returnerer null inntil vi har ekte
 * pilot-sitater. Tilbakemelding fra Helene: placeholder-sitater virker
 * ufyselig profesjonelt og er bedre helt skjult enn merket "eksempel".
 *
 * Når piloter har testet, fyll inn TESTIMONIALS-arrayen under med
 * (quote, name, role) og fjern `return null` i Testimonials-funksjonen.
 * Helst med lenke til LinkedIn/firma der det er greit for piloten.
 */

const TESTIMONIALS = [
  {
    quote: 'Endelig ett verktøy som ikke føles overdimensjonert for solo-bruk.',
    name: 'Anders',
    role: 'IT-konsulent',
    color: tokens.color.blueSoft,
    fg: tokens.color.blue,
  },
  {
    quote: 'Tidsregistreringen tar 0 minutter per dag - den bare skjer.',
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
  // Skjult inntil ekte pilot-sitater er på plass (4. juni 2026).
  return null;

  // eslint-disable-next-line no-unreachable
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
          {/* placeholder fjernet 4. juni 2026 */}
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
