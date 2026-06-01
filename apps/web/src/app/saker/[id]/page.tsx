'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid, ApiError } from '@/lib/api';
import { events } from '@/lib/analytics';
import { SectionCard, Stat, type Sak, type SakStatus, type TimeSummary } from './_sections/_shared';
import SakHeaderCard from './_sections/SakHeaderCard';
import EmailsSection from './_sections/EmailsSection';
import MatchingRulesSection from './_sections/MatchingRulesSection';
import MilestonesSection from './_sections/MilestonesSection';
import AiAssistantSection from './_sections/AiAssistantSection';
import TimeEntriesSection from './_sections/TimeEntriesSection';
import FikenInvoiceButton from './_sections/FikenInvoiceButton';
import TripletexInvoiceButton from './_sections/TripletexInvoiceButton';
import InvoicePdfButton from './_sections/InvoicePdfButton';

export default function SakDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sakId = params.id;

  const [sak, setSak] = useState<Sak | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, sum] = await Promise.all([
        api<Sak>(`/saker/${sakId}`),
        api<TimeSummary>(`/saker/${sakId}/time-summary`),
      ]);
      setSak(s);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    }
  }, [sakId]);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    refresh();
  }, [router, refresh]);

  // Når saken er lastet, fortell desktop-agenten at dette er "aktiv sak"
  // så auto-spor attribuerer alt som åpnes herfra til riktig sak.
  // Nullstilles når man navigerer bort fra sak-siden.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).sakspilot;
    if (!api?.isDesktop || !api.setActiveSak) return;
    if (sak) {
      api.setActiveSak(sak.id, sak.title);
    }
    return () => {
      // forlater sak-siden → ingen aktiv sak lenger
      api.setActiveSak(null, null);
    };
  }, [sak]);

  async function handleStatusChange(newStatus: SakStatus) {
    await api(`/saker/${sakId}`, { method: 'PATCH', body: { status: newStatus } });
    events.sakStatusChanged(newStatus);
    refresh();
  }

  async function handleDelete() {
    if (
      !confirm(
        'Sletter prosjektet permanent. Time-entries beholdes (frikoblet). Sikker?'
      )
    )
      return;
    await api(`/saker/${sakId}`, { method: 'DELETE' });
    router.push('/saker');
  }

  if (error) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ padding: 24, color: tokens.color.red }}>Feil: {error}</div>
        </main>
      </>
    );
  }

  if (!sak) {
    return (
      <>
        <Header />
        <main style={pageStyle}>
          <div style={{ padding: 24, color: tokens.color.textMuted }}>Henter prosjekt…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={pageStyle}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
          <Link
            href="/saker"
            style={{ color: tokens.color.textMuted, fontSize: 14, display: 'inline-block', marginBottom: 12 }}
          >
            ← Tilbake til prosjekter
          </Link>

          {/* ── Hovedheader ── */}
          <SakHeaderCard sak={sak} onStatusChange={handleStatusChange} onDelete={handleDelete} />

          {/* ── Tidssammendrag ── */}
          <SectionCard title="Tidssammendrag">
            {summary && summary.entryCount > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                <Stat label="Total tid" value={`${summary.totalHours.toFixed(1)} t`} />
                <Stat label="Fakturerbart" value={`${summary.billableHours.toFixed(1)} t`} />
                <Stat
                  label="Estimert beløp"
                  value={
                    summary.totalAmount > 0
                      ? `${summary.totalAmount.toLocaleString('nb-NO')} kr`
                      : '—'
                  }
                />
                <Stat label="Entries" value={String(summary.entryCount)} />
              </div>
            ) : null}
            {summary && summary.billableHours > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'flex-start' }}>
                <InvoicePdfButton sakId={sak.id} />
                <div style={{ marginTop: -16 }}>
                  <FikenInvoiceButton
                    sakId={sak.id}
                    hours={summary.billableHours}
                    amount={summary.totalAmount}
                  />
                </div>
                <div style={{ marginTop: -16 }}>
                  <TripletexInvoiceButton
                    sakId={sak.id}
                    hours={summary.billableHours}
                    amount={summary.totalAmount}
                  />
                </div>
              </div>
            )}
            {!summary || summary.entryCount === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 24,
                  color: tokens.color.textMuted,
                  fontSize: 14,
                }}
              >
                Ingen tid logget enda. Installer desktop-agenten — den fyller dette automatisk
                når den oppdager at du jobber på prosjektet (matching-regler avgjør koblingen).
              </div>
            ) : null}
          </SectionCard>

          {/* ── E-poster ── */}
          <EmailsSection sakId={sak.id} />

          {/* ── AI-assistent ── */}
          <AiAssistantSection sakId={sak.id} />

          {/* ── Tidsregistreringer ── */}
          {summary && summary.entryCount > 0 && (
            <TimeEntriesSection sakId={sak.id} sakTitle={sak.title} />
          )}

          {/* ── Matching-regler ── */}
          <MatchingRulesSection sak={sak} onChange={refresh} />

          {/* ── Frister ── */}
          <MilestonesSection sak={sak} onChange={refresh} />

          {/* ── Metadata ── */}
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: tokens.color.textSubtle,
              textAlign: 'center',
            }}
          >
            Opprettet {new Date(sak.createdAt).toLocaleString('nb-NO')}
            {sak.closedAt &&
              ` · Avsluttet ${new Date(sak.closedAt).toLocaleString('nb-NO')}`}
          </div>
        </div>
      </main>
    </>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 60px)',
  background: tokens.color.bg,
};
