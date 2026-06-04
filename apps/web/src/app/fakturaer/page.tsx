'use client';

/**
 * /fakturaer — Faktura-oversikt.
 *
 * Visning: tabell med år-filter + status-filter. Header viser KPIer.
 * Klikk på rad → detalj-modal med linjer + PDF-link + handlinger.
 *
 * Aksjoner:
 *   - Marker betalt (PATCH paidAt)
 *   - Eksporter til Fiken (POST /accounting/fiken/create-invoice)
 *   - Last ned PDF (GET /invoice-pdf/:id)
 *   - Slett (kun draft)
 *
 * Faktura-OPPRETTING gjøres via sak-detaljsiden (Sakspilot-stilen) eller
 * via accounting.ts/Fiken. Denne sida er for vise + administrere.
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, downloadPdf, ApiError } from '@/lib/api';
import { SearchBar } from '@/components/SearchBar';
import { useConfirm } from '@/components/ConfirmDialog';
import { Download, ExternalLink, X, Check, Trash2, Plus, FileDown, Mail, Bell } from 'lucide-react';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  sum?: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  paidAt: string | null;
  totalHours: string;       // Decimal serialiseres som string
  totalAmount: string;
  currency: string;
  status: 'draft' | 'exported' | 'cancelled';
  exportedTo: string | null;
  exportedAt: string | null;
  externalRef: string | null;
  customerName: string | null;
  customerAddress: string | null;
  lineItems: LineItem[] | null;
  note: string | null;
  sentEmailAt: string | null;
  sentEmailTo: string | null;
  reminderSentAt: string | null;
  reminderCount: number;
  createdAt: string;
  sak?: { id: string; title: string; client?: { id: string; name: string; contactEmail?: string | null } | null } | null;
  _count?: { timeEntries: number };
}

interface ApiResponse {
  invoices: Invoice[];
  summary: {
    total: number;
    draftCount: number;
    exportedCount: number;
    cancelledCount: number;
    totalAmountExported: number;
    totalAmountDraft: number;
  };
}

const currentYear = new Date().getFullYear();

export default function FakturaerPage() {
  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'exported' | 'cancelled'>('all');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [q, setQ] = useState('');
  const confirm = useConfirm();
  // Mobil-modus: under 700 px bytter vi til kort-stack istedenfor bred tabell
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    function check() { setIsNarrow(window.innerWidth < 700); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  async function downloadListPdf() {
    setDownloadingPdf(true);
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      await downloadPdf(`/pdf-reports/fakturaer?${qs}`, `fakturaer-${year}${statusFilter !== 'all' ? `-${statusFilter}` : ''}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF-nedlasting feilet');
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function load() {
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (q) qs.set('q', q);
      const res = await api<ApiResponse>(`/invoices?${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, statusFilter, q]);

  async function markPaid(id: string) {
    const ok = await confirm({
      title: 'Markere som betalt?',
      body: 'Fakturaen markeres som betalt med dagens dato. Brukes for innbetalinger som har kommet på konto.',
      confirmLabel: 'Marker betalt',
    });
    if (!ok) return;
    await api(`/invoices/${id}`, { method: 'PATCH', body: { paidAt: new Date().toISOString() } as unknown });
    load();
    setSelected(null);
  }

  async function deleteDraft(id: string) {
    const ok = await confirm({
      title: 'Slette utkast?',
      body: 'Fakturautkastet slettes permanent. Eventuelle timer som var tilknyttet frigjøres så de kan brukes på ny faktura.',
      confirmLabel: 'Slett',
      danger: true,
    });
    if (!ok) return;
    await api(`/invoices/${id}`, { method: 'DELETE' });
    load();
    setSelected(null);
  }

  const filtered = data?.invoices ?? [];

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Fakturaer</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Oversikt over utstedte fakturaer. Eksport skjer via Fiken/Tripletex i Innstillinger.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={downloadListPdf}
              disabled={downloadingPdf}
              style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <FileDown size={14} /> {downloadingPdf ? 'Laster…' : 'PDF-liste'}
            </button>
            <button
              onClick={() => setCreating(true)}
              style={{ ...btnStyle, background: tokens.color.navy, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Ny faktura
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* KPI-strip */}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <Kpi label="Eksportert" value={data.summary.totalAmountExported} suffix="kr" sub={`${data.summary.exportedCount} stk`} />
            <Kpi label="Utkast" value={data.summary.totalAmountDraft} suffix="kr" sub={`${data.summary.draftCount} stk`} />
            <Kpi label="Antall totalt" value={data.summary.total} sub={`${year}`} />
            <Kpi label="Annullert" value={data.summary.cancelledCount} sub="i år" />
          </div>
        )}

        {/* Filter-rad */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <SearchBar value={q} onChange={setQ} placeholder="Søk fakturanr / kunde / sak…" width={280} />
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={selectStyle}>
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'draft' | 'exported' | 'cancelled')} style={selectStyle}>
            <option value="all">Alle statuser</option>
            <option value="draft">Utkast</option>
            <option value="exported">Eksportert</option>
            <option value="cancelled">Annullert</option>
          </select>
        </div>

        {/* Tabell */}
        {!data && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Laster…</div>}
        {data && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
            Ingen fakturaer for valgt filter. Opprett en faktura fra en sak.
          </div>
        )}
        {filtered.length > 0 && !isNarrow && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={th}>Nr.</th>
                  <th style={th}>Dato</th>
                  <th style={th}>Kunde</th>
                  <th style={th}>Sak</th>
                  <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                  <th style={th}>Status</th>
                  <th style={th}>Forfall / Betalt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                  >
                    <td style={td}>{inv.invoiceNumber || '-'}</td>
                    <td style={td}>{fmtDate(inv.periodEnd)}</td>
                    <td style={td}>{inv.sak?.client?.name || inv.customerName || '-'}</td>
                    <td style={td}>{inv.sak?.title || '-'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                      {fmtAmount(inv.totalAmount)} {inv.currency}
                    </td>
                    <td style={td}><StatusBadge status={inv.status} paidAt={inv.paidAt} /></td>
                    <td style={td}>
                      {inv.paidAt
                        ? <span style={{ color: '#14532d' }}>Betalt {fmtDate(inv.paidAt)}</span>
                        : inv.dueDate
                          ? <span style={{ color: isOverdue(inv.dueDate) ? '#dc2626' : '#64748b' }}>
                              {isOverdue(inv.dueDate) ? 'Forfalt' : 'Forfall'} {fmtDate(inv.dueDate)}
                            </span>
                          : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobil-vennlig kort-stack - vises i stedet for tabell under 700px */}
        {filtered.length > 0 && isNarrow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((inv) => (
              <div
                key={inv.id}
                onClick={() => setSelected(inv)}
                style={{
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: 12, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                      {inv.sak?.client?.name || inv.customerName || '-'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ''}{fmtDate(inv.periodEnd)}
                    </div>
                  </div>
                  <StatusBadge status={inv.status} paidAt={inv.paidAt} />
                </div>
                {inv.sak?.title && (
                  <div style={{ fontSize: 11, color: '#475569' }}>{inv.sak.title}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: tokens.color.navy }}>
                    {fmtAmount(inv.totalAmount)} {inv.currency}
                  </span>
                  <span style={{ fontSize: 11, color: inv.paidAt ? '#14532d' : (inv.dueDate && isOverdue(inv.dueDate) ? '#dc2626' : '#64748b') }}>
                    {inv.paidAt
                      ? `Betalt ${fmtDate(inv.paidAt)}`
                      : inv.dueDate
                        ? `${isOverdue(inv.dueDate) ? 'Forfalt' : 'Forfall'} ${fmtDate(inv.dueDate)}`
                        : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <DetailModal
          invoice={selected}
          onClose={() => setSelected(null)}
          onMarkPaid={() => markPaid(selected.id)}
          onDelete={() => deleteDraft(selected.id)}
        />
      )}
      {creating && (
        <CreateInvoiceModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </AppLayout>
  );
}

// ── Opprett-modal ──────────────────────────────────────────────────
interface SakOption { id: string; title: string; client: { id: string; name: string } | null }
interface ClientOption { id: string; name: string }

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saker, setSaker] = useState<SakOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sakId, setSakId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Array<{ description: string; quantity: string; unitPrice: string }>>([
    { description: '', quantity: '1', unitPrice: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ saker?: SakOption[] }>('/saker').then((r) => setSaker(r.saker || [])).catch(() => {});
    api<{ clients?: ClientOption[] }>('/klienter').then((r) => setClients(r.clients || [])).catch(() => {});
  }, []);

  const total = lines.reduce((s, l) => {
    const q = parseFloat(l.quantity) || 0;
    const p = parseFloat(l.unitPrice) || 0;
    return s + q * p;
  }, 0);

  function updateLine(idx: number, key: 'description' | 'quantity' | 'unitPrice', value: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }
  function addLine() { setLines((p) => [...p, { description: '', quantity: '1', unitPrice: '' }]); }
  function removeLine(idx: number) { setLines((p) => p.filter((_, i) => i !== idx)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validLines = lines
      .filter((l) => l.description.trim() && l.quantity && l.unitPrice)
      .map((l) => ({
        description: l.description.trim(),
        quantity: parseFloat(l.quantity),
        unitPrice: parseFloat(l.unitPrice),
      }));
    if (validLines.length === 0) {
      setError('Minst én komplett linje kreves (beskrivelse + antall + pris)');
      return;
    }
    if (!sakId && !customerName.trim()) {
      setError('Velg sak ELLER skriv inn kundenavn');
      return;
    }
    setSaving(true);
    try {
      await api('/invoices', {
        method: 'POST',
        body: {
          sakId: sakId || undefined,
          customerName: customerName.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          periodStart,
          periodEnd,
          dueDate,
          lineItems: validLines,
          note: note.trim() || undefined,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 24, maxWidth: 720, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, color: tokens.color.navy, margin: 0 }}>Ny faktura</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Mottaker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Tilknyttet sak (anbefalt)
            </label>
            <select value={sakId} onChange={(e) => setSakId(e.target.value)} style={modalInput}>
              <option value="">- Ingen sak (manuell faktura) -</option>
              {saker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} {s.client ? `(${s.client.name})` : '- ingen klient'}
                </option>
              ))}
            </select>
          </div>

          {!sakId && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                Kundenavn (når ingen sak er valgt) *
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                list="client-names"
                placeholder="Skriv eller velg eksisterende klient"
                style={modalInput}
              />
              <datalist id="client-names">
                {clients.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Fakturanr."><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto" style={modalInput} /></Field>
            <Field label="Fakturadato" required><input type="date" required value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPeriodStart(e.target.value); }} style={modalInput} /></Field>
            <Field label="Forfall"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={modalInput} /></Field>
          </div>

          {/* Linjer */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Linjer *</span>
              <button type="button" onClick={addLine} style={{ ...modalBtn, background: '#f1f5f9', color: '#334155', fontSize: 12, padding: '4px 10px' }}>
                + Legg til linje
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 30px', gap: 8, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                <span>Beskrivelse</span><span style={{ textAlign: 'right' }}>Antall</span><span style={{ textAlign: 'right' }}>Pris</span><span style={{ textAlign: 'right' }}>Sum</span><span />
              </div>
              {lines.map((l, i) => {
                const sum = (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 30px', gap: 8 }}>
                    <input value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="f.eks. Konsulenttimer" style={modalInput} />
                    <input type="number" step="0.5" value={l.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} style={{ ...modalInput, textAlign: 'right' }} />
                    <input type="number" step="0.01" value={l.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} style={{ ...modalInput, textAlign: 'right' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                      {sum > 0 ? sum.toLocaleString('nb-NO') : '-'}
                    </div>
                    <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                            style={{ background: 'transparent', border: 'none', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: '#dc2626', opacity: lines.length === 1 ? 0.3 : 1 }}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '2px solid #cbd5e1', marginTop: 12, paddingTop: 8 }}>
              {/* MVA-breakdown - antar pris inkl. 25 % MVA (hub-konvensjon).
                  Hvis vi senere får mvaInkludert-toggle, byttes formelen ut. */}
              {total > 0 && (() => {
                const mva = total * 0.25 / 1.25;
                const netto = total - mva;
                return (
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 4 }}>
                    <span>Netto: <strong style={{ color: '#0f172a' }}>{netto.toLocaleString('nb-NO', { maximumFractionDigits: 2 })}</strong></span>
                    <span>MVA (25 %): <strong style={{ color: '#0f172a' }}>{mva.toLocaleString('nb-NO', { maximumFractionDigits: 2 })}</strong></span>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: tokens.color.navy }}>
                  Totalt inkl. MVA: {total.toLocaleString('nb-NO')} NOK
                </span>
              </div>
            </div>
          </div>

          <Field label="Notat (vises nederst på PDF)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...modalInput, fontFamily: 'inherit' }} />
          </Field>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...modalBtn, background: '#f1f5f9', color: '#334155' }}>Avbryt</button>
            <button type="submit" disabled={saving} style={{ ...modalBtn, background: tokens.color.navy, color: 'white' }}>
              {saving ? 'Lagrer…' : 'Opprett som utkast'}
            </button>
          </div>
        </form>
      </div>
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

const modalInput: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
  width: '100%', boxSizing: 'border-box',
};
const modalBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};

function DetailModal({
  invoice: inv, onClose, onMarkPaid, onDelete,
}: { invoice: Invoice; onClose: () => void; onMarkPaid: () => void; onDelete: () => void }) {
  const [sendOpen, setSendOpen] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);
  const confirm = useConfirm();

  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date();
  const canRemind = isOverdue && !inv.paidAt && inv.status !== 'cancelled';

  async function sendReminder() {
    const reminderNum = inv.reminderCount + 1;
    const label = reminderNum === 1 ? 'Vennlig påminnelse' : reminderNum === 2 ? 'Andre påminnelse' : 'SISTE purring';
    const days = Math.floor((Date.now() - new Date(inv.dueDate!).getTime()) / 86400000);
    const ok = await confirm({
      title: `Send «${label}»?`,
      body: `Fakturaen er ${days} dager forsinket. Vi sender en epost til kunden med faktura-PDF og purrer på beløpet.`,
      confirmLabel: 'Send purring',
      danger: reminderNum >= 3,
    });
    if (!ok) return;
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const res = await api<{ ok: boolean; reminderNum: number; daysOverdue: number }>(`/invoices/${inv.id}/send-reminder`, {
        method: 'POST',
        body: {},  // bruk default mottaker + body
      });
      setReminderResult(`✓ ${label} sendt (purring ${res.reminderNum})`);
    } catch (err) {
      const msg = err instanceof ApiError
        ? `${err.message}: ${typeof err.details === 'string' ? err.details : ''}`.trim()
        : err instanceof Error ? err.message : 'Send feilet';
      setReminderResult(`✗ ${msg}`);
    } finally {
      setSendingReminder(false);
    }
  }
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 24, maxWidth: 700, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, color: tokens.color.navy, margin: 0 }}>
              Faktura {inv.invoiceNumber ? `#${inv.invoiceNumber}` : '(intet nummer)'}
            </h2>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)} ·{' '}
              {inv.sak?.client?.name || inv.customerName || 'Ingen kunde'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <StatusBadge status={inv.status} paidAt={inv.paidAt} />

        {/* Linjer */}
        {inv.lineItems && inv.lineItems.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, color: '#475569', marginBottom: 8 }}>Linjer</h3>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}>Beskrivelse</th>
                  <th style={{ ...th, textAlign: 'right' }}>Antall</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pris</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sum</th>
                </tr>
              </thead>
              <tbody>
                {inv.lineItems.map((li, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={td}>{li.description}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{li.quantity}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{li.unitPrice.toLocaleString('nb-NO')}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                      {(li.sum ?? li.unitPrice * li.quantity).toLocaleString('nb-NO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Totalt timer:</span>
            <span style={{ fontWeight: 600 }}>{inv.totalHours}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 4 }}>
            <span>Sum:</span>
            <span style={{ fontWeight: 700, color: tokens.color.navy }}>
              {fmtAmount(inv.totalAmount)} {inv.currency}
            </span>
          </div>
        </div>

        {inv.exportedTo && (
          <div style={{ marginTop: 12, padding: 10, background: '#dcfce7', borderRadius: 6, fontSize: 12, color: '#14532d' }}>
            Eksportert til {inv.exportedTo} {inv.externalRef && `(ref: ${inv.externalRef})`}
          </div>
        )}

        {inv.note && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Notat</div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>{inv.note}</div>
          </div>
        )}

        {/* Sent-stempel hvis sendt før */}
        {inv.sentEmailAt && inv.sentEmailTo && (
          <div style={{ marginTop: 12, padding: 10, background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e3a8a' }}>
            📧 Sendt på epost til <strong>{inv.sentEmailTo}</strong> {new Date(inv.sentEmailAt).toLocaleString('nb-NO')}
          </div>
        )}

        {/* Purring-historikk */}
        {inv.reminderCount > 0 && inv.reminderSentAt && (
          <div style={{ marginTop: 8, padding: 10, background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
            🔔 {inv.reminderCount} purring{inv.reminderCount === 1 ? '' : 'er'} sendt - sist {new Date(inv.reminderSentAt).toLocaleString('nb-NO')}
          </div>
        )}

        {/* Resultat av nylig purring-send */}
        {reminderResult && (
          <div style={{
            marginTop: 8, padding: 10, borderRadius: 6, fontSize: 12,
            background: reminderResult.startsWith('✓') ? '#dcfce7' : '#fee2e2',
            color: reminderResult.startsWith('✓') ? '#14532d' : '#991b1b',
          }}>{reminderResult}</div>
        )}

        {/* Aksjoner */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSendOpen(true)}
            style={{ ...btnStyle, background: '#1e3a8a', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Mail size={14} /> {inv.sentEmailAt ? 'Send på nytt' : 'Send på epost'}
          </button>
          <button
            onClick={() => downloadPdf(`/invoice-pdf/invoice/${inv.id}`, `faktura-${inv.invoiceNumber || inv.id.slice(0, 8)}.pdf`)}
            style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Last ned PDF
          </button>
          {!inv.paidAt && inv.status !== 'cancelled' && (
            <button onClick={onMarkPaid} style={{ ...btnStyle, background: '#14532d', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> Marker betalt
            </button>
          )}
          {canRemind && (
            <button
              onClick={sendReminder}
              disabled={sendingReminder}
              style={{ ...btnStyle, background: '#92400e', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Bell size={14} />
              {sendingReminder
                ? 'Sender purring…'
                : inv.reminderCount === 0
                  ? 'Send purring'
                  : inv.reminderCount === 1
                    ? 'Send andre påminnelse'
                    : 'Send siste purring'}
            </button>
          )}
          {inv.status === 'draft' && (
            <button onClick={onDelete} style={{ ...btnStyle, background: '#fee2e2', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={14} /> Slett utkast
            </button>
          )}
          {inv.sak && (
            <a
              href={`/saker/${inv.sak.id}`}
              style={{ ...btnStyle, background: 'transparent', color: tokens.color.navy, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={14} /> Åpne sak
            </a>
          )}
        </div>
      </div>
      {sendOpen && (
        <SendEmailModal
          invoice={inv}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSendOpen(false); onClose(); /* close detail → parent will refresh */ }}
        />
      )}
    </div>
  );
}

function SendEmailModal({
  invoice: inv, onClose, onSent,
}: { invoice: Invoice; onClose: () => void; onSent: () => void }) {
  // Default mottaker = klientens kontakt-epost, eller forrige send-mottaker
  const defaultTo = inv.sentEmailTo || inv.sak?.client?.contactEmail || '';
  const defaultSubject = `Faktura ${inv.invoiceNumber || ''} fra Sakspilot`;
  const customerName = inv.sak?.client?.name || inv.customerName || 'kunden';
  const totalStr = `${fmtAmount(inv.totalAmount)} ${inv.currency}`;
  const dueStr = inv.dueDate ? fmtDate(inv.dueDate) : null;
  const defaultBody = `Hei ${customerName},

Vedlagt finner du faktura ${inv.invoiceNumber || ''} på ${totalStr}${dueStr ? ` med forfall ${dueStr}` : ''}.

Si fra hvis det er noe spørsmål.

Mvh`;

  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) { setError('Mottaker mangler'); return; }
    setSending(true); setError(null);
    try {
      // Konverter \n → <br> for HTML-versjonen av epost-body
      // Sanitér epost-body før vi pakker den inn i HTML-tags. Tidligere
      // dyttet vi user-input direkte inn i en <p> — en kunde med <img onerror>
      // i body kunne kjøre script i ANDRE klients innboks (XSS i utgående
      // epost). Vi escaper alle HTML-spesielle tegn før innpakking.
      const escapeHtml = (s: string): string => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      const bodyHtml = body.split('\n').map((l) =>
        l.trim() === '' ? '<br>' : `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`
      ).join('');
      await api(`/invoices/${inv.id}/send-email`, {
        method: 'POST',
        body: {
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim() || undefined,
          body: bodyHtml,
        },
      });
      onSent();
    } catch (err) {
      // Vis bakre-detalj så bruker forstår hva som faktisk feilet
      // (typisk "SMTP not configured" eller "Invalid login").
      if (err instanceof ApiError) {
        const detail = typeof err.details === 'string' ? err.details : '';
        setError(detail ? `${err.message}: ${detail}` : err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Send feilet');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 110,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 20, maxWidth: 560, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0, color: tokens.color.navy }}>Send faktura på epost</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            Til *
            <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} style={inputBox} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            CC (valgfri)
            <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="komma-separert" style={inputBox} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            Emne
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputBox} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
            Melding
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} style={{ ...inputBox, fontFamily: 'inherit', resize: 'vertical' }} />
          </label>
          <div style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: 8, borderRadius: 6 }}>
            📎 Faktura-PDF (<strong>faktura-{inv.invoiceNumber || inv.id.slice(0,8)}.pdf</strong>) legges automatisk ved.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, background: '#f1f5f9', color: '#334155' }}>Avbryt</button>
            <button type="submit" disabled={sending || !to.trim()} style={{ ...btnStyle, background: '#1e3a8a', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={14} /> {sending ? 'Sender…' : 'Send nå'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputBox: React.CSSProperties = {
  display: 'block', marginTop: 4, padding: '8px 10px',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box',
};

function StatusBadge({ status, paidAt }: { status: Invoice['status']; paidAt: string | null }) {
  const meta = paidAt
    ? { label: 'Betalt', color: '#14532d', bg: '#dcfce7' }
    : status === 'draft'
      ? { label: 'Utkast', color: '#92400e', bg: '#fef3c7' }
      : status === 'exported'
        ? { label: 'Sendt', color: '#1e3a8a', bg: '#dbeafe' }
        : { label: 'Annullert', color: '#7f1d1d', bg: '#fee2e2' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg,
      padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase',
    }}>{meta.label}</span>
  );
}

function Kpi({ label, value, suffix, sub }: { label: string; value: number; suffix?: string; sub?: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tokens.color.navy, marginTop: 4 }}>
        {typeof value === 'number' && suffix === 'kr' ? value.toLocaleString('nb-NO') : value}
        {suffix && <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', marginLeft: 4 }}>{suffix}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmtDate(d: string) { return new Date(d).toLocaleDateString('nb-NO'); }
function fmtAmount(d: string) { return parseFloat(d).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function isOverdue(due: string) { return new Date(due) < new Date(); }

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: 'white',
};
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#475569' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#0f172a' };
const btnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
};
