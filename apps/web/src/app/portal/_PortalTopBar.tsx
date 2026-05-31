'use client';

/**
 * Topbar for klient-portalen. Brukes på alle innloggede portal-sider.
 * Underscore-prefiks hindrer at Next.js tolker dette som en route.
 */
import Link from 'next/link';
import { tokens } from '@/lib/tokens';

export interface PortalMe {
  id: string;
  name: string;
  contactEmail: string;
  organizationName: string;
}

export function PortalTopBar({
  me,
  onLogout,
}: {
  me: PortalMe | null;
  onLogout: () => void;
}) {
  return (
    <header
      style={{
        background: tokens.color.surface,
        borderBottom: `1px solid ${tokens.color.border}`,
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Link
        href="/portal"
        style={{ fontSize: 16, fontWeight: 700, color: tokens.color.navy, textDecoration: 'none' }}
      >
        Sakspilot — Klient-portal
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {me && (
          <span style={{ fontSize: 13, color: tokens.color.textMuted }}>
            Hei, <strong style={{ color: tokens.color.text }}>{me.name}</strong>
          </span>
        )}
        <button
          onClick={onLogout}
          style={{
            background: 'transparent',
            border: `1px solid ${tokens.color.border}`,
            color: tokens.color.textMuted,
            padding: '6px 12px',
            borderRadius: tokens.radius.sm,
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Logg ut
        </button>
      </div>
    </header>
  );
}
