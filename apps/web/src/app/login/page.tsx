'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, setToken, isTokenValid, ApiError } from '@/lib/api';

interface LoginResponse {
  ok: boolean;
  token: string;
  user: { name: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isTokenValid()) router.replace('/saker');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      setToken(res.token);
      router.push('/saker');
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
            maxWidth: 400,
            boxShadow: tokens.shadow.md,
          }}
        >
          <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 28 }}>
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
              }}
            >
              {loading ? 'Logger inn…' : 'Logg inn'}
            </button>
          </form>

          <p style={{ marginTop: 24, fontSize: 14, color: tokens.color.textMuted }}>
            Ikke konto enda?{' '}
            <Link href="/registrer" style={{ color: tokens.color.navy, fontWeight: 600 }}>
              Opprett konto
            </Link>
          </p>
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
