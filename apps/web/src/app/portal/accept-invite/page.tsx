'use client';

/**
 * Klient-portal, godta invitasjon.
 *
 * Klienten kommer hit fra invite-e-posten med ?token=... i URL.
 * Setter passord (min 12 tegn), backend verifiserer token via bcrypt,
 * setter Client.email + passwordHash + portalEnabled, returnerer JWT.
 */
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';
import {
  portalApi,
  setPortalToken,
  PortalApiError,
} from '@/lib/portalApi';

interface AcceptResponse {
  ok: boolean;
  token: string;
  client: { id: string; name: string; email: string; organizationName: string };
}

function AcceptInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setError('Mangler invitasjons-token i URL-en.');
  }, [token]);

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
      const res = await portalApi<AcceptResponse>('/client-portal/accept-invite', {
        method: 'POST',
        body: { token, password },
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
          maxWidth: 440,
          boxShadow: tokens.shadow.md,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.textMuted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Klient-portal
        </div>
        <h1 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 8 }}>
          Sett passord
        </h1>
        <p style={{ fontSize: 14, color: tokens.color.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
          Velg et passord for tilgang til klient-portalen. Minst 12 tegn.
        </p>

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
            <span style={{ fontSize: 13, fontWeight: 600 }}>Nytt passord</span>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Bekreft passord</span>
            <input
              style={inputStyle}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
            />
          </label>
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
            {loading ? 'Aktiverer…' : 'Aktiver tilgang og logg inn'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
          Har du allerede satt passord?{' '}
          <Link href="/portal/login" style={{ color: tokens.color.navy, fontWeight: 600 }}>
            Logg inn her
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
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
