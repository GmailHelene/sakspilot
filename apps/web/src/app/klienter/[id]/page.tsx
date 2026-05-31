'use client';

/**
 * Klient-detalj — vis + rediger + slett klient.
 *
 * Editering inline: alle felter blir input-felter. Endringer
 * lagres på blur. Sletting krever bekreftelse via modal.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, Save } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

interface Client {
  id: string;
  name: string;
  orgNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  defaultHourlyRate: number | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  portalEnabled?: boolean;
  email?: string | null;
  lastLoginAt?: string | null;
}

interface ClientWithSaker extends Client {
  saker?: { id: string; title: string; status: string; archived: boolean }[];
}

export default function KlientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [client, setClient] = useState<ClientWithSaker | null>(null);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitingPortal, setInvitingPortal] = useState(false);
  const [portalInviteResult, setPortalInviteResult] = useState<string | null>(null);

  async function inviteToPortal() {
    if (!client) return;
    if (!client.contactEmail) {
      alert('Klienten mangler kontakt-e-post. Fyll inn denne først og lagre.');
      return;
    }
    const msg = client.portalEnabled
      ? `Klienten har allerede portal-tilgang. Sende ny invitasjon? Dette overskriver den gamle.`
      : `Sende invitasjon til klient-portalen til ${client.contactEmail}?`;
    if (!confirm(msg)) return;
    setInvitingPortal(true);
    setPortalInviteResult(null);
    try {
      const res = await api<{
        ok: boolean;
        message: string;
        _devInviteUrl?: string;
      }>(`/klienter/${client.id}/invite-to-portal`, { method: 'POST' });
      setPortalInviteResult(
        res._devInviteUrl
          ? `${res.message}\n\nLenke (kopier manuelt):\n${res._devInviteUrl}`
          : res.message
      );
    } catch (err) {
      setPortalInviteResult(
        err instanceof ApiError ? `Feil: ${err.message}` : 'Invitasjon feilet'
      );
    } finally {
      setInvitingPortal(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const c = await api<ClientWithSaker>(`/klienter/${clientId}`);
      setClient(c);
      setDraft({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function setField<K extends keyof Client>(field: K, value: Client[K] | null) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function save() {
    if (Object.keys(draft).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Client>(`/klienter/${clientId}`, {
        method: 'PATCH',
        body: draft,
      });
      setClient((prev) => (prev ? { ...prev, ...updated } : prev));
      setDraft({});
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lagring feilet');
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    const activeSaker = client?.saker?.filter((s) => !s.archived) || [];
    let warn = `Slette «${client?.name}»?`;
    if (activeSaker.length > 0) {
      warn += `\n\nKlienten har ${activeSaker.length} aktive prosjekter — disse blir frikoblet (klient-felt blir tomt), men selve prosjektdata beholdes.`;
    }
    warn += '\n\nDenne handlingen kan ikke angres.';
    if (!confirm(warn)) return;
    try {
      await api(`/klienter/${clientId}`, { method: 'DELETE' });
      router.push('/klienter');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sletting feilet');
    }
  }

  if (error && !client) {
    return (
      <AppLayout>
        <div style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
          <div style={errorStyle}>{error}</div>
          <Link href="/klienter" style={{ color: tokens.color.navy, fontWeight: 500 }}>
            ← Tilbake til klienter
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div style={{ padding: 40, color: tokens.color.textMuted, textAlign: 'center' }}>
          Henter klient…
        </div>
      </AppLayout>
    );
  }

  const hasChanges = Object.keys(draft).length > 0;
  const merged: Client = { ...client, ...draft } as Client;

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
        <Link
          href="/klienter"
          style={{ fontSize: 13, color: tokens.color.textMuted, textDecoration: 'none' }}
        >
          ← Tilbake til klienter
        </Link>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <input
              value={merged.name || ''}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Klientnavn"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: tokens.color.navy,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                flex: 1,
                padding: '4px 6px',
                marginLeft: -6,
                borderRadius: tokens.radius.sm,
              }}
              onFocus={(e) => (e.target.style.background = tokens.color.bgAlt)}
              onBlur={(e) => {
                e.target.style.background = 'transparent';
                if (hasChanges) save();
              }}
            />
            <button onClick={deleteClient} style={deleteBtn} title="Slett klient">
              <Trash2 size={14} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Slett
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Field label="Org.nr">
              <input
                value={merged.orgNumber || ''}
                onChange={(e) => setField('orgNumber', e.target.value || null)}
                onBlur={save}
                placeholder="911 222 333"
                style={inputStyle}
              />
            </Field>
            <Field label="Standard timesats (kr/t)">
              <input
                type="number"
                value={merged.defaultHourlyRate ?? ''}
                onChange={(e) =>
                  setField('defaultHourlyRate', e.target.value ? parseInt(e.target.value, 10) : null)
                }
                onBlur={save}
                placeholder="1200"
                style={inputStyle}
              />
            </Field>
            <Field label="Kontakt-epost">
              <input
                type="email"
                value={merged.contactEmail || ''}
                onChange={(e) => setField('contactEmail', e.target.value || null)}
                onBlur={save}
                placeholder="post@klient.no"
                style={inputStyle}
              />
            </Field>
            <Field label="Telefon">
              <input
                value={merged.contactPhone || ''}
                onChange={(e) => setField('contactPhone', e.target.value || null)}
                onBlur={save}
                placeholder="+47 999 88 777"
                style={inputStyle}
              />
            </Field>
            <Field label="Adresse" full>
              <input
                value={merged.address || ''}
                onChange={(e) => setField('address', e.target.value || null)}
                onBlur={save}
                placeholder="Storgata 1, 0150 Oslo"
                style={inputStyle}
              />
            </Field>
            <Field label="Notater" full>
              <textarea
                value={merged.notes || ''}
                onChange={(e) => setField('notes', e.target.value || null)}
                onBlur={save}
                placeholder="Interne notater om klienten…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              color: tokens.color.textSubtle,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {saving ? (
              <>⏳ Lagrer…</>
            ) : savedAt ? (
              <>
                <Save size={11} /> Lagret {savedAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : (
              <>Endringer lagres når du klikker ut av feltet</>
            )}
          </div>
        </div>

        {/* Klient-portal-invitasjon */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, color: tokens.color.navy, margin: '0 0 6px 0' }}>
                Klient-portal
              </h2>
              <p style={{ fontSize: 13, color: tokens.color.textMuted, margin: 0, lineHeight: 1.5, maxWidth: 540 }}>
                {client.portalEnabled
                  ? `Klienten har aktiv portal-tilgang${client.lastLoginAt ? ` (sist innlogget ${new Date(client.lastLoginAt).toLocaleDateString('nb-NO')})` : ''}. De kan logge inn på /portal og se egne saker, milepæler og fakturaer.`
                  : 'Inviter klienten til klient-portalen så de kan logge inn og se egne saker, milepæler og fakturahistorikk.'}
              </p>
            </div>
            <button
              onClick={inviteToPortal}
              disabled={invitingPortal}
              style={{
                padding: '8px 14px',
                background: tokens.color.navy,
                color: tokens.color.white,
                border: 'none',
                borderRadius: tokens.radius.sm,
                fontSize: 13,
                fontWeight: 600,
                cursor: invitingPortal ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {invitingPortal
                ? 'Sender…'
                : client.portalEnabled
                ? 'Send ny invitasjon'
                : 'Inviter til klient-portal'}
            </button>
          </div>
          {portalInviteResult && (
            <pre
              style={{
                marginTop: 12,
                padding: 10,
                background: tokens.color.bgAlt,
                borderRadius: tokens.radius.sm,
                fontSize: 12,
                color: tokens.color.text,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'inherit',
              }}
            >
              {portalInviteResult}
            </pre>
          )}
        </div>

        {/* Saker for denne klienten */}
        {client.saker && client.saker.length > 0 && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 16, color: tokens.color.navy, marginBottom: 12 }}>
              Saker ({client.saker.length})
            </h2>
            <div style={{ display: 'grid', gap: 6 }}>
              {client.saker.map((s) => (
                <Link
                  key={s.id}
                  href={`/saker/${s.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: tokens.color.bgAlt,
                    borderRadius: tokens.radius.sm,
                    color: tokens.color.text,
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: tokens.color.textMuted }}>
                    {s.status}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: tokens.color.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 24,
  marginTop: 16,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  background: tokens.color.white,
};

const deleteBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: `1px solid ${tokens.color.red}`,
  color: tokens.color.red,
  borderRadius: tokens.radius.sm,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: 12,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
  marginTop: 16,
};
