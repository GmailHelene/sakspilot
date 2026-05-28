'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid, ApiError } from '@/lib/api';
import { events } from '@/lib/analytics';

interface Client {
  id: string;
  name: string;
  defaultHourlyRate: number | null;
}

export default function NySakPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [saksnummer, setSaksnummer] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    api<{ clients: Client[] }>('/klienter').then((res) => setClients(res.clients));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api('/saker', {
        method: 'POST',
        body: {
          title: title.trim(),
          clientId: clientId || null,
          saksnummer: saksnummer.trim() || undefined,
          description: description.trim() || undefined,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          hourlyRate: hourlyRate ? Number(hourlyRate) : null,
          folderPath: folderPath.trim() || null,
        },
      });
      events.sakCreated(clients.find((c) => c.id === clientId)?.name);
      router.push('/saker');
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as Record<string, string[]> | undefined;
        const fieldError = details ? Object.values(details)[0]?.[0] : null;
        setError(fieldError || err.message);
      } else {
        setError('Ukjent feil');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header />
      <main style={{ background: tokens.color.bg, minHeight: 'calc(100vh - 60px)' }}>
        <div
          style={{
            maxWidth: 680,
            margin: '0 auto',
            padding: 24,
          }}
        >
          <Link
            href="/saker"
            style={{ color: tokens.color.textMuted, fontSize: 14, marginBottom: 12, display: 'inline-block' }}
          >
            ← Tilbake til saker
          </Link>

          <div
            style={{
              background: tokens.color.white,
              padding: 32,
              borderRadius: tokens.radius.lg,
              border: `1px solid ${tokens.color.border}`,
            }}
          >
            <h1 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 24 }}>
              Ny sak
            </h1>

            {error && <div style={errorBoxStyle}>{error}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
              <Field label="Sakstittel" required>
                <input
                  style={inputStyle}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder='F.eks. "Bygdøy 12 — rammetillatelse"'
                  required
                  autoFocus
                />
              </Field>

              <Field label="Klient">
                <select
                  style={inputStyle}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">— Ingen / intern sak —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <span style={{ fontSize: 12, color: tokens.color.textMuted }}>
                    Du har ingen klienter enda.{' '}
                    <Link href="/klienter/ny" style={{ color: tokens.color.navy }}>
                      Opprett klient først?
                    </Link>
                  </span>
                )}
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Saksnummer (valgfritt)">
                  <input
                    style={inputStyle}
                    type="text"
                    value={saksnummer}
                    onChange={(e) => setSaksnummer(e.target.value)}
                    placeholder="2026-014"
                  />
                </Field>
                <Field label="Frist">
                  <input
                    style={inputStyle}
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Timesats (kr/t)">
                  <input
                    style={inputStyle}
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="1200"
                    min={0}
                  />
                </Field>
                <Field label="Lokal mappe">
                  <input
                    style={inputStyle}
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder={`C:\\Jobb\\Bygdoy-12`}
                  />
                </Field>
              </div>

              <Field label="Beskrivelse / notater">
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </Field>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="submit" disabled={saving} style={primaryButtonStyle}>
                  {saving ? 'Lagrer…' : 'Opprett sak'}
                </button>
                <Link href="/saker" style={secondaryButtonStyle}>
                  Avbryt
                </Link>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {label} {required && <span style={{ color: tokens.color.red }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 15,
  width: '100%',
  background: tokens.color.white,
};

const primaryButtonStyle: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '11px 22px',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  background: tokens.color.white,
  color: tokens.color.textMuted,
  padding: '11px 22px',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
  border: `1px solid ${tokens.color.border}`,
  display: 'inline-flex',
  alignItems: 'center',
};

const errorBoxStyle: React.CSSProperties = {
  background: '#FEE2E2',
  color: '#7F1D1D',
  padding: '10px 14px',
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  marginBottom: 16,
  border: '1px solid #FCA5A5',
};
