'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, Download, Trash2, Smartphone, History,
  AlertTriangle, Shield, Check, KeyRound,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, setToken, ApiError } from '@/lib/api';

interface AgentSession {
  id: string;
  deviceId: string;
  deviceName: string | null;
  platform: string;
  agentVersion: string;
  lastSeenAt: string;
  isPaused: boolean;
  createdAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export default function SikkerhetPage() {
  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={26} strokeWidth={2} />
            Sikkerhet og personvern
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Administrer passordet ditt, se aktive enheter og last ned eller slett dataene dine
          </p>
        </div>

        <PasswordSection />
        <DevicesSection />
        <AuditSection />
        <GDPRSection />
      </div>
    </AppLayout>
  );
}

// ── Bytt passord ─────────────────────────────────────────────────

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Nytt passord og bekreftelse er ikke like');
      return;
    }
    if (newPassword.length < 8) {
      setError('Nytt passord må være minst 8 tegn');
      return;
    }
    setStatus('saving');
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setStatus('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
      setStatus('error');
    }
  }

  return (
    <Section
      icon={<KeyRound size={18} strokeWidth={2} />}
      title="Bytt passord"
      description="Bruk minst 8 tegn - jo lengre, jo bedre."
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <Field label="Nåværende passord">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={inputStyle}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Nytt passord (minst 8 tegn)">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Bekreft nytt passord">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
            autoComplete="new-password"
          />
        </Field>
        {error && <div style={errorBoxStyle}>{error}</div>}
        {status === 'success' && (
          <div style={{ ...errorBoxStyle, background: '#D1FAE5', color: '#064E3B', border: '1px solid #6EE7B7' }}>
            <Check size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Passord oppdatert
          </div>
        )}
        <button type="submit" disabled={status === 'saving'} style={primaryBtn}>
          {status === 'saving' ? 'Lagrer…' : 'Bytt passord'}
        </button>
      </form>
    </Section>
  );
}

// ── Aktive enheter (desktop-agent) ───────────────────────────────

