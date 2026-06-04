'use client';

/**
 * Tripletex — direkte API-integrasjon via Sakspilot's Partner Consumer Token.
 *
 * Brukeren genererer en EmployeeToken i Tripletex og limer inn her. Sakspilot
 * lagrer den kryptert (AES-256-GCM) og bygger SessionTokens på serveren ved
 * behov. Ingen tokens vises noensinne tilbake til frontend.
 *
 * Veiledning: https://hjelp.tripletex.no/hc/no/articles/4409557117841
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Unlink,
  ExternalLink,
  FileText,
  Receipt,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface TripletexStatus {
  connected: boolean;
  companyId?: number;
  companyName?: string;
  employeeId?: number;
  employeeName?: string;
  useTestEnv?: boolean;
  lastVerifiedAt?: string | null;
  invoicesPushed?: number;
  hoursPushed?: number;
  connectedAt?: string;
  docsUrl?: string;
  hint?: string;
}

export default function TripletexPage() {
  const [status, setStatus] = useState<TripletexStatus | null>(null);
  const [employeeToken, setEmployeeToken] = useState('');
  const [useTestEnv, setUseTestEnv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    try {
      const s = await api<TripletexStatus>('/integrations/tripletex/status');
      setStatus(s);
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Kunne ikke hente status',
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    if (!employeeToken.trim()) {
      setMessage({ kind: 'err', text: 'EmployeeToken må fylles ut.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ ok: boolean; companyName: string; employeeName: string }>(
        '/integrations/tripletex/connect',
        {
          method: 'POST',
          body: { employeeToken: employeeToken.trim(), useTestEnv },
        }
      );
      setMessage({
        kind: 'ok',
        text: `Tripletex koblet til: ${r.companyName} (${r.employeeName})`,
      });
      setEmployeeToken('');
      await load();
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Tilkobling feilet',
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Koble fra Tripletex? EmployeeToken slettes fra Sakspilot.')) return;
    setBusy(true);
    try {
      await api('/integrations/tripletex/disconnect', { method: 'DELETE' });
      await load();
      setMessage({ kind: 'ok', text: 'Tripletex er koblet fra.' });
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Kunne ikke koble fra',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
        <Link
          href="/innstillinger/integrasjoner"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: tokens.color.textMuted,
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={14} /> Tilbake til integrasjoner
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
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
              flexShrink: 0,
            }}
          >
            T
          </div>
          <h1 style={{ fontSize: 28, color: tokens.color.navy }}>Tripletex</h1>
          {status?.connected && (
            <span style={badgeStyle()}>
              <CheckCircle2 size={12} /> Tilkoblet
            </span>
          )}
        </div>
        <p style={{ color: tokens.color.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
          Push billable timer og opprett fakturadraft direkte i Tripletex fra
          Sakspilot. EmployeeToken-en din lagres kryptert (AES-256-GCM) og kan
          slettes når som helst.
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

        {status?.connected ? (
          <ConnectedCard status={status} onDisconnect={disconnect} busy={busy} />
        ) : (
          <ConnectForm
            employeeToken={employeeToken}
            setEmployeeToken={setEmployeeToken}
            useTestEnv={useTestEnv}
            setUseTestEnv={setUseTestEnv}
            busy={busy}
            onConnect={connect}
          />
        )}

        {/* Veiledning */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>
            Slik genererer du EmployeeToken
          </h2>
          <Step
            n={1}
            title="Logg inn på Tripletex som administrator"
            body={
              <>
                Gå til{' '}
                <a
                  href="https://tripletex.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  tripletex.no <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                </a>{' '}
                og logg inn med en bruker som har tilgang til API-innstillinger.
              </>
            }
          />
          <Step
            n={2}
            title="Naviger til API-løsning"
            body={
              <>
                Hovedmeny: <strong>Mitt firma</strong> → <strong>Vår API-løsning</strong>.
              </>
            }
          />
          <Step
            n={3}
            title="Generer ny token"
            body={
              <>
                Velg <strong>Generer ny token</strong>, og pek på integrasjonen{' '}
                <strong>Sakspilot</strong> i nedtrekksmenyen.
              </>
            }
          />
          <Step
            n={4}
            title="Kopier tokenet og lim inn over"
            body={
              <>
                Tokenet vises bare én gang. Lim det inn i feltet øverst på denne siden
                og klikk <strong>Koble til Tripletex</strong>. Vi verifiserer mot Tripletex
                og lagrer det kryptert.
              </>
            }
          />
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${tokens.color.border}`,
              fontSize: 12,
              color: tokens.color.textMuted,
            }}
          >
            Full veiledning fra Tripletex:{' '}
            <a
              href="https://hjelp.tripletex.no/hc/no/articles/4409557117841"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              hjelp.tripletex.no <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
            </a>
          </div>
        </div>

        {/* CSV-alternativ fortsatt tilgjengelig */}
        <div style={{ ...cardStyle, background: tokens.color.blueSoft, borderColor: tokens.color.blue }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: tokens.color.blue,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={16} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: tokens.color.navy, marginBottom: 4 }}>
                Foretrekker du CSV-eksport?
              </h3>
              <p style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.5 }}>
                Du kan fortsatt eksportere månedsrapport som CSV og importere
                manuelt i Tripletex -{' '}
                <Link href="/rapport" style={linkStyle}>
                  åpne rapport-siden
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Connected card ────────────────────────────────────────────────

function ConnectedCard({
  status,
  onDisconnect,
  busy,
}: {
  status: TripletexStatus;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: tokens.radius.md,
            background: tokens.color.greenSoft,
            color: tokens.color.green,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Receipt size={24} strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={accountInfoStyle}>
            <div>
              <strong>{status.companyName}</strong>
              {status.useTestEnv && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: tokens.color.yellowSoft,
                    color: '#8B6F00',
                    fontWeight: 600,
                  }}
                >
                  TEST-MILJØ
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: tokens.color.textMuted, marginTop: 2 }}>
              Bruker: {status.employeeName}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 24,
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${tokens.color.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Fakturaer pushet
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: tokens.color.navy }}>
                  {status.invoicesPushed ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Timesheet-entries
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: tokens.color.navy }}>
                  {status.hoursPushed ?? 0}
                </div>
              </div>
              {status.lastVerifiedAt && (
                <div>
                  <div style={{ fontSize: 11, color: tokens.color.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Sist brukt
                  </div>
                  <div style={{ fontSize: 13, color: tokens.color.text }}>
                    {new Date(status.lastVerifiedAt).toLocaleString('nb-NO')}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <a
              href={
                status.useTestEnv
                  ? 'https://api-test.tripletex.tech'
                  : 'https://tripletex.no'
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...primaryBtn,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ExternalLink size={14} /> Åpne Tripletex
            </a>
            <button onClick={onDisconnect} disabled={busy} style={secondaryBtn}>
              <Unlink size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Koble fra
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Connect form ──────────────────────────────────────────────────

function ConnectForm({
  employeeToken,
  setEmployeeToken,
  useTestEnv,
  setUseTestEnv,
  busy,
  onConnect,
}: {
  employeeToken: string;
  setEmployeeToken: (s: string) => void;
  useTestEnv: boolean;
  setUseTestEnv: (b: boolean) => void;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>
        Koble til Tripletex
      </h2>
      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <input
          type="password"
          value={employeeToken}
          onChange={(e) => setEmployeeToken(e.target.value)}
          placeholder="EmployeeToken (limes inn fra Tripletex)"
          style={inputStyle}
          autoComplete="off"
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: tokens.color.textMuted,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={useTestEnv}
            onChange={(e) => setUseTestEnv(e.target.checked)}
          />
          Bruk Tripletex test-miljø (api-test.tripletex.tech)
        </label>
      </div>
      <button onClick={onConnect} disabled={busy} style={ctaBtn}>
        {busy ? 'Verifiserer…' : 'Koble til Tripletex'}
      </button>
    </div>
  );
}

// ── Step ──────────────────────────────────────────────────────────

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 12, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: tokens.gradient.navy,
          color: 'white',
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: tokens.color.navy, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: tokens.color.textMuted, lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 24,
  marginBottom: 16,
  boxShadow: tokens.shadow.sm,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  fontFamily: 'inherit',
  width: '100%',
};

const accountInfoStyle: React.CSSProperties = {
  padding: 14,
  background: tokens.color.bgAlt,
  borderRadius: tokens.radius.md,
  fontSize: 14,
  lineHeight: 1.5,
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

const linkStyle: React.CSSProperties = {
  color: tokens.color.navy,
  fontWeight: 500,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
};

function badgeStyle(): React.CSSProperties {
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
    marginLeft: 8,
  };
}
