'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Sak {
  id: string;
  title: string;
  status: SakStatus;
  deadline: string | null;
  createdAt: string;
  closedAt: string | null;
  client: { id: string; name: string } | null;
}

type SakStatus = 'ikke_pabegynt' | 'pagaaende' | 'venter_kunde' | 'venter_3part' | 'ferdig' | 'arkivert';

const STATUS_COLOR: Record<SakStatus, string> = {
  ikke_pabegynt: '#94A3B8',
  pagaaende: '#2D6A4F',
  venter_kunde: '#E9C46A',
  venter_3part: '#D4A017',
  ferdig: '#1E3A5F',
  arkivert: '#CBD5E1',
};

const STATUS_LABEL: Record<SakStatus, string> = {
  ikke_pabegynt: 'Ikke påbegynt',
  pagaaende: 'Pågår',
  venter_kunde: 'Venter på kunde',
  venter_3part: 'Venter på 3.part',
  ferdig: 'Ferdig',
  arkivert: 'Arkivert',
};

const DAY_MS = 86400000;

export default function GanttPage() {
  const [saker, setSaker] = useState<Sak[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ saker: Sak[] }>('/saker').then((r) => setSaker(r.saker)).catch((e) => setError(e.message));
  }, []);

  // Beregn felles tidslinje basert på alle sakers start/slutt
  const timeline = useMemo(() => {
    if (!saker || saker.length === 0) return null;
    const today = Date.now();
    let minDate = today - 30 * DAY_MS;
    let maxDate = today + 60 * DAY_MS;

    for (const s of saker) {
      const start = new Date(s.createdAt).getTime();
      const end = s.closedAt
        ? new Date(s.closedAt).getTime()
        : s.deadline
          ? new Date(s.deadline).getTime()
          : today + 14 * DAY_MS;
      if (start < minDate) minDate = start;
      if (end > maxDate) maxDate = end;
    }

    // Snap til hele uker
    minDate = startOfWeek(minDate);
    maxDate = endOfWeek(maxDate);
    const totalDays = Math.ceil((maxDate - minDate) / DAY_MS);
    return { minDate, maxDate, totalDays };
  }, [saker]);

  // Generer måneds-labels på toppen
  const monthMarkers = useMemo(() => {
    if (!timeline) return [];
    const markers: { offset: number; label: string }[] = [];
    let d = new Date(timeline.minDate);
    d.setDate(1);
    while (d.getTime() < timeline.maxDate) {
      const offset = ((d.getTime() - timeline.minDate) / DAY_MS / timeline.totalDays) * 100;
      markers.push({
        offset,
        label: d.toLocaleDateString('nb-NO', { month: 'short', year: '2-digit' }),
      });
      d.setMonth(d.getMonth() + 1);
    }
    return markers;
  }, [timeline]);

  const todayOffset = useMemo(() => {
    if (!timeline) return 0;
    return ((Date.now() - timeline.minDate) / DAY_MS / timeline.totalDays) * 100;
  }, [timeline]);

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Tidslinje (Gantt)</h1>
        <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>
          Visuell oversikt over alle saker fra start til frist/ferdig
        </p>

        {error && (
          <div style={{ padding: 16, background: '#FEE2E2', color: '#7F1D1D', borderRadius: 8 }}>{error}</div>
        )}

        {!saker ? (
          <div style={{ color: tokens.color.textMuted, padding: 40, textAlign: 'center' }}>Henter saker…</div>
        ) : saker.length === 0 || !timeline ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              background: tokens.color.white,
              borderRadius: tokens.radius.lg,
              border: `1px dashed ${tokens.color.border}`,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
            <p style={{ color: tokens.color.textMuted }}>Ingen saker å vise tidslinje for.</p>
            <Link
              href="/saker/ny"
              style={{
                display: 'inline-block',
                marginTop: 12,
                padding: '8px 16px',
                background: tokens.color.navy,
                color: tokens.color.white,
                borderRadius: tokens.radius.md,
                fontWeight: 600,
              }}
            >
              + Opprett første sak
            </Link>
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
            {/* Måneds-header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '260px 1fr',
                background: tokens.color.bgAlt,
                borderBottom: `1px solid ${tokens.color.border}`,
              }}
            >
              <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Sak / Klient
              </div>
              <div style={{ position: 'relative', height: 32 }}>
                {monthMarkers.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${m.offset}%`,
                      top: 0,
                      bottom: 0,
                      paddingLeft: 6,
                      fontSize: 11,
                      color: tokens.color.textMuted,
                      borderLeft: `1px solid ${tokens.color.border}`,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Sak-rader */}
            <div style={{ position: 'relative' }}>
              {/* I dag-linje (vises over alle radene) */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(260px + ${todayOffset}%)`,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: tokens.color.red,
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
                title="I dag"
              />

              {saker.map((s) => {
                const start = new Date(s.createdAt).getTime();
                const end = s.closedAt
                  ? new Date(s.closedAt).getTime()
                  : s.deadline
                    ? new Date(s.deadline).getTime()
                    : Date.now() + 14 * DAY_MS;
                const startOffset = ((start - timeline.minDate) / DAY_MS / timeline.totalDays) * 100;
                const widthPct = ((end - start) / DAY_MS / timeline.totalDays) * 100;
                const isOverdue = !s.closedAt && s.deadline && new Date(s.deadline).getTime() < Date.now();
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '260px 1fr',
                      borderTop: `1px solid ${tokens.color.border}`,
                      minHeight: 44,
                      alignItems: 'center',
                    }}
                  >
                    <Link
                      href={`/saker/${s.id}`}
                      style={{
                        padding: '8px 14px',
                        textDecoration: 'none',
                        color: tokens.color.text,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.title}
                      </div>
                      {s.client && (
                        <div
                          style={{
                            fontSize: 11,
                            color: tokens.color.textMuted,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.client.name}
                        </div>
                      )}
                    </Link>
                    <div style={{ position: 'relative', height: 36 }}>
                      <Link
                        href={`/saker/${s.id}`}
                        style={{
                          position: 'absolute',
                          left: `${Math.max(0, startOffset)}%`,
                          width: `${Math.max(1, widthPct)}%`,
                          top: 8,
                          bottom: 8,
                          background: STATUS_COLOR[s.status],
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: tokens.color.white,
                          textDecoration: 'none',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          border: isOverdue ? `2px solid ${tokens.color.red}` : undefined,
                        }}
                        title={`${s.title} · ${STATUS_LABEL[s.status]}${isOverdue ? ' · FORSINKET' : ''}`}
                      >
                        {STATUS_LABEL[s.status]}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legende */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, fontSize: 12, color: tokens.color.textMuted, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 10, background: STATUS_COLOR[k as SakStatus], borderRadius: 2 }} />
              {v}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 2, height: 14, background: tokens.color.red }} />
            I dag
          </span>
        </div>
      </div>
    </AppLayout>
  );
}

function startOfWeek(ts: number) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // mandag = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfWeek(ts: number) {
  return startOfWeek(ts) + 7 * DAY_MS - 1;
}
