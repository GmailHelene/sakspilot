'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { SearchBar } from '@/components/SearchBar';
import { tokens, clientColor } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Sak {
  id: string;
  title: string;
  status: SakStatus;
  saksnummer: string | null;
  deadline: string | null;
  hourlyRate: number | null;
  color: string | null;
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
  ikke_pabegynt: '#8993A4',
  pagaaende: '#00B884',
  venter_kunde: '#FFCB00',
  venter_3part: '#FF7A45',
  ferdig: '#1E3A5F',
  arkivert: '#CBD5E1',
};

const COLUMNS: SakStatus[] = [
  'ikke_pabegynt', 'pagaaende', 'venter_kunde', 'venter_3part', 'ferdig',
];

// Alle statuser brukeren kan velge mellom i mobil-modalen (inkluderer arkivert,
// som ikke har egen kolonne i kanban, men er en gyldig status).
const ALL_STATUSES: SakStatus[] = [
  'ikke_pabegynt', 'pagaaende', 'venter_kunde', 'venter_3part', 'ferdig', 'arkivert',
];

type View = 'kanban' | 'tabell';
const VIEW_STORAGE = 'sakspilot_saker_view';

// Detekterer touch-/mobil-enheter via pointer: coarse. Brukes for å tilby
// klikk-for-å-endre-status-modal som alternativ til drag-and-drop på mobil.
function useIsTouchDevice() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    // Eldre Safari bruker addListener; nye bruker addEventListener.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } else {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);
  return touch;
}

