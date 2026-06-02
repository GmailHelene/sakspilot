'use client';

/**
 * /statistikk — Tverrgående KPIer for hele virksomheten.
 *
 * Henter data fra flere endepunkter og aggregerer i frontend (ingen
 * server-side join — backend-routene er allerede tunede for hver av sine
 * tabeller). Hvis dette blir tregt med mye data, erstattes med ett samlet
 * /reports/business-kpis endpoint.
 *
 * KPIer:
 *   - Lead konverteringsrate (vunnet / (vunnet+tapt))
 *   - Snitt-tid lead → kunde
 *   - Total omsetning + utgift + resultat
 *   - Topp 5 klienter etter omsetning
 *   - Antall aktive saker
 *   - Snitt faktura-størrelse
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, downloadPdf } from '@/lib/api';
import { FileDown } from 'lucide-react';

interface ForesporselSummary {
  foresporsler: Array<{
    id: string;
    name: string;
    status: 'ny' | 'i_dialog' | 'vunnet' | 'tapt' | 'arkivert';
    estimatedValue: number | null;
    createdAt: string;
    closedAt: string | null;
  }>;
  countsByStatus: Partial<Record<string, number>>;
}

interface InvoiceSummary {
  invoices: Array<{
    id: string;
    totalAmount: string;
    status: string;
    sak?: { id: string; title: string; client?: { id: string; name: string } | null } | null;
  }>;
  summary: { totalAmountExported: number; exportedCount: number };
}

interface UtgiftSummary {
  summary: { totalAmount: number };
}

const currentYear = new Date().getFullYear();

export default function StatistikkPage() {
  const [year, setYear] = useState(currentYear);
  const [foresporsler, setForesporsler] = useState<ForesporselSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary | null>(null);
  const [utgifter, setUtgifter] = useState<UtgiftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [f, i, u] = await Promise.all([
        api<ForesporselSummary>('/foresporsler?includeArchived=true'),
        api<InvoiceSummary>(`/invoices?year=${year}`),
        api<UtgiftSummary>(`/utgifter?year=${year}`),
      ]);
      setForesporsler(f);
      setInvoices(i);
      setUtgifter(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil');
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);

  // Beregninger
  const vunnet = foresporsler?.countsByStatus.vunnet ?? 0;
  const tapt = foresporsler?.countsByStatus.tapt ?? 0;
  const inDialog = foresporsler?.countsByStatus.i_dialog ?? 0;
  const ny = foresporsler?.countsByStatus.ny ?? 0;
  const konverteringsrate = vunnet + tapt > 0 ? (vunnet / (vunnet + tapt)) * 100 : 0;

  // Snitt-tid fra lead → vunnet (dager)
  const wonLeads = (foresporsler?.foresporsler ?? []).filter((f) => f.status === 'vunnet' && f.closedAt);
  const avgDaysToWin = wonLeads.length > 0
    ? wonLeads.reduce((s, f) => {
        const days = (new Date(f.closedAt!).getTime() - new Date(f.createdAt).getTime()) / 86400000;
        return s + days;
      }, 0) / wonLeads.length
    : 0;

  const inntekt = invoices?.summary.totalAmountExported ?? 0;
  const utgift = utgifter?.summary.totalAmount ?? 0;
  const resultat = inntekt - utgift;

  const snittFaktura = invoices && invoices.summary.exportedCount > 0
    ? inntekt / invoices.summary.exportedCount
    : 0;

  // Topp klienter
  const clientRevenue: Record<string, { name: string; total: number; count: number }> = {};
  (invoices?.invoices ?? []).forEach((inv) => {
    if (inv.status !== 'exported') return;
    const cName = inv.sak?.client?.name || 'Ukjent';
    if (!clientRevenue[cName]) clientRevenue[cName] = { name: cName, total: 0, count: 0 };
    clientRevenue[cName].total += parseFloat(inv.totalAmount);
    clientRevenue[cName].count += 1;
  });
  const topClients = Object.values(clientRevenue).sort((a, b) => b.total - a.total).slice(0, 5);

  // Pipeline-verdi (sum estimatedValue for ny + i_dialog)
  const pipelineValue = (foresporsler?.foresporsler ?? [])
    .filter((f) => f.status === 'ny' || f.status === 'i_dialog')
    .reduce((s, f) => s + (f.estimatedValue || 0), 0);

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Statistikk</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Tverrgående KPIer for virksomheten din.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => downloadPdf(`/pdf-reports/statistikk?year=${year}`, `statistikk-${year}.pdf`).catch((e) => setError(e.message))}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: '#f1f5f9', color: '#334155', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <FileDown size={14} /> PDF
            </button>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={selectStyle}>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div style={errBox}>{error}</div>}
        {!foresporsler && !error && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Laster…</div>}

        {foresporsler && invoices && utgifter && (
          <>
            {/* Lead-pipeline */}
            <Section title="Lead-pipeline">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <Kpi label="Aktive forespørsler" value={`${ny + inDialog}`} sub={`${ny} nye + ${inDialog} i dialog`} />
                <Kpi label="Konverteringsrate" value={`${konverteringsrate.toFixed(0)}%`}
                     sub={`${vunnet} vunnet / ${tapt} tapt`} color={konverteringsrate >= 50 ? '#14532d' : '#92400e'} />
                <Kpi label="Snitt tid → kunde" value={`${avgDaysToWin.toFixed(0)} dager`}
                     sub={`basert på ${wonLeads.length} vunnet`} />
                <Kpi label="Pipeline-verdi" value={`${pipelineValue.toLocaleString('nb-NO')} kr`}
                     sub="ventende forespørsler" color="#1e3a8a" />
              </div>
            </Section>

            {/* Økonomi */}
            <Section title={`Økonomi ${year}`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <Kpi label="Inntekt" value={`${inntekt.toLocaleString('nb-NO')} kr`} color="#14532d" />
                <Kpi label="Utgift" value={`${utgift.toLocaleString('nb-NO')} kr`} color="#7f1d1d" />
                <Kpi label="Resultat" value={`${resultat.toLocaleString('nb-NO')} kr`}
                     color={resultat >= 0 ? '#14532d' : '#7f1d1d'} />
                <Kpi label="Snitt faktura" value={`${snittFaktura.toLocaleString('nb-NO', { maximumFractionDigits: 0 })} kr`}
                     sub={`${invoices.summary.exportedCount} stk`} />
              </div>
            </Section>

            {/* Topp klienter */}
            {topClients.length > 0 && (
              <Section title="Topp klienter (etter omsetning)">
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  {topClients.map((c, i) => {
                    const pct = topClients[0].total > 0 ? (c.total / topClients[0].total) * 100 : 0;
                    return (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: i < topClients.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', width: 18 }}>#{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{c.name}</div>
                          <div style={{ background: '#e2e8f0', borderRadius: 999, height: 6, marginTop: 4 }}>
                            <div style={{ background: tokens.color.navy, height: '100%', width: `${pct}%`, borderRadius: 999 }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 120 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.color.navy }}>{c.total.toLocaleString('nb-NO')} kr</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.count} faktura</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Lead-konvertering visualisering */}
            <Section title="Forespørsler — fordeling">
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', height: 32, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}>
                  {(['ny', 'i_dialog', 'vunnet', 'tapt', 'arkivert'] as const).map((s) => {
                    const count = foresporsler.countsByStatus[s] ?? 0;
                    const total = Object.values(foresporsler.countsByStatus).reduce<number>((a, b) => (a ?? 0) + (b ?? 0), 0);
                    if (count === 0 || total === 0) return null;
                    const colors: Record<typeof s, string> = {
                      ny: '#dbeafe', i_dialog: '#fef3c7', vunnet: '#86efac', tapt: '#fca5a5', arkivert: '#cbd5e1',
                    };
                    return (
                      <div key={s} title={`${s}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: colors[s] }} />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                  {Object.entries(foresporsler.countsByStatus).map(([s, c]) => (
                    <span key={s}>{s}: <strong>{c}</strong></span>
                  ))}
                </div>
              </div>
            </Section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, color: '#475569', margin: '0 0 10px', fontWeight: 600 }}>{title}</h2>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || tokens.color.navy, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: 'white',
};
const errBox: React.CSSProperties = { background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 };
