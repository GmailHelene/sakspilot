'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

function ResetPassordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError('Mangler reset-token i URL-en. Be om ny lenke.');
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError('Passordet må være minst 12 tegn.');
      return;
    }
    if (password !== confirm) {
      setError('Passordene matcher ikke.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  }

  return (
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
        <h1 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 16 }}>
          Nytt passord
        </h1>

        {done ? (
          <div
            style={{
              padding: 14,
              background: tokens.color.greenSoft,
              color: tokens.color.green,
              borderRadius: tokens.radius.sm,
              fontSize: 14,
            }}
          >
            ✓ Passord oppdatert. Sender deg til logg-inn-siden…
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

            <label style={labelStyle}>Nytt passord (min 12 tegn)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              autoFocus
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: 16 }}>Bekreft passord</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={12}
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={loading || !token}
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
                cursor: loading || !token ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: loading || !token ? 0.6 : 1,
              }}
            >
              {loading ? 'Oppdaterer…' : 'Sett nytt passord'}
            </button>
            <p style={{ marginTop: 16, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
              <Link href="/login" style={{ color: tokens.color.navy, fontWeight: 500 }}>
                ← Tilbake til logg inn
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPassordPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div style={{ padding: 60, textAlign: 'center' }}>Laster…</div>}>
        <ResetPassordInner />
      </Suspense>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: tokens.color.navy,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 15,
  width: '100%',
  background: tokens.color.white,
};