export default function SakerPage() {
  const [saker, setSaker] = useState<Sak[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('kanban');
  const isTouch = useIsTouchDevice();
  const [statusModalSak, setStatusModalSak] = useState<Sak | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE) as View | null;
      if (stored === 'tabell' || stored === 'kanban') setView(stored);
    } catch {}
  }, []);

  // Re-fetch ved søk-endring (debounce skjer inne i SearchBar)
  useEffect(() => {
    const url = q ? `/saker?q=${encodeURIComponent(q)}` : '/saker';
    api<{ saker: Sak[] }>(url)
      .then((res) => setSaker(res.saker))
      .catch((err) => setError(err.message));
  }, [q]);

  function changeView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE, v); } catch {}
  }

  async function updateSakStatus(sakId: string, newStatus: SakStatus) {
    setSavingStatus(true);
    try {
      await api(`/saker/${sakId}`, { method: 'PATCH', body: { status: newStatus } });
      setSaker((curr) =>
        curr ? curr.map((s) => (s.id === sakId ? { ...s, status: newStatus } : s)) : curr,
      );
      setStatusModalSak(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke oppdatere status');
    } finally {
      setSavingStatus(false);
    }
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
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Prosjekter</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {saker ? `${saker.length} ${saker.length === 1 ? 'aktivt prosjekt' : 'aktive prosjekter'}` : 'Henter…'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchBar value={q} onChange={setQ} placeholder="Søk prosjekter…" />
            <ViewToggle current={view} onChange={changeView} />
            <Link href="/saker/ny" style={primaryButtonStyle}>+ Nytt prosjekt</Link>
          </div>
        </div>

        {error && <div style={errorStyle}>Feil: {error}</div>}

        {!saker ? (
          <div style={{ padding: 24, color: tokens.color.textMuted }}>Henter prosjekter…</div>
        ) : saker.length === 0 ? (
          <EmptyState />
        ) : view === 'kanban' ? (
          <KanbanView
            saker={saker}
            isTouch={isTouch}
            onTouchCardClick={(s) => setStatusModalSak(s)}
          />
        ) : (
          <TabellView saker={saker} />
        )}

        {statusModalSak && (
          <StatusChangeModal
            sak={statusModalSak}
            saving={savingStatus}
            onSave={(s) => updateSakStatus(statusModalSak.id, s)}
            onClose={() => (savingStatus ? null : setStatusModalSak(null))}
          />
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
          background: current === 'kanban' ? tokens.color.surface : 'transparent',
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
          background: current === 'tabell' ? tokens.color.surface : 'transparent',
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

function KanbanView({
  saker,
  isTouch,
  onTouchCardClick,
}: {
  saker: Sak[];
  isTouch: boolean;
  onTouchCardClick: (s: Sak) => void;
}) {
  const grouped: Record<SakStatus, Sak[]> = {
    ikke_pabegynt: [], pagaaende: [], venter_kunde: [], venter_3part: [], ferdig: [], arkivert: [],
  };
  saker.forEach((s) => grouped[s.status].push(s));

  // På touch-enheter trenger kolonnene egen horisontal scroll med god
  // touch-target-bredde per kolonne. På desktop fyller de bredden.
  const columnMinWidth = isTouch ? 280 : 220;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isTouch
          ? `repeat(${COLUMNS.length}, ${columnMinWidth}px)`
          : `repeat(${COLUMNS.length}, minmax(${columnMinWidth}px, 1fr))`,
        gap: 16,
        padding: isTouch ? '16px 16px 24px' : 24,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {COLUMNS.map((status) => (
        <div key={status} style={{ minWidth: columnMinWidth }}>
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
            {grouped[status].map((sak) => (
              <SakCard
                key={sak.id}
                sak={sak}
                isTouch={isTouch}
                onTouchClick={() => onTouchCardClick(sak)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SakCard({
  sak,
  isTouch,
  onTouchClick,
}: {
  sak: Sak;
  isTouch: boolean;
  onTouchClick: () => void;
}) {
  const initials = sak.client?.name
    ? sak.client.name
        .split(' ')
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null;
  const avatarColor = sak.client ? clientColor(sak.client.name) : null;
  const deadlineSoon =
    sak.deadline && new Date(sak.deadline).getTime() - Date.now() < 7 * 86400000;
  const overdue = sak.deadline && new Date(sak.deadline).getTime() < Date.now();

  // På touch-enheter er kortet en knapp som åpner status-velger-modal
  // (samme rolle som drag-and-drop på desktop). Detalj-siden er fortsatt
  // tilgjengelig via "Åpne" inne i modalen og via tabell-view.
  const cardStyle: React.CSSProperties = {
    background: tokens.color.surface,
    padding: 14,
    borderRadius: tokens.radius.md,
    border: `1px solid ${tokens.color.border}`,
    display: 'block',
    width: '100%',
    textAlign: 'left',
    textDecoration: 'none',
    color: 'inherit',
    boxShadow: tokens.shadow.sm,
    transition: 'transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease',
    position: 'relative',
    borderLeft: sak.color ? `4px solid ${sak.color}` : `1px solid ${tokens.color.border}`,
    cursor: isTouch ? 'pointer' : 'grab',
    minHeight: isTouch ? 64 : undefined,
    font: 'inherit',
  };
  const hoverHandlers = isTouch
    ? {}
    : {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = tokens.shadow.md;
          e.currentTarget.style.borderColor = tokens.color.navy;
        },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = tokens.shadow.sm;
          e.currentTarget.style.borderColor = tokens.color.border;
        },
      };

  const cardInner = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35, color: tokens.color.text }}>
          {sak.title}
        </div>
        {avatarColor && initials && (
          <div
            title={sak.client?.name}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: avatarColor.bg,
              color: avatarColor.fg,
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: tokens.shadow.sm,
            }}
          >
            {initials}
          </div>
        )}
      </div>
      {sak.client && (
        <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 8 }}>
          {sak.client.name}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{
            background: tokens.color.bgAlt,
            color: tokens.color.textMuted,
            padding: '3px 8px',
            borderRadius: tokens.radius.pill,
            fontWeight: 500,
          }}
        >
          ⏱ {sak._count.timeEntries}
        </span>
        {sak.deadline && (
          <span
            style={{
              background: overdue
                ? tokens.color.redSoft
                : deadlineSoon
                  ? tokens.color.yellowSoft
                  : tokens.color.bgAlt,
              color: overdue
                ? tokens.color.red
                : deadlineSoon
                  ? '#8B6F00'
                  : tokens.color.textMuted,
              padding: '3px 8px',
              borderRadius: tokens.radius.pill,
              fontWeight: 600,
            }}
          >
            {overdue ? '⚠️ ' : '📅 '}
            {new Date(sak.deadline).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {sak._count.milestones > 0 && (
          <span
            style={{
              background: tokens.color.blueSoft,
              color: tokens.color.blue,
              padding: '3px 8px',
              borderRadius: tokens.radius.pill,
              fontWeight: 600,
            }}
          >
            🎯 {sak._count.milestones}
          </span>
        )}
      </div>
    </>
  );

  if (isTouch) {
    return (
      <button
        type="button"
        onClick={onTouchClick}
        aria-label={`Endre status for ${sak.title}`}
        style={cardStyle}
      >
        {cardInner}
      </button>
    );
  }

  return (
    <Link href={`/saker/${sak.id}`} style={cardStyle} {...hoverHandlers}>
      {cardInner}
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
          background: tokens.color.surface,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: tokens.color.bgAlt }}>
              <SortableTH label="Prosjekt" sortKey="title" current={sortKey} dir={sortDir} onClick={toggleSort} />
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
                  <td style={tdStyle}>{s.client?.name || '-'}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ ...tdStyle, color: overdue ? tokens.color.red : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                    {s.deadline
                      ? new Date(s.deadline).toLocaleDateString('nb-NO')
                      : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {s.hourlyRate ? `${s.hourlyRate.toLocaleString('nb-NO')} kr/t` : '-'}
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

// ── Status-velger-modal (touch/mobil) ───────────────────────────

function StatusChangeModal({
  sak,
  saving,
  onSave,
  onClose,
}: {
  sak: Sak;
  saving: boolean;
  onSave: (status: SakStatus) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<SakStatus>(sak.status);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', onKey);
    // Lås body-scroll mens modalen er åpen.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving]);

  const changed = selected !== sak.status;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Endre status for ${sak.title}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.color.surface,
          borderRadius: tokens.radius.lg,
          width: '100%',
          maxWidth: 440,
          padding: 20,
          boxShadow: tokens.shadow.lg,
          marginBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 4 }}>
              Endre status for
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: tokens.color.navy }}>
              {sak.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Lukk"
            style={{
              width: 44,
              height: 44,
              borderRadius: tokens.radius.sm,
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              color: tokens.color.textMuted,
              cursor: saving ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div role="radiogroup" aria-label="Status" style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
          {ALL_STATUSES.map((status) => {
            const isSelected = selected === status;
            return (
              <label
                key={status}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  minHeight: 48,
                  borderRadius: tokens.radius.md,
                  border: `2px solid ${isSelected ? STATUS_COLOR[status] : tokens.color.border}`,
                  background: isSelected ? `${STATUS_COLOR[status]}14` : tokens.color.surface,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  color: tokens.color.text,
                }}
              >
                <input
                  type="radio"
                  name="sak-status"
                  value={status}
                  checked={isSelected}
                  onChange={() => setSelected(status)}
                  disabled={saving}
                  style={{ width: 20, height: 20, accentColor: STATUS_COLOR[status], cursor: 'pointer' }}
                />
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: STATUS_COLOR[status],
                    flexShrink: 0,
                  }}
                />
                {STATUS_LABEL[status]}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href={`/saker/${sak.id}`}
            style={{
              flex: '1 1 100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 16px',
              borderRadius: tokens.radius.md,
              border: `1px solid ${tokens.color.border}`,
              background: tokens.color.bgAlt,
              color: tokens.color.navy,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              marginBottom: 4,
            }}
          >
            Åpne prosjekt →
          </Link>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              minHeight: 48,
              padding: '12px 16px',
              borderRadius: tokens.radius.md,
              border: `1px solid ${tokens.color.border}`,
              background: tokens.color.surface,
              color: tokens.color.text,
              fontWeight: 600,
              fontSize: 14,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            disabled={saving || !changed}
            style={{
              flex: 1,
              minHeight: 48,
              padding: '12px 16px',
              borderRadius: tokens.radius.md,
              border: 'none',
              background: changed ? tokens.color.navy : tokens.color.bgAlt,
              color: changed ? tokens.color.white : tokens.color.textMuted,
              fontWeight: 700,
              fontSize: 14,
              cursor: saving || !changed ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Lagrer…' : 'Lagre'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tom-tilstand ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        margin: 24, padding: 48,
        background: tokens.color.surface,
        borderRadius: tokens.radius.lg,
        border: `1px dashed ${tokens.color.border}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>Ingen prosjekter enda</h2>
      <p style={{ color: tokens.color.textMuted, marginBottom: 20 }}>
        Opprett ditt første prosjekt for å komme i gang.
      </p>
      <Link href="/saker/ny" style={primaryButtonStyle}>Opprett første prosjekt →</Link>
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
