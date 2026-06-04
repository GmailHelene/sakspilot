'use client';

/**
 * Klient-portal, reset passord (lenke fra glemt-passord-e-post).
 */
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import { portalApi, PortalApiError } from '@/lib/portalApi';

function ResetInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError('Passordet må være minst 12 tegn.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passordene er ikke like.');
      return;
    }
    setLoading(true);
    try {
      await portalApi('/client-portal/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      router.push('/portal/login?reset=ok');
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
          maxWidth: 440,
          boxShadow: tokens.shadow.md,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.textMuted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Klient-portal
        </div>
        <h1 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 8 }}>
          Sett nytt passord
        </h1>
        <p style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 20 }}>
          Minst 12 tegn.
        </p>

        {!token && (
          <div style={errStyle}>Mangler reset-token i URL-en.</div>
        )}
        {error && <div style={errStyle}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <input
            style={inputStyle}
            type="password"
            placeholder="Nytt passord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="Bekreft passord"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={loading || !token}
            style={{
              background: tokens.color.navy,
              color: tokens.color.white,
              padding: '12px 16px',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
              marginTop: 8,
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              opacity: !token ? 0.5 : 1,
            }}
          >
            {loading ? 'Lagrer…' : 'Lagre nytt passord'}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
          <Link href="/portal/login" style={{ color: tokens.color.navy }}>
            ← Tilbake til innlogging
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
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

const errStyle: React.CSSProperties = {
  background: '#FEE2E2',
  color: '#7F1D1D',
  padding: '10px 14px',
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  marginBottom: 16,
  border: '1px solid #FCA5A5',
};
