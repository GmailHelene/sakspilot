'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

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

const COLUMNS: SakStatus[] = [
  'ikke_pabegynt', 'pagaaende', 'venter_kunde', 'venter_3part', 'ferdig',
];

type View = 'kanban' | 'tabell';
const VIEW_STORAGE = 'sakspilot_saker_view';

export default function SakerPage() {
  const [saker, setSaker] = useState<Sak[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('kanban');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE) as View | null;
      if (stored === 'tabell' || stored === 'kanban') setView(stored);
    } catch {}
    api<{ saker: Sak[] }>('/saker')
      .then((res) => setSaker(res.saker))
      .catch((err) => setError(err.message));
  }, []);

  function changeView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE, v); } catch {}
  }

  return (
    <AppLayout>
      <div>
        <div
          style={{
            padding: '20px 24px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Saker</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {saker ? `${saker.length} ${saker.length === 1 ? 'aktiv sak' : 'aktive saker'}` : 'Henter…'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ViewToggle current={view} onChange={changeView} />
            <Link href="/saker/ny" style={primaryButtonStyle}>+ Ny sak</Link>
          </div>
        </div>

        {error && <div style={errorStyle}>Feil: {error}</div>}

        {!saker ? (
          <div style={{ padding: 24, color: tokens.color.textMuted }}>Henter saker…</div>
        ) : saker.length === 0 ? (
          <EmptyState />
        ) : view === 'kanban' ? (
          <KanbanView saker={saker} />
        ) : (
          <TabellView saker={saker} />
        )}
      </div>
    </AppLayout>
  );
}

// ── View-toggle ─────────────────────────────────────────────────

function ViewToggle({ current, onChange }: { current: View; onChange: (v: View) => void }) {
  const styles: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: tokens.color.textMuted,
  };
  return (
    <div
      style={{
        display: 'flex',
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.md,
        padding: 3,
      }}
    >
      <button
        onClick={() => onChange('kanban')}
        style={{
          ...styles,
          background: current === 'kanban' ? tokens.color.white : 'transparent',
          color: current === 'kanban' ? tokens.color.navy : tokens.color.textMuted,
          borderRadius: tokens.radius.sm,
        }}
      >
        ▦ Kanban
      </button>
      <button
        onClick={() => onChange('tabell')}
        style={{
          ...styles,
          background: current === 'tabell' ? tokens.color.white : 'transparent',
          color: current === 'tabell' ? tokens.color.navy : tokens.color.textMuted,
          borderRadius: tokens.radius.sm,
        }}
      >
        ☰ Tabell
      </button>
    </div>
  );
}

// ── Kanban ──────────────────────────────────────────────────────

function KanbanView({ saker }: { saker: Sak[] }) {
  const grouped: Record<SakStatus, Sak[]> = {
    ikke_pabegynt: [], pagaaende: [], venter_kunde: [], venter_3part: [], ferdig: [], arkivert: [],
  };
  saker.forEach((s) => grouped[s.status].push(s));

  return (
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
            <span style={{ fontWeight: 700, fontSize: 13, color: tokens.color.navy, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {STATUS_LABEL[status]}
            </span>
            <span style={{ fontSize: 12, color: tokens.color.textMuted, background: tokens.color.bgAlt, padding: '2px 8px', borderRadius: 10 }}>
              {grouped[status].length}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {grouped[status].map((sak) => <SakCard key={sak.id} sak={sak} />)}
          </div>
        </div>
      ))}
    </div>
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
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{sak.title}</div>
      {sak.client && (
        <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 6 }}>{sak.client.name}</div>
      )}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: tokens.color.textSubtle }}>
        <span>⏱ {sak._count.timeEntries}</span>
        {sak.deadline && <span>📅 {new Date(sak.deadline).toLocaleDateString('nb-NO')}</span>}
      </div>
    </Link>
  );
}

// ── Tabell ──────────────────────────────────────────────────────

function TabellView({ saker }: { saker: Sak[] }) {
  const [sortKey, setSortKey] = useState<'title' | 'client' | 'status' | 'deadline'>('deadline');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...saker].sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    if (sortKey === 'title') { av = a.title; bv = b.title; }
    else if (sortKey === 'client') { av = a.client?.name || ''; bv = b.client?.name || ''; }
    else if (sortKey === 'status') { av = STATUS_LABEL[a.status]; bv = STATUS_LABEL[b.status]; }
    else if (sortKey === 'deadline') { av = a.deadline || '9999-12-31'; bv = b.deadline || '9999-12-31'; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div
        style={{
          background: tokens.color.white,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: tokens.color.bgAlt }}>
              <SortableTH label="Sak" sortKey="title" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTH label="Klient" sortKey="client" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTH label="Status" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTH label="Frist" sortKey="deadline" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <th style={{ ...thStyle, textAlign: 'right' }}>Sats</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Timer</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const overdue = s.deadline && new Date(s.deadline) < new Date() && s.status !== 'ferdig';
              return (
                <tr
                  key={s.id}
                  style={{ borderTop: i > 0 ? `1px solid ${tokens.color.border}` : undefined, cursor: 'pointer' }}
                  onClick={() => window.location.href = `/saker/${s.id}`}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600 }}>{s.title}</span>
                    {s.saksnummer && (
                      <span style={{ fontSize: 12, color: tokens.color.textSubtle, marginLeft: 6 }}>
                        #{s.saksnummer}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>{s.client?.name || '—'}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ ...tdStyle, color: overdue ? tokens.color.red : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                    {s.deadline
                      ? new Date(s.deadline).toLocaleDateString('nb-NO')
                      : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {s.hourlyRate ? `${s.hourlyRate.toLocaleString('nb-NO')} kr/t` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{s._count.timeEntries}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SortKey = 'title' | 'client' | 'status' | 'deadline';
function SortableTH({ label, sortKey, current, dir, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void;
}) {
  const isCurrent = sortKey === current;
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onClick(sortKey)}
    >
      {label} {isCurrent && (dir === 'asc' ? '▲' : '▼')}
    </th>
  );
}

function StatusBadge({ status }: { status: SakStatus }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        background: STATUS_COLOR[status],
        color: tokens.color.white,
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Tom-tilstand ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        margin: 24, padding: 48,
        background: tokens.color.white,
        borderRadius: tokens.radius.lg,
        border: `1px dashed ${tokens.color.border}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>Ingen saker enda</h2>
      <p style={{ color: tokens.color.textMuted, marginBottom: 20 }}>
        Opprett din første sak for å komme i gang.
      </p>
      <Link href="/saker/ny" style={primaryButtonStyle}>Opprett første sak →</Link>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const primaryButtonStyle: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
  display: 'inline-block',
};

const errorStyle: React.CSSProperties = {
  margin: '0 24px 16px',
  padding: 16,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  color: tokens.color.text,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
};
