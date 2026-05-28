import Link from 'next/link';
import { tokens } from '@/lib/tokens';

export default function NotFound() {
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
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 64, marginBottom: 16, fontWeight: 800, color: tokens.color.navy }}>
          404
        </div>
        <h1 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 8 }}>
          Siden finnes ikke
        </h1>
        <p style={{ color: tokens.color.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
          URL-en du prøvde å åpne er ikke gyldig eller har blitt flyttet.
        </p>
        <Link
          href="/hjem"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            background: tokens.color.navy,
            color: tokens.color.white,
            borderRadius: tokens.radius.md,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Tilbake til Hjem
        </Link>
      </div>
    </main>
  );
}
