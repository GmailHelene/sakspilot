'use client';

/**
 * /regnskap — Regnskaps-oversikt for året.
 *
 * Tre seksjoner:
 *   1. Inntekter (sum eksporterte fakturaer per måned)
 *   2. Utgifter (Utgift-tabellen) — opprett, kategoriser, slett
 *   3. Resultat (inntekter − utgifter, samt MVA-status)
 *
 * Skattetabell-skisse: 35% avsetning (matcher hub-default).
 * Forenklet — ikke et fullt regnskapsverktøy, men gir frilanseren
 * et raskt bilde av cash flow.
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { Plus, X, Trash2 } from 'lucide-react';

interface Utgift {
  id: string;
  dato: string;
  beskrivelse: string;
  belopInkMva: string;
  mvaSats: number | null;
  kategori: string | null;
  leverandor: string | null;
  notes: string | null;
}

interface UtgiftResponse {
  utgifter: Utgift[];
  summary: {
    total: number;
    totalAmount: number;
    byKategori: Array<{ kategori: string; count: number; sum: number }>;
  };
}

interface InvoiceSummary {
  invoices: Array<{
    id: string;
    invoiceNumber: string | null;
    periodEnd: string;
    totalAmount: string;
    status: string;
    paidAt: string | null;
  }>;
  summary: {
    totalAmountExported: number;
    exportedCount: number;
  };
}

const currentYear = new Date().getFullYear();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

export default function RegnskapPage() {
  const [year, setYear] = useState(currentYear);
  const [utg, setUtg] = useState<UtgiftResponse | null>(null);
  const [inv, setInv] = useState<InvoiceSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [u, i] = await Promise.all([
        api<UtgiftResponse>(`/utgifter?year=${year}`),
        api<InvoiceSummary>(`/invoices?year=${year}&status=exported`),
      ]);
      setUtg(u);
      setInv(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);

  async function deleteUtgift(id: string) {
    if (!confirm('Slette utgiften?')) return;
    await api(`/utgifter/${id}`, { method: 'DELETE' });
    load();
  }

  // Beregninger
  const inntekter = inv?.summary.totalAmountExported || 0;
  const utgifter = utg?.summary.totalAmount || 0;
  const resultat = inntekter - utgifter;
  const avsetning = Math.max(0, resultat) * 0.35;     // 35% skatt + sosiale avgifter

  // Måneds-aggregering for søyle-graf
  const byMonth = Array.from({ length: 12 }, (_, m) => {
    const monthIncome = (inv?.invoices ?? [])
      .filter((i) => new Date(i.periodEnd).getMonth() === m)
      .reduce((s, i) => s + parseFloat(i.totalAmount), 0);
    const monthExpense = (utg?.utgifter ?? [])
      .filter((u) => new Date(u.dato).getMonth() === m)
      .reduce((s, u) => s + parseFloat(u.belopInkMva), 0);
    return { month: m, income: monthIncome, expense: monthExpense };
  });
  const maxMonthValue = Math.max(...byMonth.flatMap((b) => [b.income, b.expense]), 1);

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Regnskap</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Forenklet kontant-oversikt. For komplett bokføring eksporter til Fiken via Innstillinger.
            </p>
          </div>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={selectStyle}>
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {error && <div style={errBox}>{error}</div>}

        {/* KPI-strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Kpi label="Inntekter" value={inntekter} color="#14532d" />
          <Kpi label="Utgifter" value={utgifter} color="#7f1d1d" />
          <Kpi label="Resultat" value={resultat} color={resultat >= 0 ? '#14532d' : '#7f1d1d'} />
          <Kpi label="Anbefalt avsetning (35%)" value={avsetning} color="#92400e" />
        </div>

        {/* Måneds-graf */}
        {(utg && inv) && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: '#475569', margin: '0 0 12px' }}>Per måned</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', minHeight: 120 }}>
              {byMonth.map((b) => (
                <div key={b.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80, width: '100%', justifyContent: 'center' }}>
                    <div
                      title={`Inntekt: ${b.income.toLocaleString('nb-NO')} kr`}
                      style={{
                        width: '40%', background: '#22c55e',
                        height: `${(b.income / maxMonthValue) * 100}%`, minHeight: b.income > 0 ? 2 : 0, borderRadius: '2px 2px 0 0',
                      }}
                    />
                    <div
                      title={`Utgift: ${b.expense.toLocaleString('nb-NO')} kr`}
                      style={{
                        width: '40%', background: '#ef4444',
                        height: `${(b.expense / maxMonthValue) * 100}%`, minHeight: b.expense > 0 ? 2 : 0, borderRadius: '2px 2px 0 0',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{MONTHS[b.month]}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b', marginTop: 8, justifyContent: 'center' }}>
              <span><span style={{ background: '#22c55e', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }} />Inntekt</span>
              <span><span style={{ background: '#ef4444', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }} />Utgift</span>
            </div>
          </div>
        )}

        {/* Utgifter-tabell */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, margin: 0 }}>Utgifter</h2>
          <button
            onClick={() => setCreating(true)}
            style={{ ...btnStyle, background: tokens.color.navy, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Ny utgift
          </button>
        </div>

        {!utg && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Laster…</div>}
        {utg && utg.utgifter.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
            Ingen utgifter registrert for {year}. Klikk Ny utgift for å legge til.
          </div>
        )}
        {utg && utg.utgifter.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={th}>Dato</th>
                  <th style={th}>Beskrivelse</th>
                  <th style={th}>Kategori</th>
                  <th style={th}>Leverandør</th>
                  <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                  <th style={{ ...th, textAlign: 'right' }}>MVA</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {utg.utgifter.map((u) => (
                  <tr key={u.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={td}>{new Date(u.dato).toLocaleDateString('nb-NO')}</td>
                    <td style={td}>{u.beskrivelse}</td>
                    <td style={td}>{u.kategori || '—'}</td>
                    <td style={td}>{u.leverandor || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                      {parseFloat(u.belopInkMva).toLocaleString('nb-NO')} kr
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{u.mvaSats != null ? `${u.mvaSats} %` : '—'}</td>
                    <td style={td}>
                      <button onClick={() => deleteUtgift(u.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Per-kategori */}
        {utg && utg.summary.byKategori.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, color: '#475569' }}>Utgifter per kategori</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {utg.summary.byKategori
                .sort((a, b) => b.sum - a.sum)
                .map((k) => (
                  <div key={k.kategori} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{k.kategori}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: tokens.color.navy }}>{k.sum.toLocaleString('nb-NO')} kr</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{k.count} stk</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </AppLayout>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [dato, setDato] = useState(new Date().toISOString().slice(0, 10));
  const [beskrivelse, setBeskrivelse] = useState('');
  const [belop, setBelop] = useState('');
  const [mvaSats, setMvaSats] = useState('25');
  const [kategori, setKategori] = useState('');
  const [leverandor, setLeverandor] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!beskrivelse.trim() || !belop) return;
    setSaving(true);
    try {
      await api('/utgifter', {
        method: 'POST',
        body: {
          dato,
          beskrivelse: beskrivelse.trim(),
          belopInkMva: parseFloat(belop),
          mvaSats: mvaSats ? parseInt(mvaSats) : null,
          kategori: kategori.trim() || undefined,
          leverandor: leverandor.trim() || undefined,
        },
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: 20, maxWidth: 500, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, margin: 0 }}>Ny utgift</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Dato" required>
              <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} required style={inputStyle} />
            </Field>
            <Field label="Beløp (inkl. MVA)" required>
              <input type="number" step="0.01" value={belop} onChange={(e) => setBelop(e.target.value)} required style={inputStyle} />
            </Field>
          </div>
          <Field label="Beskrivelse" required>
            <input value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} required style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="MVA %">
              <select value={mvaSats} onChange={(e) => setMvaSats(e.target.value)} style={inputStyle}>
                <option value="">Ingen</option>
                <option value="0">0 %</option>
                <option value="15">15 %</option>
                <option value="25">25 %</option>
              </select>
            </Field>
            <Field label="Kategori"><input value={kategori} onChange={(e) => setKategori(e.target.value)} list="kat" style={inputStyle} /></Field>
            <Field label="Leverandør"><input value={leverandor} onChange={(e) => setLeverandor(e.target.value)} style={inputStyle} /></Field>
          </div>
          <datalist id="kat">
            <option value="Drift" /><option value="Kontor" /><option value="Programvare" />
            <option value="Reise" /><option value="Abonnement" /><option value="Annet" />
          </datalist>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155' }}>Avbryt</button>
            <button type="submit" disabled={saving} style={{ ...btnStyle, background: tokens.color.navy, color: 'white' }}>
              {saving ? 'Lagrer…' : 'Lagre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value.toLocaleString('nb-NO')} kr</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: 'white',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box',
};
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#475569' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#0f172a' };
const btnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};
const errBox: React.CSSProperties = { background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 };