function DevicesSection() {
  const [devices, setDevices] = useState<AgentSession[] | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { sessions } = await api<{ sessions: AgentSession[] }>('/me/sessions');
      setDevices(sessions);
    } catch {
      setDevices([]);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Fjern denne enheten? Den må logge inn på nytt for å fortsette logging.')) return;
    await api(`/me/sessions/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <Section
      icon={<Smartphone size={18} strokeWidth={2} />}
      title="Mine enheter"
      description="Desktop-agent-installasjoner som synker tid mot din konto. Fjern en hvis du har mistet en PC eller solgt den."
    >
      {!devices ? (
        <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>Henter…</div>
      ) : devices.length === 0 ? (
        <div style={{ color: tokens.color.textSubtle, fontSize: 13 }}>
          Ingen enheter registrert. Når du logger inn i Sakspilot Desktop vises den her.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {devices.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                background: tokens.color.bg,
                borderRadius: tokens.radius.sm,
                border: `1px solid ${tokens.color.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {d.deviceName || 'Ukjent enhet'} · {d.platform}
                </div>
                <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
                  Sist sett: {formatRelative(d.lastSeenAt)} · v{d.agentVersion} · {d.deviceId.slice(0, 12)}…
                </div>
              </div>
              <button onClick={() => revoke(d.id)} style={dangerBtn}>
                <Trash2 size={12} strokeWidth={2} /> Fjern
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Audit-log (siste hendelser) ──────────────────────────────────

function AuditSection() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { logs } = await api<{ logs: AuditLog[] }>('/me/audit');
      setLogs(logs);
    } catch {
      setLogs([]);
    }
  }

  const visible = expanded ? logs : logs?.slice(0, 5);

  return (
    <Section
      icon={<History size={18} strokeWidth={2} />}
      title="Aktivitetslogg"
      description="De siste hendelsene logget mot din konto. Vis hvem som gjorde hva og når."
    >
      {!logs ? (
        <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>Henter…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: tokens.color.textSubtle, fontSize: 13 }}>Ingen hendelser ennå.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 4 }}>
            {visible!.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: tokens.color.bg,
                  borderRadius: tokens.radius.sm,
                  fontSize: 12,
                  borderLeft: `3px solid ${actionColor(log.action)}`,
                }}
              >
                <span style={{ color: tokens.color.text, fontFamily: tokens.font.mono }}>
                  {log.action}
                  {log.entityType && (
                    <span style={{ color: tokens.color.textSubtle, marginLeft: 6 }}>
                      ({log.entityType})
                    </span>
                  )}
                </span>
                <span style={{ color: tokens.color.textMuted }}>{formatRelative(log.createdAt)}</span>
              </div>
            ))}
          </div>
          {logs.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                marginTop: 10,
                fontSize: 12,
                color: tokens.color.navy,
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              {expanded ? `Vis kun siste 5` : `Vis alle ${logs.length} hendelser`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function actionColor(action: string) {
  if (action.includes('delete')) return tokens.color.red;
  if (action.includes('login') || action.includes('register')) return tokens.color.green;
  if (action.includes('password')) return tokens.color.gold;
  return tokens.color.navy;
}

// ── GDPR (eksport + sletting) ────────────────────────────────────

function GDPRSection() {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    // Last ned via direkte navigasjon, backend setter Content-Disposition
    const apiUrl = (window as Window & { sakspilot?: { getSettings?: () => Promise<{ apiUrl?: string }> } }).sakspilot?.getSettings
      ? (await (window as Window & { sakspilot?: { getSettings?: () => Promise<{ apiUrl?: string }> } }).sakspilot!.getSettings!())?.apiUrl
      : '';
    const base = apiUrl || (process.env.NEXT_PUBLIC_API_URL || '');
    try {
      // Auth via httpOnly-cookie (credentials: 'include'). Ingen Bearer-header.
      const res = await fetch(`${base}/me/export`, { credentials: 'include' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sakspilot-data-eksport-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Eksport feilet: ' + (e instanceof Error ? e.message : 'ukjent'));
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>('/me/delete', {
        method: 'POST',
        body: { password, confirm: confirmText },
      });
      if (res.ok) {
        setToken(null);
        alert(res.message);
        router.replace('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
      setDeleting(false);
    }
  }

  return (
    <>
      <Section
        icon={<Download size={18} strokeWidth={2} />}
        title="Last ned mine data"
        description="GDPR art. 15: du har rett til å få utlevert all data vi har om deg. Klikk for å laste ned en strukturert JSON-fil med ALT - prosjekter, klienter, time-entries, klistrelapper, alt."
      >
        <button onClick={exportData} style={primaryBtn}>
          <Download size={14} strokeWidth={2} /> Last ned alle data (JSON)
        </button>
      </Section>

      <Section
        icon={<AlertTriangle size={18} strokeWidth={2} />}
        title="Slett konto"
        description="GDPR art. 17: du har rett til å bli glemt. Dette sletter kontoen din, all data, klienter, prosjekter, time-entries - alt. Kan IKKE angres."
        danger
      >
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} style={dangerBtn}>
            <Trash2 size={14} strokeWidth={2} /> Jeg vil slette kontoen min
          </button>
        ) : (
          <form onSubmit={deleteAccount} style={{ display: 'grid', gap: 10, maxWidth: 400 }}>
            <div style={{ ...errorBoxStyle, background: '#FEE2E2', color: '#7F1D1D', border: '1px solid #FCA5A5' }}>
              <strong>Du er i ferd med å slette kontoen permanent.</strong>
              <br />
              Skriv inn passordet ditt + setningen <code style={{ background: 'white', padding: '1px 4px', borderRadius: 3 }}>SLETT MIN KONTO</code> (med store bokstaver) for å bekrefte.
            </div>
            <Field label="Passord">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={inputStyle}
                autoComplete="current-password"
              />
            </Field>
            <Field label='Skriv "SLETT MIN KONTO"'>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            {error && <div style={errorBoxStyle}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={deleting || confirmText !== 'SLETT MIN KONTO'}
                style={{ ...dangerBtn, opacity: deleting || confirmText !== 'SLETT MIN KONTO' ? 0.5 : 1 }}
              >
                {deleting ? 'Sletter…' : 'Bekreft sletting'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDelete(false); setPassword(''); setConfirmText(''); }}
                style={{ ...secondaryBtn }}
              >
                Avbryt
              </button>
            </div>
          </form>
        )}
      </Section>
    </>
  );
}

// ── Reusable ─────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  danger,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        border: `1px solid ${danger ? '#FCA5A5' : tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${tokens.color.border}`,
          background: danger ? '#FEF2F2' : tokens.color.white,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: danger ? tokens.color.red : tokens.color.navy }}>
          {icon}
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        </div>
        <p style={{ fontSize: 13, color: tokens.color.textMuted, marginTop: 4 }}>{description}</p>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'nå';
  if (min < 60) return `${min} min siden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} t siden`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} d siden`;
  return new Date(iso).toLocaleDateString('nb-NO');
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.white,
  color: tokens.color.textMuted,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: `1px solid ${tokens.color.border}`,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.red,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: '#FEE2E2',
  color: '#7F1D1D',
  border: '1px solid #FCA5A5',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
};
