'use client';

/**
 * Klient-portal — dashboard.
 * Viser alle saker klienten har hos sin frilanser, med status og fremdrift.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import {
  portalApi,
  setPortalToken,
  isPortalTokenValid,
  PortalApiError,
} from '@/lib/portalApi';
import { PortalTopBar, type PortalMe } from './_PortalTopBar';

interface PortalSak {
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
}

const statusLabel: Record<string, { text: string; color: string }> = {
  ikke_pabegynt: { text: 'Ikke påbegynt', color: tokens.color.textMuted },
  pagaaende: { text: 'Pågående', color: tokens.color.green },
  venter_kunde: { text: 'Venter på deg', color: tokens.color.orange },
  venter_3part: { text: 'Venter på 3.part', color: tokens.color.purple },
  ferdig: { text: 'Ferdig', color: tokens.color.blue },
  arkivert: { text: 'Arkivert', color: tokens.color.textSubtle },
};

export default function PortalDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [saker, setSaker] = useState<PortalSak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPortalTokenValid()) {
      router.replace('/portal/login');
      return;
    }
    (async () => {
      try {
        const [meRes, sakerRes] = await Promise.all([
          portalApi<PortalMe>('/client-portal/me'),
          portalApi<{ saker: PortalSak[] }>('/client-portal/saker'),
        ]);
        setMe(meRes);
        setSaker(sakerRes.saker);
      } catch (err) {
        setError(err instanceof PortalApiError ? err.message : 'Kunne ikke hente data');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function logout() {
    setPortalToken(null);
    router.push('/portal/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: tokens.color.bg, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <PortalTopBar me={me} onLogout={logout} />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: '0 0 4px 0' }}>
              Dine prosjekter
            </h1>
            {me && (
              <p style={{ fontSize: 14, color: tokens.color.textMuted, margin: 0 }}>
                Hos <strong>{me.organizationName}</strong>
              </p>
            )}
          </div>
          <Link
            href="/portal/fakturaer"
            style={{
              background: tokens.color.bgAlt,
              color: tokens.color.navy,
              padding: '8px 14px',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              border: `1px solid ${tokens.color.border}`,
            }}
          >
            Mine fakturaer →
          </Link>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted }}>
            Henter prosjekter…
          </div>
        )}

        {error && <div style={errStyle}>{error}</div>}

        {!loading && saker.length === 0 && !error && (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: tokens.color.textMuted,
              background: tokens.color.surface,
              borderRadius: tokens.radius.lg,
              border: `1px solid ${tokens.color.border}`,
            }}
          >
            Ingen aktive prosjekter er knyttet til kontoen din enda.
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {saker.map((s) => {
            const status = statusLabel[s.status] || { text: s.status, color: tokens.color.textMuted };
            return (
              <Link
                key={s.id}
                href={`/portal/sak/${s.id}`}
                style={{
                  display: 'block',
                  background: tokens.color.surface,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.lg,
                  padding: 20,
                  textDecoration: 'none',
                  color: tokens.color.text,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, color: tokens.color.navy, marginBottom: 4 }}>
                      {s.title}
                    </div>
                    {s.saksnummer && (
                      <div style={{ fontSize: 12, color: tokens.color.textSubtle, marginBottom: 8 }}>
                        Prosjekt {s.saksnummer}
                      </div>
                    )}
                    <span
                      style={{
                        display: 'inline-block',
                        background: status.color,
                        color: tokens.color.white,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 999,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {status.text}
                    </span>
                    {s.deadline && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: tokens.color.textMuted,
                        }}
                      >
                        Frist: {new Date(s.deadline).toLocaleDateString('nb-NO')}
                      </span>
                    )}
                  </div>
                  {s.progressPct !== null && (
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: tokens.color.navy }}>
                        {s.progressPct}%
                      </div>
                      <div style={{ fontSize: 11, color: tokens.color.textSubtle }}>
                        {s.milestonesCompleted}/{s.milestonesTotal} milepæler
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

const errStyle: React.CSSProperties = {
  background: '#FEE2E2',
  color: '#7F1D1D',
  padding: '10px 14px',
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  marginBottom: 16,
  border: '1px solid #FCA5A5',
};
