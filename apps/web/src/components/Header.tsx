'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api, getToken, isTokenValid, setToken } from '@/lib/api';

interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationName: string;
  organizationPlan: string;
}

export default function Header() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isTokenValid()) return;
    api<MeResponse>('/auth/me')
      .then(setMe)
      .catch(() => {
        // 401 — token er ikke gyldig på serveren
        setToken(null);
      });
  }, []);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignorer — vi rydder lokalt uansett
    }
    setToken(null);
    setMe(null);
    router.push('/');
  }

  return (
    <header
      style={{
        background: tokens.color.navy,
        color: tokens.color.white,
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: tokens.shadow.sm,
      }}
    >
      <Link
        href={mounted && me ? '/saker' : '/'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: tokens.color.white,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
          {/* Pilot-trekant med kompassnål — matcher PWA-ikonet */}
          <path d="M16 5 L26 24 L6 24 Z" fill={tokens.color.gold} stroke="#FFFFFF" strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M16 11 L14 21 L16 19.5 L18 21 Z" fill="#FFFFFF" />
          <circle cx="16" cy="9" r="1.3" fill="#FFFFFF" />
        </svg>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>
            SAKSPILOT
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              color: tokens.color.gold,
              textTransform: 'uppercase',
            }}
          >
            Workspace for selvstendige
          </div>
        </div>
      </Link>

      <nav
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          fontSize: 13,
        }}
      >
        {mounted && me ? (
          <>
            <Link href="/saker" style={navLinkStyle}>
              Saker
            </Link>
            <Link href="/klienter" style={navLinkStyle}>
              Klienter
            </Link>
            <span style={{ color: tokens.color.white, opacity: 0.85 }}>
              {me.name}
            </span>
            <button
              onClick={logout}
              style={{
                color: tokens.color.navy,
                background: tokens.color.gold,
                padding: '7px 14px',
                borderRadius: tokens.radius.sm,
                fontWeight: 600,
              }}
            >
              Logg ut
            </button>
          </>
        ) : mounted ? (
          <>
            <Link href="/login" style={navLinkStyle}>
              Logg inn
            </Link>
            <Link
              href="/registrer"
              style={{
                color: tokens.color.navy,
                background: tokens.color.gold,
                padding: '7px 14px',
                borderRadius: tokens.radius.sm,
                fontWeight: 600,
              }}
            >
              Kom i gang
            </Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}

const navLinkStyle = {
  color: '#FFFFFF',
  opacity: 0.85,
};
