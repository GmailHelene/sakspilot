'use client';

/**
 * Klient-portal, glemt passord.
 * Tilsvarende /glemt-passord men mot /client-portal/forgot-password.
 */
import { useState } from 'react';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import { portalApi, PortalApiError } from '@/lib/portalApi';

export default function PortalForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await portalApi('/client-portal/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: tokens.color.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, -apple-system, sans-serif',
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
        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.textMuted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Klient-portal
        </div>
        <h1 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 16 }}>
          Glemt passord
        </h1>

        {done ? (
          <>
            <p style={{ fontSize: 14, color: tokens.color.text, lineHeight: 1.6, marginBottom: 16 }}>
              Hvis en konto med <strong>{email}</strong> finnes, har vi sendt en
              lenke for å nullstille passordet. Sjekk innboksen (og spam).
            </p>
            <Link
              href="/portal/login"
              style={{ color: tokens.color.navy, fontWeight: 500, fontSize: 14 }}
            >
              ← Tilbake til innlogging
            </Link>
          </>
        ) : (
          <>
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
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>E-post</span>
                <input
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: tokens.color.navy,
                  color: tokens.color.white,
                  padding: '12px 16px',
                  borderRadius: tokens.radius.md,
                  fontWeight: 600,
                  marginTop: 8,
                  border: 'none',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Sender…' : 'Send reset-lenke'}
              </button>
            </form>
            <p style={{ marginTop: 16, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
              <Link href="/portal/login" style={{ color: tokens.color.navy }}>
                ← Tilbake til innlogging
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
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
