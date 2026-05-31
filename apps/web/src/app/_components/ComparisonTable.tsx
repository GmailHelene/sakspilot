import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import { Check, X } from 'lucide-react';

/**
 * Kort sammenligningstabell på forsiden — full sammenligning ligger på /sammenligning.
 * Server Component — ingen state.
 */

const COMPETITORS = ['Sakspilot', 'Tripletex', 'Toggl', 'Notion'] as const;

const ROWS: Array<{ feature: string; values: boolean[] }> = [
  { feature: 'Automatisk tidsregistrering', values: [true, false, false, false] },
  { feature: 'Klient-CRM med kanban', values: [true, false, false, false] },
  { feature: 'Bransje-onboarding (advokat / arkitekt / konsulent)', values: [true, false, false, false] },
  { feature: 'Norsk språk + EU-data', values: [true, true, false, false] },
  { feature: 'Gratis i pilotperiode', values: [true, false, true, false] },
];

function Cell({ ok, isUs }: { ok: boolean; isUs: boolean }) {
  return (
    <td
      style={{
        padding: '14px 12px',
        textAlign: 'center',
        background: isUs ? `${tokens.color.gold}15` : 'transparent',
        borderBottom: `1px solid ${tokens.color.border}`,
      }}
    >
      {ok ? (
        <Check size={20} strokeWidth={3} color={tokens.color.green} aria-label="Ja" />
      ) : (
        <X size={18} strokeWidth={2.5} color={tokens.color.textSubtle} aria-label="Nei" />
      )}
    </td>
  );
}

export default function ComparisonTable() {
  return (
    <section
      style={{
        padding: '60px 24px',
        maxWidth: 920,
        margin: '0 auto',
      }}
    >
      <h2 style={{ fontSize: 28, color: tokens.color.navy, textAlign: 'center', marginBottom: 8 }}>
        Hvorfor velge Sakspilot?
      </h2>
      <p
        style={{
          color: tokens.color.textMuted,
          textAlign: 'center',
          marginBottom: 28,
          fontSize: 15,
        }}
      >
        Kort vs. Tripletex, Toggl og Notion. {' '}
        <Link href="/sammenligning" style={{ color: tokens.color.navy, fontWeight: 600 }}>
          Les hele sammenligningen →
        </Link>
      </p>

      <div
        style={{
          overflowX: 'auto',
          background: tokens.color.surface,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          boxShadow: tokens.shadow.sm,
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 560,
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  color: tokens.color.textMuted,
                  fontWeight: 600,
                  borderBottom: `2px solid ${tokens.color.border}`,
                }}
              >
                Funksjon
              </th>
              {COMPETITORS.map((name, i) => (
                <th
                  key={name}
                  style={{
                    padding: '14px 12px',
                    textAlign: 'center',
                    color: i === 0 ? tokens.color.navy : tokens.color.textMuted,
                    fontWeight: 700,
                    background: i === 0 ? `${tokens.color.gold}15` : 'transparent',
                    borderBottom: `2px solid ${tokens.color.border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature}>
                <td
                  style={{
                    padding: '14px 16px',
                    color: tokens.color.text,
                    borderBottom: `1px solid ${tokens.color.border}`,
                  }}
                >
                  {row.feature}
                </td>
                {row.values.map((v, i) => (
                  <Cell key={i} ok={v} isUs={i === 0} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
