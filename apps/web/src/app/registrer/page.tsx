'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { tokens } from '@/lib/tokens';
import { api, setToken, isTokenValid, ApiError } from '@/lib/api';

interface RegisterResponse {
  ok: boolean;
  token: string;
  user: { name: string };
}

export default function RegistrerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Hvis allerede innlogget, hopp rett til /saker
  useEffect(() => {
    if (isTokenValid()) router.replace('/saker');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: {
          email: email.trim(),
          password,
          name: name.trim(),
          organizationName: organizationName.trim() || undefined,
        },
      });
      setToken(res.token);
      router.push('/saker');
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as Record<string, string[]> | undefined;
        const fieldError = details ? Object.values(details)[0]?.[0] : null;
        setError(fieldError || err.message);
      } else {
        setError('Ukjent feil — prøv igjen');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 8 }}>
            Kom i gang med Sakspilot
          </h1>
          <p style={{ color: tokens.color.textMuted, marginBottom: 28, fontSize: 14 }}>
            Gratis i pilotperioden. Ingen kortinformasjon kreves.
          </p>

          {error && <div style={errorBoxStyle}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            <Field label="Navn" required>
              <input
                style={inputStyle}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Helene Åsheim Grønberg"
                required
                autoComplete="name"
              />
            </Field>

            <Field label="E-post" required>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="navn@firma.no"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Passord (minst 8 tegn)" required>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>

            <Field label="Firmanavn (valgfritt)">
              <input
                style={inputStyle}
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Tech Solutions"
                autoComplete="organization"
              />
            </Field>

            <button type="submit" disabled={loading} style={primaryButtonStyle}>
              {loading ? 'Oppretter konto…' : 'Opprett konto'}
            </button>
          </form>

          <p style={{ marginTop: 24, fontSize: 14, color: tokens.color.textMuted }}>
            Allerede konto?{' '}
            <Link href="/login" style={{ color: tokens.color.navy, fontWeight: 600 }}>
              Logg inn
            </Link>
          </p>
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
      <span style={{ fontSize: 13, fontWeight: 600, color: tokens.color.text }}>
        {label} {required && <span style={{ color: tokens.color.red }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 60px)',
  background: tokens.color.bg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  background: tokens.color.white,
  padding: 36,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  width: '100%',
  maxWidth: 440,
  boxShadow: tokens.shadow.md,
};

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
  padding: '12px 16px',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
  fontSize: 15,
  marginTop: 8,
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
