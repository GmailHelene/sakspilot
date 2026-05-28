'use client';

/**
 * Integrasjoner — koble til tredjepartstjenester.
 *
 * Per nå: Outlook/Microsoft Graph.
 * Senere: Google Workspace, Tripletex, Fiken.
 */

import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Unlink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { events } from '@/lib/analytics';

interface MicrosoftStatus {
  configured: boolean;
  connected: boolean;
  account: {
    id: string;
    email: string;
    lastSyncAt: string | null;
    createdAt: string;
  } | null;
}

export default function IntegrasjonerPage() {
  const [ms, setMs] = useState<MicrosoftStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  async function load() {
    try {
      const s = await api<MicrosoftStatus>('/oauth/microsoft/status');
      setMs(s);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Lytt etter postMessage fra popup-vinduet etter OAuth-callback
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === 'oauth:microsoft:ok') {
        events.outlookConnected();
        setMessage({ kind: 'ok', text: e.data.message || 'Outlook koblet til!' });
        load();
      } else if (e.data?.type === 'oauth:microsoft:error') {
        setMessage({ kind: 'err', text: e.data.message || 'Tilkobling feilet' });
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const { url } = await api<{ url: string }>('/oauth/microsoft/start', {
        method: 'POST',
      });
      window.open(url, 'oauth-popup', 'width=560,height=720');
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Kunne ikke starte tilkobling',
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Koble fra Outlook? Eksisterende e-postkoblinger beholdes.')) return;
    setBusy(true);
    try {
      await api('/oauth/microsoft', { method: 'DELETE' });
      await load();
      setMessage({ kind: 'ok', text: 'Outlook er koblet fra.' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ fetched: number; linked: number }>('/emails/sync', {
        method: 'POST',
      });
      events.outlookSynced(r.linked);
      setMessage({
        kind: 'ok',
        text: `Synket: hentet ${r.fetched} e-poster, koblet ${r.linked} til saker.`,
      });
      await load();
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Synk feilet',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 6 }}>
          Integrasjoner
        </h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: 24 }}>
          Koble Sakspilot til verktøyene du allerede bruker.
        </p>

        {message && (
          <div
            style={{
              padding: 14,
              borderRadius: tokens.radius.md,
              marginBottom: 16,
              background: message.kind === 'ok' ? tokens.color.greenSoft : tokens.color.redSoft,
              color: message.kind === 'ok' ? tokens.color.green : tokens.color.red,
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {message.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        )}

        {/* ── Outlook ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: tokens.radius.md,
                background: '#0078D4', // Outlook-blå
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: tokens.shadow.colored('#0078D4'),
              }}
            >
              <Mail size={24} strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <h2 style={{ fontSize: 18, color: tokens.color.navy }}>
                  Outlook / Microsoft 365
                </h2>
                {ms?.connected && (
                  <span style={badgeStyle('connected')}>
                    <CheckCircle2 size={12} /> Tilkoblet
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 14 }}>
                Sakspilot leser nye e-poster og kobler dem automatisk til riktig sak
                basert på avsender (klient-epost) eller emnefelt. Sender ikke e-poster
                — det gjør du fortsatt fra Outlook.
              </p>

              {!ms?.configured ? (
                <div style={configMissingStyle}>
                  ⚠ Microsoft Graph er ikke konfigurert hos administrator.
                  Be om at AZURE_CLIENT_ID + AZURE_CLIENT_SECRET settes på serveren.
                </div>
              ) : ms.connected ? (
                <>
                  <div style={accountInfoStyle}>
                    <div>
                      <strong>{ms.account?.email}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: tokens.color.textMuted }}>
                      {ms.account?.lastSyncAt
                        ? `Sist synket ${new Date(ms.account.lastSyncAt).toLocaleString('nb-NO')}`
                        : 'Aldri synket'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={syncNow}
                      disabled={busy}
                      style={primaryBtn}
                    >
                      <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      Synk nå
                    </button>
                    <button
                      onClick={disconnect}
                      disabled={busy}
                      style={secondaryBtn}
                    >
                      <Unlink size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      Koble fra
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={connect} disabled={busy} style={ctaBtn}>
                  Koble til Outlook
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Tripletex / Fiken (CSV-tips for nå) ── */}
        <a
          href="/innstillinger/tripletex"
          style={{
            ...cardStyle,
            display: 'block',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'transform 0.1s, border-color 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = tokens.color.navy;
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = tokens.color.border;
            e.currentTarget.style.transform = '';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: tokens.radius.md,
                background: '#1B73B8',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
                boxShadow: tokens.shadow.colored('#1B73B8'),
              }}
            >
              T
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, color: tokens.color.navy }}>Tripletex / Fiken</h2>
              <p style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 4 }}>
                CSV-eksport fungerer i begge systemer i dag. Direkte API-tilkobling
                er under utvikling. Klikk for trinn-for-trinn-veiledning →
              </p>
            </div>
            <span style={{ fontSize: 11, color: tokens.color.blue, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Veiledning
            </span>
          </div>
        </a>
      </div>
    </AppLayout>
  );
}

function badgeStyle(state: 'connected'): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: tokens.radius.pill,
    background: tokens.color.greenSoft,
    color: tokens.color.green,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
}

const cardStyle: React.CSSProperties = {
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 24,
  marginBottom: 16,
  boxShadow: tokens.shadow.sm,
};

const accountInfoStyle: React.CSSProperties = {
  padding: 12,
  background: tokens.color.bgAlt,
  borderRadius: tokens.radius.md,
  fontSize: 13,
  lineHeight: 1.6,
};

const configMissingStyle: React.CSSProperties = {
  padding: 12,
  background: tokens.color.yellowSoft,
  color: '#8B6F00',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
};

const ctaBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: tokens.gradient.blue,
  color: 'white',
  border: 'none',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: tokens.shadow.colored('#0086CC'),
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  background: tokens.color.navy,
  color: 'white',
  border: 'none',
  borderRadius: tokens.radius.sm,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: tokens.color.red,
  border: `1px solid ${tokens.color.red}`,
  borderRadius: tokens.radius.sm,
  fontWeight: 500,
  fontSize: 13,
  cursor: 'pointer',
};
