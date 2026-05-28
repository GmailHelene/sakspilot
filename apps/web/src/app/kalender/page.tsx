'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
}

interface Sak {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  client: { id: string; name: string } | null;
  milestones?: Milestone[];
}

interface CalendarItem {
  date: Date;
  type: 'deadline' | 'milestone';
  sakId: string;
  sakTitle: string;
  clientName: string | null;
  title: string;
  completed: boolean;
}

const MND_NAMES = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
                   'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
const UKEDAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

export default function KalenderPage() {
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [saker, setSaker] = useState<Sak[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // Klikkbar dag-modal — null = ikke åpen, ellers valgt dato
  const [createForDate, setCreateForDate] = useState<Date | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const { saker: list } = await api<{ saker: Sak[] }>('/saker');
      setSaker(list);
      // Hent detaljer for hver sak (for å få milestones) — kunne vært
      // ett samle-endepunkt, men for nå er denne tilstrekkelig for ~50 saker
      const details = await Promise.all(
        list.map((s) => api<Sak & { milestones: Milestone[] }>(`/saker/${s.id}`))
      );

      const collected: CalendarItem[] = [];
      for (const sak of details) {
        if (sak.deadline) {
          collected.push({
            date: new Date(sak.deadline),
            type: 'deadline',
            sakId: sak.id,
            sakTitle: sak.title,
            clientName: sak.client?.name ?? null,
            title: 'Sakens hovedfrist',
            completed: false,
          });
        }
        for (const m of sak.milestones ?? []) {
          collected.push({
            date: new Date(m.dueDate),
            type: 'milestone',
            sakId: sak.id,
            sakTitle: sak.title,
            clientName: sak.client?.name ?? null,
            title: m.title,
            completed: !!m.completedAt,
          });
        }
      }
      setItems(collected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    }
  }

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) {
      const key = dateKey(it.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  const today = new Date();
  const todayKey = dateKey(today);

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Kalender</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              Alle frister og milepæler på tvers av sakene dine
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              style={navButtonStyle}
            >
              ‹
            </button>
            <div style={{ minWidth: 180, textAlign: 'center', fontWeight: 600, color: tokens.color.navy }}>
              {MND_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </div>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              style={navButtonStyle}
            >
              ›
            </button>
            <button
              onClick={() => {
                const d = new Date();
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
              style={{ ...navButtonStyle, padding: '6px 14px' }}
            >
              I dag
            </button>
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {!items ? (
          <div style={{ color: tokens.color.textMuted, padding: 40, textAlign: 'center' }}>
            Henter kalender…
          </div>
        ) : (
          <div
            style={{
              background: tokens.color.white,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
              overflow: 'hidden',
            }}
          >
            {/* Ukedager-header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: tokens.color.bgAlt }}>
              {UKEDAGER.map((d) => (
                <div
                  key={d}
                  style={{
                    padding: '10px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: tokens.color.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    textAlign: 'center',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Kalendergrid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {monthGrid.map((day, i) => {
                const dayItems = itemsByDay.get(dateKey(day.date)) || [];
                const inMonth = day.date.getMonth() === currentMonth.getMonth();
                const isToday = dateKey(day.date) === todayKey;
                return (
                  <div
                    key={i}
                    onClick={(e) => {
                      // Bare reager hvis brukeren klikket på selve cellen (ikke på en milepæl-Link)
                      if ((e.target as HTMLElement).closest('a')) return;
                      setCreateForDate(day.date);
                    }}
                    style={{
                      minHeight: 100,
                      padding: 6,
                      borderTop: `1px solid ${tokens.color.border}`,
                      borderLeft: i % 7 !== 0 ? `1px solid ${tokens.color.border}` : undefined,
                      background: inMonth ? tokens.color.white : '#FAFAFA',
                      opacity: inMonth ? 1 : 0.5,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (inMonth) (e.currentTarget as HTMLElement).style.background = '#F5F8FC';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = inMonth ? tokens.color.white : '#FAFAFA';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? tokens.color.white : tokens.color.text,
                        background: isToday ? tokens.color.navy : 'transparent',
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 4,
                      }}
                    >
                      {day.date.getDate()}
                    </div>
                    {dayItems.slice(0, 3).map((it, idx) => (
                      <Link
                        key={idx}
                        href={`/saker/${it.sakId}`}
                        style={{
                          display: 'block',
                          padding: '2px 6px',
                          marginBottom: 2,
                          fontSize: 10,
                          background: it.completed
                            ? tokens.color.bgAlt
                            : it.type === 'deadline'
                              ? '#FEE2E2'
                              : '#FEF3C7',
                          color: it.completed ? tokens.color.textSubtle : tokens.color.text,
                          borderLeft: `3px solid ${
                            it.completed
                              ? tokens.color.textSubtle
                              : it.type === 'deadline'
                                ? tokens.color.red
                                : tokens.color.gold
                          }`,
                          borderRadius: 3,
                          textDecoration: it.completed ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`${it.sakTitle}: ${it.title}`}
                      >
                        {it.sakTitle.length > 18 ? it.sakTitle.slice(0, 17) + '…' : it.sakTitle}
                      </Link>
                    ))}
                    {dayItems.length > 3 && (
                      <div style={{ fontSize: 10, color: tokens.color.textMuted, padding: '2px 6px' }}>
                        +{dayItems.length - 3} til
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legende */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 12, color: tokens.color.textMuted }}>
          <LegendItem color={tokens.color.red} label="Sak-frist" />
          <LegendItem color={tokens.color.gold} label="Milepæl" />
          <LegendItem color={tokens.color.textSubtle} label="Fullført" />
          <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
            💡 Klikk på en dato for å legge til milepæl
          </span>
        </div>

        {createForDate && (
          <CreateMilestoneModal
            date={createForDate}
            saker={saker}
            onClose={() => setCreateForDate(null)}
            onCreated={() => {
              setCreateForDate(null);
              setItems(null);
              loadAll();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

function CreateMilestoneModal({
  date,
  saker,
  onClose,
  onCreated,
}: {
  date: Date;
  saker: Sak[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sakId, setSakId] = useState<string>(saker[0]?.id || '');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!sakId || !title.trim()) {
      setErr('Velg sak og skriv en tittel.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/saker/${sakId}/milestones`, {
        method: 'POST',
        body: { title: title.trim(), dueDate: date.toISOString() },
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lagring feilet');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23, 43, 77, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 28,
          maxWidth: 460,
          width: '100%',
          boxShadow: tokens.shadow.xl,
        }}
      >
        <h2 style={{ fontSize: 20, color: tokens.color.navy, marginBottom: 4 }}>
          Ny milepæl
        </h2>
        <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 18 }}>
          {date.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        {saker.length === 0 ? (
          <>
            <div
              style={{
                padding: 14,
                background: tokens.color.yellowSoft,
                color: '#8B6F00',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 18,
                lineHeight: 1.5,
              }}
            >
              Du må opprette en sak først før du kan legge til milepæler.
              Milepæler hører alltid til en sak.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={ghostBtn}>Lukk</button>
              <Link
                href="/saker/ny"
                style={{
                  ...primaryBtn,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                + Opprett sak
              </Link>
            </div>
          </>
        ) : (
          <>
            {err && (
              <div
                style={{
                  padding: 10,
                  background: '#FEE2E2',
                  color: '#7F1D1D',
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {err}
              </div>
            )}

            <label style={labelStyle}>Sak</label>
            <select
              value={sakId}
              onChange={(e) => setSakId(e.target.value)}
              style={inputStyle}
            >
              {saker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.client?.name ? ` — ${s.client.name}` : ''}
                </option>
              ))}
            </select>

            <label style={{ ...labelStyle, marginTop: 14 }}>Tittel på milepæl</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. «Søknad innlevert kommune»"
              autoFocus
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) save();
              }}
              maxLength={200}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={onClose} disabled={busy} style={ghostBtn}>
                Avbryt
              </button>
              <button onClick={save} disabled={busy} style={primaryBtn}>
                {busy ? 'Lagrer…' : 'Lagre milepæl'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: tokens.color.navy,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  width: '100%',
  background: 'white',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  background: tokens.gradient.navy,
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'transparent',
  color: tokens.color.textMuted,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 2 }} />
      {label}
    </span>
  );
}

function buildMonthGrid(firstOfMonth: Date) {
  const start = new Date(firstOfMonth);
  // Gå tilbake til mandag (norske kalendre starter mandag)
  const dayOfWeek = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOfWeek);
  const days: { date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    days.push({ date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + i) });
  }
  return days;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const navButtonStyle: React.CSSProperties = {
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  width: 32,
  height: 32,
  fontSize: 16,
  cursor: 'pointer',
  color: tokens.color.navy,
};

const errorStyle: React.CSSProperties = {
  padding: 16,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
};
