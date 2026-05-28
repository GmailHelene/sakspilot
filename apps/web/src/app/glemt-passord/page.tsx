'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

export default function GlemtPassordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ ok: boolean; _devResetUrl?: string }>(
        '/auth/forgot-password',
        { method: 'POST', body: { email: email.trim() } }
      );
      setDone(true);
      if (r._devResetUrl) setDevUrl(r._devResetUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main
        style={{
          minHeight: 'calc(100vh - 60px)',
          background: tokens.color.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            background: tokens.color.white,
            padding: 36,
            borderRadius: tokens.radius.lg,
            border: `1px solid ${tokens.color.border}`,
            width: '100%',
            maxWidth: 420,
            boxShadow: tokens.shadow.md,
          }}
        >
          <h1 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 8 }}>
            Glemt passord?
          </h1>
          <p style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 24 }}>
            Skriv inn e-postadressen din, så sender vi en lenke for å nullstille passordet.
          </p>

          {done ? (
            <div>
              <div
                style={{
                  padding: 14,
                  background: tokens.color.greenSoft,
                  color: tokens.color.green,
                  borderRadius: tokens.radius.sm,
                  fontSize: 14,
                  marginBottom: 16,
                }}
              >
                ✓ Hvis kontoen finnes, har vi sendt en reset-lenke til <strong>{email}</strong>.
                Sjekk innboksen (og spam-mappa).
              </div>
              {devUrl && (
                <div
                  style={{
                    padding: 12,
                    background: tokens.color.yellowSoft,
                    color: '#8B6F00',
                    borderRadius: tokens.radius.sm,
                    fontSize: 12,
                    marginBottom: 16,
                    wordBreak: 'break-all',
                  }}
                >
                  <strong>Dev-modus:</strong> SMTP er ikke koblet til ennå. Bruk denne
                  lenken direkte:
                  <br />
                  <a href={devUrl} style={{ color: tokens.color.navy, fontWeight: 600 }}>
                    {devUrl}
                  </a>
                </div>
              )}
              <Link href="/login" style={{ color: tokens.color.navy, fontWeight: 600, fontSize: 14 }}>
                ← Tilbake til logg inn
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {error && (
                <div
                  style={{
                    background: '#FEE2E2',
                    color: '#7F1D1D',
                    padding: '10px 14px',
                    borderRadius: tokens.radius.sm,
                    fontSize: 14,
                    marginBottom: 16,
                  }}
                >
                  {error}
                </div>
              )}
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: tokens.color.navy, marginBottom: 6 }}>
                E-post
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@epost.no"
                required
                autoFocus
                style={inputStyle}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 20,
                  width: '100%',
                  padding: '12px',
                  background: tokens.gradient.navy,
                  color: 'white',
                  border: 'none',
                  borderRadius: tokens.radius.md,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Sender…' : 'Send reset-lenke'}
              </button>
              <p style={{ marginTop: 20, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
                <Link href="/login" style={{ color: tokens.color.navy, fontWeight: 500 }}>
                  ← Tilbake til logg inn
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </>
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
