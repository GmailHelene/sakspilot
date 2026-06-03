'use client';

/**
 * Klient-portal — Mine fakturaer.
 *
 * Viser alle exported-fakturaer på tvers av klientens prosjekter, med:
 *   - KPI-strip: total / betalt / utestående / forfalt
 *   - Tabell med klikk-til-detalj
 *   - Detalj-modal viser linjer + betalingsstatus
 *
 * Klienten ser KUN sine egne fakturaer (backend filtrerer på clientId fra JWT).
 * Drafts og cancelled vises ikke.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import { portalApi, isPortalTokenValid, setPortalToken } from '@/lib/portalApi';
import { PortalTopBar, type PortalMe } from '../_PortalTopBar';

interface PortalInvoiceListItem {
  id: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  paidAt: string | null;
  totalHours: string;
  totalAmount: string;
  currency: string;
  status: string;
  sak: { id: string; title: string };
}

interface ListResponse {
  invoices: PortalInvoiceListItem[];
  summary: {
    total: number;
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
    overdueCount: number;
  };
}

interface PortalInvoiceDetail extends PortalInvoiceListItem {
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; sum?: number }> | null;
  note: string | null;
}

export default function PortalInvoices() {
  const router = useRouter();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PortalInvoiceDetail | null>(null);

  useEffect(() => {
    if (!isPortalTokenValid()) {
      router.replace('/portal/login');
      return;
    }
    portalApi<PortalMe>('/me').then(setMe).catch(() => {});
    portalApi<ListResponse>('/invoices')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Kunne ikke hente fakturaer'));
  }, [router]);

  function logout() {
    setPortalToken(null);
    router.replace('/portal/login');
  }

  async function openDetail(invoiceId: string) {
    try {
      const res = await portalApi<PortalInvoiceDetail>(`/invoices/${invoiceId}`);
      setSelected(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente detalj');
    }
  }

  return (
    <>
      <PortalTopBar me={me} onLogout={logout} />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, color: tokens.color.navy, margin: 0 }}>Mine fakturaer</h1>
          <Link href="/portal" style={{ fontSize: 13, color: tokens.color.textMuted, textDecoration: 'none' }}>
            ← Tilbake til oversikt
          </Link>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>
        )}

        {!data && !error && <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted }}>Laster…</div>}

        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <Kpi label="Antall fakturaer" value={String(data.summary.total)} />
              <Kpi label="Betalt" value={`${data.summary.paidAmount.toLocaleString('nb-NO')} kr`} color="#14532d" />
              <Kpi label="Utestående" value={`${data.summary.unpaidAmount.toLocaleString('nb-NO')} kr`}
                   color={data.summary.unpaidAmount > 0 ? '#92400e' : tokens.color.textMuted} />
              <Kpi label="Forfalt" value={String(data.summary.overdueCount)}
                   color={data.summary.overdueCount > 0 ? '#7f1d1d' : tokens.color.textMuted} />
            </div>

            {data.invoices.length === 0 ? (
              <div style={{ background: tokens.color.surface, border: `1px dashed ${tokens.color.border}`, borderRadius: 8, padding: 48, textAlign: 'center', color: tokens.color.textMuted }}>
                Du har ingen fakturaer enda.
              </div>
            ) : (
              <div style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: tokens.color.bgAlt, textAlign: 'left' }}>
                      <th style={th}>Nr.</th>
                      <th style={th}>Dato</th>
                      <th style={th}>Prosjekt</th>
                      <th style={{ ...th, textAlign: 'right' }}>Beløp</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((inv) => {
                      const overdue = !inv.paidAt && inv.dueDate && new Date(inv.dueDate) < new Date();
                      return (
                        <tr
                          key={inv.id}
                          onClick={() => openDetail(inv.id)}
                          style={{ borderTop: `1px solid ${tokens.color.bgAlt}`, cursor: 'pointer' }}
                        >
                          <td style={td}>{inv.invoiceNumber || '—'}</td>
                          <td style={td}>{fmtDate(inv.periodEnd)}</td>
                          <td style={td}>{inv.sak.title}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                            {fmtAmount(inv.totalAmount)} {inv.currency}
                          </td>
                          <td style={td}>
                            <StatusBadge inv={inv} overdue={!!overdue} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {selected && <DetailModal invoice={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function DetailModal({ invoice: inv, onClose }: { invoice: PortalInvoiceDetail; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 24, maxWidth: 600, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, color: tokens.color.navy, margin: 0 }}>
              Faktura {inv.invoiceNumber ? `#${inv.invoiceNumber}` : ''}
            </h2>
            <div style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 4 }}>
              {inv.sak.title} · {fmtDate(inv.periodEnd)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {inv.lineItems && inv.lineItems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, color: tokens.color.textMuted, margin: '0 0 8px' }}>Linjer</h3>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: tokens.color.bgAlt }}>
                <th style={th}>Beskrivelse</th>
                <th style={{ ...th, textAlign: 'right' }}>Antall</th>
                <th style={{ ...th, textAlign: 'right' }}>Pris</th>
                <th style={{ ...th, textAlign: 'right' }}>Sum</th>
              </tr></thead>
              <tbody>
                {inv.lineItems.map((li, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${tokens.color.bgAlt}` }}>
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

        <div style={{ marginTop: 16, padding: 12, background: tokens.color.bgAlt, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Timer:</span>
            <span style={{ fontWeight: 600 }}>{inv.totalHours}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 4 }}>
            <span>Sum:</span>
            <span style={{ fontWeight: 700, color: tokens.color.navy }}>{fmtAmount(inv.totalAmount)} {inv.currency}</span>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: tokens.color.textMuted }}>
          <div>Forfall: {inv.dueDate ? fmtDate(inv.dueDate) : '—'}</div>
          {inv.paidAt && <div style={{ color: '#14532d', marginTop: 4 }}>✓ Betalt {fmtDate(inv.paidAt)}</div>}
        </div>

        {inv.note && (
          <div style={{ marginTop: 12, fontSize: 12, color: tokens.color.textMuted }}>
            {inv.note}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 11, color: tokens.color.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || tokens.color.navy, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ inv, overdue }: { inv: PortalInvoiceListItem; overdue: boolean }) {
  const meta = inv.paidAt
    ? { label: 'Betalt', color: '#14532d', bg: '#dcfce7' }
    : overdue
      ? { label: 'Forfalt', color: '#7f1d1d', bg: '#fee2e2' }
      : { label: 'Ubetalt', color: '#92400e', bg: '#fef3c7' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg,
      padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase',
    }}>{meta.label}</span>
  );
}

function fmtDate(s: string) { return new Date(s).toLocaleDateString('nb-NO'); }
function fmtAmount(s: string) { return parseFloat(s).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: tokens.color.textMuted };
const td: React.CSSProperties = { padding: '10px 12px', color: tokens.color.text };
