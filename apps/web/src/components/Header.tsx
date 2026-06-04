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
      className="sp-header"
      style={{
        background: tokens.color.navy,
        color: tokens.color.white,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: tokens.shadow.sm,
        gap: 12,
      }}
    >
      <Link
        href={mounted && me ? '/saker' : '/'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: tokens.color.white,
          minWidth: 0, // tillat shrink ved trang plass
        }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0 }}>
          {/* Bold "S" på charcoal - matcher PWA-ikonet */}
          <rect width="32" height="32" rx="7" fill="#1F1F1F" />
          <path
            d="M 23 11 C 23 8, 20 7, 16 7 C 12 7, 9 8, 9 12.5 C 9 16, 12 17, 16 17 C 20 17, 23 17.5, 23 21 C 23 24.5, 20 25, 16 25 C 12 25, 9 24.5, 9 22"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1, whiteSpace: 'nowrap' }}>
            SAKSPILOT
          </div>
          <div
            className="sp-header-subtitle"
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              color: tokens.color.gold,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            Workspace for selvstendige
          </div>
        </div>
      </Link>

      <nav
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {mounted && me ? (
          <>
            <Link href="/saker" style={navLinkStyle} className="sp-header-nav-hide-mobile">
              Prosjekter
            </Link>
            <Link href="/klienter" style={navLinkStyle} className="sp-header-nav-hide-mobile">
              Klienter
            </Link>
            <Link href="/last-ned" style={navLinkStyle} title="Last ned Windows-appen" className="sp-header-nav-hide-mobile">
              ⬇ Desktop
            </Link>
            <span style={{ color: tokens.color.white, opacity: 0.85, whiteSpace: 'nowrap' }} className="sp-header-nav-hide-mobile">
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
                whiteSpace: 'nowrap',
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
                whiteSpace: 'nowrap',
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
  whiteSpace: 'nowrap' as const,
};
