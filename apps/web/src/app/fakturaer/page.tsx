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
import { api } from '@/lib/api';
import { Download, ExternalLink, X, Check, Trash2 } from 'lucide-react';

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
  createdAt: string;
  sak?: { id: string; title: string; client?: { id: string; name: string } | null } | null;
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
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await api<ApiResponse>(`/invoices?${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ukjent feil');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, statusFilter]);

  async function markPaid(id: string) {
    if (!confirm('Markere som betalt nå?')) return;
    await api(`/invoices/${id}`, { method: 'PATCH', body: { paidAt: new Date().toISOString() } as unknown });
    load();
    setSelected(null);
  }

  async function deleteDraft(id: string) {
    if (!confirm('Slett utkast? Tilknyttede timer frigjøres.')) return;
    await api(`/invoices/${id}`, { method: 'DELETE' });
    load();
    setSelected(null);
  }

  const filtered = data?.invoices ?? [];

  return (
    <AppLayout>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0 }}>Fakturaer</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
            Oversikt over utstedte fakturaer. Eksport skjer via Fiken/Tripletex i Innstillinger.
          </p>
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
        {filtered.length > 0 && (
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
                    <td style={td}>{inv.invoiceNumber || '—'}</td>
                    <td style={td}>{fmtDate(inv.periodEnd)}</td>
                    <td style={td}>{inv.sak?.client?.name || inv.customerName || '—'}</td>
                    <td style={td}>{inv.sak?.title || '—'}</td>
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
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </AppLayout>
  );
}

function DetailModal({
  invoice: inv, onClose, onMarkPaid, onDelete,
}: { invoice: Invoice; onClose: () => void; onMarkPaid: () => void; onDelete: () => void }) {
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

        {/* Aksjoner */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || ''}/invoice-pdf/${inv.id}`}
            target="_blank"
            rel="noopener"
            style={{ ...btnStyle, background: '#f1f5f9', color: '#334155', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Last ned PDF
          </a>
          {!inv.paidAt && inv.status !== 'cancelled' && (
            <button onClick={onMarkPaid} style={{ ...btnStyle, background: '#14532d', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> Marker betalt
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
    </div>
  );
}

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
