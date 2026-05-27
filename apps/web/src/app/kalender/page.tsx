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
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const { saker } = await api<{ saker: Sak[] }>('/saker');
      // Hent detaljer for hver sak (for å få milestones) — kunne vært
      // ett samle-endepunkt, men for nå er denne tilstrekkelig for ~50 saker
      const details = await Promise.all(
        saker.map((s) => api<Sak & { milestones: Milestone[] }>(`/saker/${s.id}`))
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
                    style={{
                      minHeight: 100,
                      padding: 6,
                      borderTop: `1px solid ${tokens.color.border}`,
                      borderLeft: i % 7 !== 0 ? `1px solid ${tokens.color.border}` : undefined,
                      background: inMonth ? tokens.color.white : '#FAFAFA',
                      opacity: inMonth ? 1 : 0.5,
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
        </div>
      </div>
    </AppLayout>
  );
}

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
