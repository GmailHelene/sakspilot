'use client';

/**
 * Knapp + dialog for å pushe billable timer på en sak til Tripletex
 * som fakturadraft. Vises bare hvis organisasjonen har en aktiv
 * Tripletex-integrasjon (status-poll mot /integrations/tripletex/status).
 *
 * Speilet av FikenInvoiceButton, men med Tripletex-blå farge og
 * Tripletex-spesifikk feilhåndtering (lenker til /innstillinger/tripletex
 * når integrasjonen mangler).
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface TripletexStatus {
  connected: boolean;
  useTestEnv?: boolean;
}

export default function TripletexInvoiceButton({
  sakId,
  hours,
  amount,
}: {
  sakId: string;
  hours: number;
  amount: number;
}) {
  const [status, setStatus] = useState<TripletexStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; viewUrl: string; invoiceNumber?: string; invoiceId: number }
    | { ok: false; error: string }
    | null
  >(null);

  useEffect(() => {
    let alive = true;
    api<TripletexStatus>('/integrations/tripletex/status')
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        // Ikke vis knapp hvis status-kallet feiler
      });
    return () => {
      alive = false;
    };
  }, []);

  // Skjul knappen helt hvis ikke koblet til, brukeren skal ikke se
  // en knapp som garantert feiler.
  if (!status?.connected) return null;

  async function send() {
    if (
      !confirm(
        `Opprett fakturadraft i Tripletex for ${hours.toFixed(1)} timer (estimert ${amount.toLocaleString(
          'nb-NO'
        )} kr)? Du kan kontrollere og sende fra Tripletex etterpå.`
      )
    )
      return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{
        ok: true;
        tripletexInvoiceId: number;
        tripletexInvoiceNumber?: string;
        viewUrl: string;
      }>('/integrations/tripletex/push-invoice', {
        method: 'POST',
        body: { sakId, onlyBillable: true, daysUntilDue: 14 },
      });
      setResult({
        ok: true,
        viewUrl: r.viewUrl,
        invoiceNumber: r.tripletexInvoiceNumber,
        invoiceId: r.tripletexInvoiceId,
      });
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
          ✓ Fakturadraft opprettet i Tripletex
          {result.invoiceNumber ? ` (#${result.invoiceNumber})` : ` (id ${result.invoiceId})`}.
        </span>
        <a
          href={result.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: tokens.color.green, fontWeight: 600 }}
        >
          Åpne i Tripletex →
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
          background: '#1B73B8',
          color: 'white',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {busy
          ? 'Sender til Tripletex…'
          : status.useTestEnv
          ? '📄 Lag faktura i Tripletex (TEST)'
          : '📄 Lag faktura i Tripletex'}
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
          {result.error.toLowerCase().includes('tripletex-integrasjon mangler') && (
            <>
              {' '}
              <a
                href="/innstillinger/tripletex"
                style={{ color: '#7F1D1D', fontWeight: 600 }}
              >
                Koble til Tripletex →
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
