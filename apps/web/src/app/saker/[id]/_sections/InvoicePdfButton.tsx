'use client';

/**
 * Knapp + modal for å laste ned en faktura-PDF generert av Sakspilot-API-et.
 *
 * Bruker /invoice-pdf/sak/:sakId — som returnerer rå PDF-binær.
 * Vi går utenom api()-helperen siden den antar JSON; gjør en vanlig fetch()
 * mot /api/invoice-pdf/... (samme rewrite-prefix), legger på Bearer-token,
 * og trigger nedlasting via blob + anchor.
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { getToken } from '@/lib/api';

export default function InvoicePdfButton({ sakId }: { sakId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skjema-state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [includeNonBillable, setIncludeNonBillable] = useState(false);

  // Auto-fyll placeholder for fakturanummer hver gang modalen åpnes
  useEffect(() => {
    if (open && !invoiceNumber) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const suffix =
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      setInvoiceNumber(`INV-${y}${m}${d}-${suffix}`);
    }
  }, [open, invoiceNumber]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const body: Record<string, unknown> = {};
      if (invoiceNumber.trim()) body.invoiceNumber = invoiceNumber.trim();
      if (periodFrom) body.periodFrom = periodFrom;
      if (periodTo) body.periodTo = periodTo;
      if (extraNote.trim()) body.extraNote = extraNote.trim();
      if (includeNonBillable) body.includeNonBillable = true;

      const res = await fetch(`/api/invoice-pdf/sak/${sakId}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Forsøk å lese JSON-feilmelding fra backend
        let msg = `PDF-generering feilet (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          // ignore — ikke JSON
        }
        throw new Error(msg);
      }

      // Hent filnavn fra Content-Disposition hvis backend setter det
      const cd = res.headers.get('content-disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? `faktura-${sakId}.pdf`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '10px 18px',
          background: tokens.color.navy,
          color: 'white',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        📄 Last ned faktura-PDF
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(23, 43, 77, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: tokens.color.surface,
              borderRadius: tokens.radius.lg,
              boxShadow: tokens.shadow.xl,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: tokens.color.text }}>
                Lag faktura-PDF
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Lukk"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 22,
                  cursor: 'pointer',
                  color: tokens.color.textMuted,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Fakturanummer">
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-YYYYMMDD-NN"
                  style={inputStyle}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Periode fra">
                  <input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Periode til">
                  <input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field label="Notat (vises på faktura)">
                <textarea
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  rows={3}
                  placeholder="F.eks. takk for oppdraget!"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
                />
              </Field>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: tokens.color.text,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeNonBillable}
                  onChange={(e) => setIncludeNonBillable(e.target.checked)}
                />
                Inkluder ikke-fakturerbare timer
              </label>

              <p style={{ fontSize: 12, color: tokens.color.textMuted, margin: 0 }}>
                La periode-feltene være tomme for å ta med alle timer på saken.
                MVA settes til 25 % (norsk standardsats), forfall til 14 dager.
              </p>

              {error && (
                <div
                  style={{
                    padding: 10,
                    background: tokens.color.redSoft,
                    color: tokens.color.red,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    color: tokens.color.textMuted,
                    border: `1px solid ${tokens.color.border}`,
                    borderRadius: 10,
                    fontSize: 14,
                    cursor: busy ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  style={{
                    padding: '10px 18px',
                    background: tokens.color.navy,
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {busy ? 'Genererer…' : 'Generer PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: tokens.color.textMuted, fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  color: tokens.color.text,
  background: tokens.color.surface,
  outline: 'none',
};
