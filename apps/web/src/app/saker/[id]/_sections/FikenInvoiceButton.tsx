'use client';

/**
 * Knapp + dialog for å pushe billable timer på en sak til Fiken som fakturadraft.
 * Vises kun når det finnes fakturerbare timer.
 */

import { useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

export default function FikenInvoiceButton({
  sakId,
  hours,
  amount,
}: {
  sakId: string;
  hours: number;
  amount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; viewUrl: string; invoiceNumber?: string }
    | { ok: false; error: string }
    | null
  >(null);

  async function send() {
    if (
      !confirm(
        `Opprett fakturadraft i Fiken for ${hours.toFixed(1)} timer (estimert ${amount.toLocaleString(
          'nb-NO'
        )} kr)? Du kan kontrollere og sende fra Fiken etterpå.`
      )
    )
      return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{
        ok: true;
        fikenInvoiceNumber?: string;
        viewUrl: string;
      }>('/accounting/fiken/create-invoice', {
        method: 'POST',
        body: { sakId, onlyBillable: true, daysUntilDue: 14 },
      });
      setResult({ ok: true, viewUrl: r.viewUrl, invoiceNumber: r.fikenInvoiceNumber });
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Ukjent feil',
      });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          background: tokens.color.greenSoft,
          color: tokens.color.green,
          borderRadius: tokens.radius.md,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <span>
          ✓ Fakturadraft opprettet i Fiken
          {result.invoiceNumber ? ` (#${result.invoiceNumber})` : ''}.
        </span>
        <a
          href={result.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: tokens.color.green, fontWeight: 600 }}
        >
          Åpne i Fiken →
        </a>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={send}
        disabled={busy}
        style={{
          padding: '10px 18px',
          background: '#FF6A3D',
          color: 'white',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {busy ? 'Sender til Fiken…' : '📄 Lag faktura i Fiken'}
      </button>
      {result && !result.ok && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: '#FEE2E2',
            color: '#7F1D1D',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {result.error}
          {result.error.toLowerCase().includes('fiken-integrasjon mangler') && (
            <>
              {' '}
              <a
                href="/innstillinger/integrasjoner"
                style={{ color: '#7F1D1D', fontWeight: 600 }}
              >
                Koble til Fiken →
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
