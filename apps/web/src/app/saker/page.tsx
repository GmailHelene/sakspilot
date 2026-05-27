'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid } from '@/lib/api';

interface Sak {
  id: string;
  title: string;
  status: SakStatus;
  saksnummer: string | null;
  deadline: string | null;
  hourlyRate: number | null;
  createdAt: string;
  client: { id: string; name: string } | null;
  _count: { timeEntries: number; milestones: number };
}

type SakStatus =
  | 'ikke_pabegynt'
  | 'pagaaende'
  | 'venter_kunde'
  | 'venter_3part'
  | 'ferdig'
  | 'arkivert';

const STATUS_LABEL: Record<SakStatus, string> = {
  ikke_pabegynt: 'Ikke påbegynt',
  pagaaende: 'Pågår',
  venter_kunde: 'Venter på kunde',
  venter_3part: 'Venter på 3.part',
  ferdig: 'Ferdig',
  arkivert: 'Arkivert',
};

const STATUS_COLOR: Record<SakStatus, string> = {
  ikke_pabegynt: '#94A3B8',
  pagaaende: '#2D6A4F',
  venter_kunde: '#E9C46A',
  venter_3part: '#D4A017',
  ferdig: '#1E3A5F',
  arkivert: '#CBD5E1',
};

// Kolonner i kanban-rekkefølge
const COLUMNS: SakStatus[] = [
  'ikke_pabegynt',
  'pagaaende',
  'venter_kunde',
  'venter_3part',
  'ferdig',
];

export default function SakerPage() {
  const router = useRouter();
  const [saker, setSaker] = useState<Sak[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    api<{ saker: Sak[] }>('/saker')
      .then((res) => setSaker(res.saker))
      .catch((err) => setError(err.message));
  }, [router]);

  if (error) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ color: tokens.color.red, padding: 24 }}>Feil: {error}</div>
        </main>
      </>
    );
  }

  if (!saker) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ padding: 24, color: tokens.color.textMuted }}>Henter saker…</div>
        </main>
      </>
    );
  }

  // Gruppe saker per status
  const grouped: Record<SakStatus, Sak[]> = {
    ikke_pabegynt: [],
    pagaaende: [],
    venter_kunde: [],
    venter_3part: [],
    ferdig: [],
    arkivert: [],
  };
  saker.forEach((s) => grouped[s.status].push(s));

  return (
    <>
      <Header />
      <main style={pageStyle}>
        <div
          style={{
            padding: '24px 24px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Saker</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {saker.length} {saker.length === 1 ? 'aktiv sak' : 'aktive saker'}
            </p>
          </div>
          <Link
            href="/saker/ny"
            style={{
              background: tokens.color.navy,
              color: tokens.color.white,
              padding: '10px 18px',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            + Ny sak
          </Link>
        </div>

        {saker.length === 0 ? (
          <div
            style={{
              margin: 24,
              padding: 48,
              background: tokens.color.white,
              borderRadius: tokens.radius.lg,
              border: `1px dashed ${tokens.color.border}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>
              Ingen saker enda
            </h2>
            <p style={{ color: tokens.color.textMuted, marginBottom: 20 }}>
              Opprett din første sak for å komme i gang.
            </p>
            <Link
              href="/saker/ny"
              style={{
                display: 'inline-block',
                background: tokens.color.navy,
                color: tokens.color.white,
                padding: '10px 18px',
                borderRadius: tokens.radius.md,
                fontWeight: 600,
              }}
            >
              Opprett første sak →
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))',
              gap: 16,
              padding: 24,
              overflowX: 'auto',
            }}
          >
            {COLUMNS.map((status) => (
              <div key={status} style={{ minWidth: 220 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: 8,
                    borderBottom: `2px solid ${STATUS_COLOR[status]}`,
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: tokens.color.navy,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: tokens.color.textMuted,
                      background: tokens.color.bgAlt,
                      padding: '2px 8px',
                      borderRadius: 10,
                    }}
                  >
                    {grouped[status].length}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {grouped[status].map((sak) => (
                    <SakCard key={sak.id} sak={sak} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function SakCard({ sak }: { sak: Sak }) {
  return (
    <Link
      href={`/saker/${sak.id}`}
      style={{
        background: tokens.color.white,
        padding: 12,
        borderRadius: tokens.radius.md,
        border: `1px solid ${tokens.color.border}`,
        display: 'block',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: tokens.color.text, marginBottom: 6 }}>
        {sak.title}
      </div>
      {sak.client && (
        <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 6 }}>
          {sak.client.name}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: tokens.color.textSubtle,
        }}
      >
        <span>⏱ {sak._count.timeEntries}</span>
        {sak.deadline && (
          <span>📅 {new Date(sak.deadline).toLocaleDateString('nb-NO')}</span>
        )}
      </div>
    </Link>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 60px)',
  background: tokens.color.bg,
};
