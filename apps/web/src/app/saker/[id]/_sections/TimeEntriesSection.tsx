'use client';

/**
 * Tabell over tidsregistreringer for en sak. Henter de 20 nyeste,
 * viser 5 som standard, kan utvides. Eksporterer alle som CSV.
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api, getToken } from '@/lib/api';
import { events } from '@/lib/analytics';
import { SectionCard } from './_shared';

interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  windowTitle: string | null;
  appName: string | null;
  note: string | null;
  billable: boolean;
  hourlyRate: number | null;
  user: { id: string; name: string | null; email: string };
}

export default function TimeEntriesSection({
  sakId,
  sakTitle,
}: {
  sakId: string;
  sakTitle: string;
}) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sakId]);

  async function loadEntries() {
    try {
      const r = await api<{ entries: TimeEntry[]; total: number }>(
        `/saker/${sakId}/time-entries?limit=20`
      );
      setEntries(r.entries);
      setTotal(r.total);
    } catch {
      // ignorer — vises som tom
    }
  }

  async function downloadCsv() {
    setDownloading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/saker/${sakId}/time-entries.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Eksport feilet (${res.status})`);
      events.csvDownloaded('sak');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tid-${sakTitle.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 40)}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!entries || entries.length === 0) return null;

  const visibleEntries = expanded ? entries : entries.slice(0, 5);

  return (
    <SectionCard
      title={`Tidsregistreringer (${total})`}
      action={
        <button
          onClick={downloadCsv}
          disabled={downloading}
          style={{
            background: 'transparent',
            border: `1px solid ${tokens.color.border}`,
            padding: '6px 12px',
            borderRadius: tokens.radius.sm,
            fontSize: 12,
            cursor: 'pointer',
            color: tokens.color.navy,
            fontWeight: 500,
          }}
        >
          {downloading ? 'Genererer…' : '⬇ Last ned CSV'}
        </button>
      }
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
            <th style={teThStyle}>Dato</th>
            <th style={teThStyle}>Varighet</th>
            <th style={teThStyle}>App / vindu</th>
            <th style={{ ...teThStyle, textAlign: 'right' }}>Beløp</th>
          </tr>
        </thead>
        <tbody>
          {visibleEntries.map((e) => {
            const hours = e.durationSec / 3600;
            const amount =
              e.billable && e.hourlyRate ? Math.round(hours * e.hourlyRate) : 0;
            return (
              <tr key={e.id} style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                <td style={teTdStyle}>
                  <div>{new Date(e.startedAt).toLocaleDateString('nb-NO')}</div>
                  <div style={{ fontSize: 11, color: tokens.color.textSubtle }}>
                    {new Date(e.startedAt).toLocaleTimeString('nb-NO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' – '}
                    {new Date(e.endedAt).toLocaleTimeString('nb-NO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </td>
                <td style={{ ...teTdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  {hours.toFixed(2)} t
                </td>
                <td style={{ ...teTdStyle, color: tokens.color.textMuted, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${e.appName || ''} ${e.windowTitle || ''}`}>
                  {e.appName || '-'}
                  {e.windowTitle && (
                    <div style={{ fontSize: 11, color: tokens.color.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.windowTitle}
                    </div>
                  )}
                </td>
                <td
                  style={{
                    ...teTdStyle,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: amount > 0 ? tokens.color.navy : tokens.color.textSubtle,
                    fontWeight: amount > 0 ? 600 : 400,
                  }}
                >
                  {amount > 0 ? `${amount.toLocaleString('nb-NO')} kr` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: tokens.color.navy,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            padding: '4px 8px',
          }}
        >
          {expanded ? '↑ Vis færre' : `↓ Vis alle (${entries.length})`}
        </button>
      )}
      {total > entries.length && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: tokens.color.textSubtle,
            textAlign: 'center',
          }}
        >
          Viser de {entries.length} nyeste · last ned CSV for full historikk
        </div>
      )}
    </SectionCard>
  );
}

const teThStyle: React.CSSProperties = {
  padding: '8px 0',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: tokens.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const teTdStyle: React.CSSProperties = {
  padding: '10px 8px 10px 0',
  fontSize: 13,
  verticalAlign: 'top',
};
