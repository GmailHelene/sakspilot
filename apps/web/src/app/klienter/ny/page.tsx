'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, isTokenValid, ApiError } from '@/lib/api';
import { events } from '@/lib/analytics';

export default function NyKlientPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [defaultHourlyRate, setDefaultHourlyRate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTokenValid()) router.replace('/login');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api('/klienter', {
        method: 'POST',
        body: {
          name: name.trim(),
          orgNumber: orgNumber.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          address: address.trim() || undefined,
          defaultHourlyRate: defaultHourlyRate ? Number(defaultHourlyRate) : null,
          notes: notes.trim() || undefined,
        },
      });
      events.klientCreated();
      router.push('/klienter');
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
        <div style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
          <Link
            href="/klienter"
            style={{ color: tokens.color.textMuted, fontSize: 14, marginBottom: 12, display: 'inline-block' }}
          >
            ← Tilbake til klienter
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
              Ny klient
            </h1>

            {error && (
              <div
                style={{
                  background: '#FEE2E2',
                  color: '#7F1D1D',
                  padding: '10px 14px',
                  borderRadius: tokens.radius.sm,
                  fontSize: 14,
                  marginBottom: 16,
                  border: '1px solid #FCA5A5',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
              <Field label="Klientnavn" required>
                <input
                  style={inputStyle}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Organisasjonsnummer">
                  <input
                    style={inputStyle}
                    type="text"
                    value={orgNumber}
                    onChange={(e) => setOrgNumber(e.target.value)}
                    placeholder="123 456 789"
                  />
                </Field>
                <Field label="Standard timesats (kr/t)">
                  <input
                    style={inputStyle}
                    type="number"
                    value={defaultHourlyRate}
                    onChange={(e) => setDefaultHourlyRate(e.target.value)}
                    placeholder="1200"
                    min={0}
                  />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="E-post">
                  <input
                    style={inputStyle}
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </Field>
                <Field label="Telefon">
                  <input
                    style={inputStyle}
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Adresse">
                <input
                  style={inputStyle}
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>

              <Field label="Notater">
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </Field>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: tokens.color.navy,
                    color: tokens.color.white,
                    padding: '11px 22px',
                    borderRadius: tokens.radius.md,
                    fontWeight: 600,
                  }}
                >
                  {saving ? 'Lagrer…' : 'Opprett klient'}
                </button>
                <Link
                  href="/klienter"
                  style={{
                    background: tokens.color.white,
                    color: tokens.color.textMuted,
                    padding: '11px 22px',
                    borderRadius: tokens.radius.md,
                    fontWeight: 600,
                    border: `1px solid ${tokens.color.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
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
