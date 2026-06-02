'use client';

/**
 * /mva-rapport — Norsk MVA-oversikt per periode (Q1-Q4 / H1-H2 / hele året).
 *
 * Henter aggregert data fra /mva-rapport-endpoint. Viser:
 *   - KPI-strip: utgående MVA, inngående MVA, netto
 *   - Tabell utgående (per sats)
 *   - Tabell inngående (per sats)
 *   - Faktura-/utgift-liste
 *   - PDF-eksport
 *
 * NB: dette er ikke en MVA-melding (Altinn RF-0002) — bare en forenklet
 * oversikt frilanseren bruker som grunnlag for innlevering.
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, downloadPdf } from '@/lib/api';
import { FileDown, AlertTriangle } from 'lucide-react';

type Periode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'year';

interface SatsBucket { grunnlag: number; mva: number }
interface MvaSide {
  totalt: number;
  pers25: SatsBucket;
  pers15: SatsBucket;
  pers12: SatsBucket;
  persFritak: SatsBucket;
}

interface MvaResponse {
  organisasjon: { name: string; orgNumber: string | null };
  periode: string;
  periodeStart: string;
  periodeSlutt: string;
  utgaaendeMva: MvaSide;
  inngaaendeMva: MvaSide;
  nettoAaBetale: number;
  antallFakturaer: number;
  antallUtgifter: number;
  fakturaer: Array<{
    id: string;
    invoiceNumber: string | null;
    dato: string;
    total: number;
    mvaSats: number | null;
    mvaInkludert: boolean;
    status: string;
  }>;
  utgifter: Array<{
    id: string;
    dato: string;
    beskrivelse: string;
    belop: number;
    mvaSats: number | null;
    kategori: string | null;
    leverandor: string | null;
  }>;
  warnings: string[];
}

const currentYear = new Date().getFullYear();
const PERIODER: Array<{ value: Periode; label: string }> = [
  { value: 'Q1', label: 'Q1 (jan–mar)' },
  { value: 'Q2', label: 'Q2 (apr–jun)' },
  { value: 'Q3', label: 'Q3 (jul–sep)' },
  { value: 'Q4', label: 'Q4 (okt–des)' },
  { value: 'H1', label: 'Halvår 1' },
  { value: 'H2', label: 'Halvår 2' },
  { value: 'year', label: 'Hele året' },
];

export default function MvaRapportPage() {
  const [year, setYear] = useState(currentYear);
  // Default: nåværende kvartal
  const currentQ = Math.floor(new Date().getMonth() / 3) + 1;
  const [periode, setPeriode] = useState<Periode>(`Q${currentQ}` as Periode);
  const [data, setData] = useState<MvaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api<MvaResponse>(`/mva-rapport?year=${year}&periode=${periode}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente MVA-data');
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, periode]);

  async function downloadPdfReport() {
    try {
      await downloadPdf(`/pdf-reports/mva?year=${year}&periode=${periode}`, `mva-${periode}-${year}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF-nedlasting feilet');
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>MVA-rapport</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Forenklet oversikt. For innlevering må tall føres i Altinn (RF-0002).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={downloadPdfReport} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileDown size={14} /> PDF
            </button>
            <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} style={selectStyle}>
              {PERIODER.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={selectStyle}>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {error && <div style={errBox}>{error}</div>}
        {!data && !error && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Laster…</div>}

        {data && (
          <>
            {/* Periode-badge */}
            <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
              Periode: <strong>{data.periode}</strong> ({data.periodeStart} – {data.periodeSlutt}) ·{' '}
              {data.antallFakturaer} faktura{data.antallFakturaer === 1 ? '' : 'er'} ·{' '}
              {data.antallUtgifter} utgift{data.antallUtgifter === 1 ? '' : 'er'}
            </div>

            {/* Warnings */}
            {data.warnings.length > 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 10 }}>
                <AlertTriangle size={18} color="#92400e" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: '#92400e' }}>
                  {data.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              </div>
            )}

            {/* KPI-strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <KpiBox label="Utgående MVA" value={data.utgaaendeMva.totalt} color="#14532d" sub="på salg" />
              <KpiBox label="Inngående MVA" value={data.inngaaendeMva.totalt} color="#1e3a8a" sub="på kjøp" />
              <KpiBox
                label={data.nettoAaBetale >= 0 ? 'Til Skatteetaten' : 'Få igjen'}
                value={Math.abs(data.nettoAaBetale)}
                color={data.nettoAaBetale >= 0 ? '#7f1d1d' : '#14532d'}
                sub={data.nettoAaBetale >= 0 ? 'skyldig' : 'tilgode'}
                big
              />
            </div>

            {/* To-spalts: utgående og inngående */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <SatsTabell tittel="Utgående MVA (salg)" side={data.utgaaendeMva} />
              <SatsTabell tittel="Inngående MVA (kjøp)" side={data.inngaaendeMva} />
            </div>

            {/* Faktura-detalj */}
            {data.fakturaer.length > 0 && (
              <details style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Faktura-detalj ({data.fakturaer.length})
                </summary>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    <th style={th}>Nr.</th><th style={th}>Dato</th>
                    <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                    <th style={{ ...th, textAlign: 'right' }}>Sats</th>
                    <th style={th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {data.fakturaer.map((f) => (
                      <tr key={f.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={td}>{f.invoiceNumber || '—'}</td>
                        <td style={td}>{f.dato}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{f.total.toLocaleString('nb-NO')} kr</td>
                        <td style={{ ...td, textAlign: 'right' }}>{f.mvaSats != null ? `${f.mvaSats} %` : '—'} {f.mvaInkludert ? '(inkl)' : '(eks)'}</td>
                        <td style={td}>{f.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {data.utgifter.length > 0 && (
              <details style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Utgift-detalj ({data.utgifter.length})
                </summary>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    <th style={th}>Dato</th><th style={th}>Beskrivelse</th>
                    <th style={th}>Kategori</th>
                    <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                    <th style={{ ...th, textAlign: 'right' }}>Sats</th>
                  </tr></thead>
                  <tbody>
                    {data.utgifter.map((u) => (
                      <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={td}>{u.dato}</td><td style={td}>{u.beskrivelse}</td>
                        <td style={td}>{u.kategori || '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{u.belop.toLocaleString('nb-NO')} kr</td>
                        <td style={{ ...td, textAlign: 'right' }}>{u.mvaSats != null ? `${u.mvaSats} %` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {data.fakturaer.length === 0 && data.utgifter.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                Ingen fakturaer eller utgifter for valgt periode.
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function KpiBox({ label, value, color, sub, big }: { label: string; value: number; color: string; sub?: string; big?: boolean }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: big ? 30 : 22, fontWeight: 700, color, marginTop: 6 }}>
        {value.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', marginLeft: 4 }}>kr</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SatsTabell({ tittel, side }: { tittel: string; side: MvaSide }) {
  const rader: Array<{ label: string; b: SatsBucket }> = [
    { label: '25 %', b: side.pers25 },
    { label: '15 %', b: side.pers15 },
    { label: '12 %', b: side.pers12 },
    { label: '0 % / fritak', b: side.persFritak },
  ].filter((r) => r.b.grunnlag !== 0 || r.b.mva !== 0);

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: '#475569', margin: '0 0 12px' }}>{tittel}</h3>
      {rader.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>Ingen data</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...th, paddingLeft: 0 }}>Sats</th>
              <th style={{ ...th, textAlign: 'right' }}>Grunnlag</th>
              <th style={{ ...th, textAlign: 'right', paddingRight: 0 }}>MVA</th>
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => (
              <tr key={r.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...td, paddingLeft: 0 }}>{r.label}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.b.grunnlag.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}</td>
                <td style={{ ...td, textAlign: 'right', paddingRight: 0, fontWeight: 600 }}>
                  {r.b.mva.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, paddingLeft: 0, fontWeight: 700, paddingTop: 10 }}>Sum</td>
              <td style={{ ...td, textAlign: 'right' }}></td>
              <td style={{ ...td, textAlign: 'right', paddingRight: 0, fontWeight: 700, fontSize: 14, color: tokens.color.navy }}>
                {side.totalt.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: 'white',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#475569', textAlign: 'left' };
const td: React.CSSProperties = { padding: '8px 10px', color: '#0f172a' };
const errBox: React.CSSProperties = { background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 };
