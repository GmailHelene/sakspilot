'use client';

/**
 * Rapport — månedlig faktureringsgrunnlag + periode-oversikt.
 *
 * - Velg periode (uke/måned/kvartal) → se totaler + topp-saker
 * - Last ned CSV for valgt år/måned (alle saker + brukere i org)
 */

import { useEffect, useState } from 'react';
import { TrendingUp, Clock, Coins, FileDown, BarChart3 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, getToken } from '@/lib/api';
import { events } from '@/lib/analytics';

interface TopSak {
  id: string;
  title: string;
  clientName: string | null;
  hours: number;
  amount: number;
}

interface Dashboard {
  period: 'week' | 'month' | 'quarter';
  periodStart: string;
  totalHours: number;
  billableHours: number;
  totalAmount: number;
  entryCount: number;
  topSaker: TopSak[];
}

const PERIOD_LABEL: Record<Dashboard['period'], string> = {
  week: 'Denne uken',
  month: 'Denne måneden',
  quarter: 'Dette kvartalet',
};

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

export default function RapportPage() {
  const [period, setPeriod] = useState<Dashboard['period']>('month');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Måned-eksport: default = inneværende måned
  const now = new Date();
  const [exportYear, setExportYear] = useState(now.getFullYear());
  const [exportMonth, setExportMonth] = useState(now.getMonth() + 1);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    load(period);
  }, [period]);

  async function load(p: Dashboard['period']) {
    setError(null);
    try {
      const d = await api<Dashboard>(`/reports/dashboard?period=${p}`);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Henting feilet');
    }
  }

  async function downloadMonth() {
    setDownloading(true);
    try {
      const token = getToken();
      const res = await fetch(
        `/api/reports/month.csv?year=${exportYear}&month=${exportMonth}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error(`Eksport feilet (${res.status})`);
      events.csvDownloaded('month');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sakspilot-${exportYear}-${String(exportMonth).padStart(2, '0')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nedlasting feilet');
    } finally {
      setDownloading(false);
    }
  }

  /**
   * Last ned PDF-tidsrapport for valgt måned.
   * Bruker samme dato-vindu som CSV-eksporten (1. → siste dag i måneden).
   */
  async function downloadMonthPdf() {
    setDownloadingPdf(true);
    setError(null);
    try {
      // [from, to] dekker hele valgt måned inkludert siste sekund
      const from = new Date(exportYear, exportMonth - 1, 1, 0, 0, 0);
      const to = new Date(exportYear, exportMonth, 0, 23, 59, 59);

      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      });

      if (!res.ok) {
        let msg = `PDF-generering feilet (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          // ignore — ikke JSON
        }
        throw new Error(msg);
      }

      const cd = res.headers.get('content-disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      const filename =
        match?.[1] ??
        `tidsrapport-${exportYear}-${String(exportMonth).padStart(2, '0')}.pdf`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-nedlasting feilet');
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 26,
              color: tokens.color.navy,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <BarChart3 size={26} strokeWidth={2.5} style={{ color: tokens.color.navy }} />
            Rapport
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Oversikt over fakturerbare timer og beløp · Last ned CSV til Tripletex/Fiken
          </p>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {/* ── Periode-velger ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                ...periodBtnStyle,
                background: period === p ? tokens.color.navy : tokens.color.white,
                color: period === p ? tokens.color.white : tokens.color.text,
                fontWeight: period === p ? 600 : 500,
              }}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {/* ── KPI-kort ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <KpiCard
            Icon={Clock}
            label="Totaltimer"
            value={data ? `${data.totalHours.toFixed(1)} t` : '—'}
            color={tokens.color.navy}
          />
          <KpiCard
            Icon={TrendingUp}
            label="Fakturerbare timer"
            value={data ? `${data.billableHours.toFixed(1)} t` : '—'}
            color="#10B981"
          />
          <KpiCard
            Icon={Coins}
            label="Estimert beløp"
            value={data ? `${data.totalAmount.toLocaleString('nb-NO')} kr` : '—'}
            color={tokens.color.gold}
          />
          <KpiCard
            Icon={BarChart3}
            label="Antall entries"
            value={data ? String(data.entryCount) : '—'}
            color={tokens.color.textMuted}
          />
        </div>

        {/* ── Topp 5 prosjekter ── */}
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>
            Topp 5 prosjekter {PERIOD_LABEL[period].toLowerCase()}
          </h2>
          {!data ? (
            <div style={{ color: tokens.color.textMuted, padding: 20, textAlign: 'center' }}>
              Henter…
            </div>
          ) : data.topSaker.length === 0 ? (
            <div style={{ color: tokens.color.textMuted, padding: 20, textAlign: 'center' }}>
              Ingen tid logget i denne perioden.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                  <th style={thStyle}>Prosjekt</th>
                  <th style={thStyle}>Klient</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Timer</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Beløp</th>
                </tr>
              </thead>
              <tbody>
                {data.topSaker.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                    <td style={tdStyle}>{s.title}</td>
                    <td style={{ ...tdStyle, color: tokens.color.textMuted }}>
                      {s.clientName ?? '(intern)'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {s.hours.toFixed(1)} t
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                      }}
                    >
                      {s.amount.toLocaleString('nb-NO')} kr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── CSV-eksport for måned ── */}
        <section style={sectionStyle}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 4 }}>
            Last ned faktureringsgrunnlag
          </h2>
          <p
            style={{
              fontSize: 13,
              color: tokens.color.textMuted,
              marginBottom: 16,
            }}
          >
            CSV med en linje per tidsregistrering — UTF-8 + Excel-vennlig BOM, importerbar i Tripletex, Fiken, Excel og Numbers.
            PDF gir et pent oppsummert dokument (per prosjekt, per dag og per app) som kan sendes til klient eller arkiveres.
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Måned</label>
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>År</label>
              <select
                value={exportYear}
                onChange={(e) => setExportYear(parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={downloadMonth} disabled={downloading} style={downloadBtnStyle}>
              <FileDown size={16} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {downloading ? 'Genererer…' : 'Eksporter CSV'}
            </button>
            <button
              onClick={downloadMonthPdf}
              disabled={downloadingPdf}
              style={downloadBtnStyle}
              title="Pen PDF til klient eller arkiv — per prosjekt, per dag og per app"
            >
              <FileDown size={16} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {downloadingPdf ? 'Genererer…' : 'Eksporter PDF'}
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function KpiCard({
  Icon,
  label,
  value,
  color,
}: {
  Icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 20,
        background: tokens.color.white,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={16} strokeWidth={2} style={{ color }} />
        <div style={{ fontSize: 12, color: tokens.color.textMuted, fontWeight: 500 }}>{label}</div>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: tokens.color.navy,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: 24,
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  marginBottom: 24,
};

const periodBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: tokens.radius.md,
  border: `1px solid ${tokens.color.border}`,
  cursor: 'pointer',
  fontSize: 14,
  transition: 'all 0.1s',
};

const thStyle: React.CSSProperties = {
  padding: '8px 0',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  color: tokens.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 0',
  fontSize: 14,
  color: tokens.color.text,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: tokens.color.textMuted,
  marginBottom: 4,
  fontWeight: 500,
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  background: tokens.color.white,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const downloadBtnStyle: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 20px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: 16,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
};
