'use client';

import { useEffect } from 'react';
import { tokens } from '@/lib/tokens';

/**
 * Global error boundary — fanger client-side exceptions slik at brukeren ikke
 * ser Next.js sin generiske feilside.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: tokens.color.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: tokens.font.sans,
      }}
    >
      <div
        style={{
          background: tokens.color.white,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.lg,
          padding: 40,
          maxWidth: 480,
          textAlign: 'center',
          boxShadow: tokens.shadow.md,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 8 }}>
          Oops — noe gikk galt
        </h1>
        <p style={{ color: tokens.color.textMuted, fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
          En feil oppstod. Prøv å laste siden på nytt eller gå tilbake.
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: tokens.color.textSubtle, fontFamily: tokens.font.mono, marginBottom: 20 }}>
            Referanse: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 18px',
              background: tokens.color.navy,
              color: tokens.color.white,
              border: 'none',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Prøv igjen
          </button>
          <a
            href="/hjem"
            style={{
              padding: '10px 18px',
              background: 'transparent',
              color: tokens.color.text,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.md,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Gå til Hjem
          </a>
        </div>
      </div>
    </main>
  );
}
