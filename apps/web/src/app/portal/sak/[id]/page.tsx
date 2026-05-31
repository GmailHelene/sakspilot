'use client';

/**
 * Klient-portal — sak-detalj.
 * Viser milepæler + fakturahistorikk (kun "exported" — draft skjules).
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import {
  portalApi,
  setPortalToken,
  isPortalTokenValid,
  PortalApiError,
} from '@/lib/portalApi';
import { PortalTopBar, type PortalMe } from '../../_PortalTopBar';

interface SakDetail {
  id: string;
  title: string;
  saksnummer: string | null;
  status: string;
  deadline: string | null;
  createdAt: string;
  closedAt: string | null;
  description: string | null;
  progressPct: number | null;
  milestonesTotal: number;
  milestonesCompleted: number;
  milestones: {
    id: string;
    title: string;
    dueDate: string;
    completedAt: string | null;
  }[];
}

interface Invoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalHours: string;
  totalAmount: string;
  currency: string;
  status: string;
  exportedAt: string | null;
  externalRef: string | null;
}

const statusLabel: Record<string, { text: string; color: string }> = {
  ikke_pabegynt: { text: 'Ikke påbegynt', color: tokens.color.textMuted },
  pagaaende: { text: 'Pågående', color: tokens.color.green },
  venter_kunde: { text: 'Venter på deg', color: tokens.color.orange },
  venter_3part: { text: 'Venter på 3.part', color: tokens.color.purple },
  ferdig: { text: 'Ferdig', color: tokens.color.blue },
  arkivert: { text: 'Arkivert', color: tokens.color.textSubtle },
};

export default function PortalSakDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sakId = params.id;

  const [me, setMe] = useState<PortalMe | null>(null);
  const [sak, setSak] = useState<SakDetail | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPortalTokenValid()) {
      router.replace('/portal/login');
      return;
    }
    (async () => {
      try {
        const [meRes, sakRes, invRes] = await Promise.all([
          portalApi<PortalMe>('/client-portal/me'),
          portalApi<SakDetail>(`/client-portal/saker/${sakId}`),
          portalApi<{ invoices: Invoice[] }>(`/client-portal/saker/${sakId}/invoices`),
        ]);
        setMe(meRes);
        setSak(sakRes);
        setInvoices(invRes.invoices);
      } catch (err) {
        setError(err instanceof PortalApiError ? err.message : 'Kunne ikke hente prosjekt');
      } finally {
        setLoading(false);
      }
    })();
  }, [router, sakId]);

  function logout() {
    setPortalToken(null);
    router.push('/portal/login');
  }

  const status = sak ? (statusLabel[sak.status] || { text: sak.status, color: tokens.color.textMuted }) : null;

  return (
    <div style={{ minHeight: '100vh', background: tokens.color.bg, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <PortalTopBar me={me} onLogout={logout} />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: 24 }}>
        <Link
          href="/portal"
          style={{ fontSize: 13, color: tokens.color.textMuted, textDecoration: 'none' }}
        >
          ← Tilbake til oversikt
        </Link>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted }}>
            Henter prosjekt…
          </div>
        )}

        {error && <div style={errStyle}>{error}</div>}

        {sak && (
          <>
            <div style={cardStyle}>
              <h1 style={{ fontSize: 24, color: tokens.color.navy, margin: '0 0 8px 0' }}>
                {sak.title}
              </h1>
              {sak.saksnummer && (
                <div style={{ fontSize: 13, color: tokens.color.textSubtle, marginBottom: 12 }}>
                  Prosjekt {sak.saksnummer}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {status && (
                  <span
                    style={{
                      background: status.color,
                      color: tokens.color.white,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 12px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {status.text}
                  </span>
                )}
                {sak.deadline && (
                  <span style={{ fontSize: 13, color: tokens.color.textMuted }}>
                    Frist: <strong>{new Date(sak.deadline).toLocaleDateString('nb-NO')}</strong>
                  </span>
                )}
                <span style={{ fontSize: 13, color: tokens.color.textMuted }}>
                  Opprettet: {new Date(sak.createdAt).toLocaleDateString('nb-NO')}
                </span>
              </div>

              {sak.description && (
                <p style={{ fontSize: 14, color: tokens.color.text, lineHeight: 1.6, marginTop: 16, whiteSpace: 'pre-wrap' }}>
                  {sak.description}
                </p>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, color: tokens.color.navy, margin: '0 0 12px 0' }}>
                Milepæler
                {sak.milestonesTotal > 0 && (
                  <span style={{ fontSize: 13, color: tokens.color.textMuted, fontWeight: 400, marginLeft: 8 }}>
                    ({sak.milestonesCompleted} av {sak.milestonesTotal} fullført — {sak.progressPct}%)
                  </span>
                )}
              </h2>
              {sak.milestones.length === 0 ? (
                <p style={{ fontSize: 13, color: tokens.color.textMuted, margin: 0 }}>
                  Ingen milepæler er definert enda.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {sak.milestones.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: m.completedAt ? tokens.color.greenSoft : tokens.color.bgAlt,
                        borderRadius: tokens.radius.sm,
                        opacity: m.completedAt ? 0.85 : 1,
                      }}
                    >
                      <span style={{ fontSize: 14, color: tokens.color.text, textDecoration: m.completedAt ? 'line-through' : 'none' }}>
                        {m.completedAt ? '✓' : '○'} {m.title}
                      </span>
                      <span style={{ fontSize: 12, color: tokens.color.textMuted }}>
                        {new Date(m.dueDate).toLocaleDateString('nb-NO')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: 16, color: tokens.color.navy, margin: '0 0 12px 0' }}>
                Fakturahistorikk
              </h2>
              {invoices.length === 0 ? (
                <p style={{ fontSize: 13, color: tokens.color.textMuted, margin: 0 }}>
                  Ingen fakturaer er sendt for dette prosjektet enda.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                      <th style={thStyle}>Periode</th>
                      <th style={thStyle}>Timer</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Beløp</th>
                      <th style={thStyle}>Sendt</th>
                      <th style={thStyle}>Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                        <td style={tdStyle}>
                          {new Date(inv.periodStart).toLocaleDateString('nb-NO')} – {new Date(inv.periodEnd).toLocaleDateString('nb-NO')}
                        </td>
                        <td style={tdStyle}>{Number(inv.totalHours).toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(inv.totalAmount).toLocaleString('nb-NO')} {inv.currency}
                        </td>
                        <td style={tdStyle}>
                          {inv.exportedAt ? new Date(inv.exportedAt).toLocaleDateString('nb-NO') : '–'}
                        </td>
                        <td style={{ ...tdStyle, color: tokens.color.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
                          {inv.externalRef || '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 20,
  marginTop: 16,
};

const errStyle: React.CSSProperties = {
  background: '#FEE2E2',
  color: '#7F1D1D',
  padding: '10px 14px',
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  marginBottom: 16,
  marginTop: 16,
  border: '1px solid #FCA5A5',
};

const thStyle: React.CSSProperties = {
  padding: '8px 6px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: tokens.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 6px',
  color: tokens.color.text,
};
