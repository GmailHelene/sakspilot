'use client';

/**
 * Klient-portal, login.
 *
 * Helt separat fra /login (frilanser). Bruker portalApi + portal-token-nøkkel
 * slik at frilanseren og klienten kan dele nettleser uten å skvise hverandres
 * sesjon.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import {
  portalApi,
  setPortalToken,
  isPortalTokenValid,
  PortalApiError,
} from '@/lib/portalApi';

interface LoginResponse {
  ok: boolean;
  token: string;
  client: { id: string; name: string; email: string; organizationName: string };
}

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPortalTokenValid()) router.replace('/portal');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await portalApi<LoginResponse>('/client-portal/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      setPortalToken(res.token);
      router.push('/portal');
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
          maxWidth: 400,
          boxShadow: tokens.shadow.md,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.textMuted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Klient-portal
        </div>
        <h1 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 24 }}>
          Logg inn
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

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Passord</span>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
          <Link href="/portal/glemt-passord" style={{ color: tokens.color.navy, fontWeight: 500 }}>
            Glemt passord?
          </Link>
        </p>
        <p style={{ marginTop: 20, fontSize: 12, color: tokens.color.textSubtle, textAlign: 'center', lineHeight: 1.6 }}>
          Har du ikke fått invitasjon enda? Be frilanseren din om å sende
          deg en invitasjon til klient-portalen.
        </p>
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
