'use client';

/**
 * Topbar for klient-portalen. Brukes på alle innloggede portal-sider.
 * Underscore-prefiks hindrer at Next.js tolker dette som en route.
 *
 * Branding-overrides:
 *   - Hvis requesten kom inn på et verifisert CustomDomain, returnerer backend
 *     branding-info i /client-portal/me-responsen (brandName, brandTagline,
 *     brandPrimaryColor, brandLogoUrl).
 *   - brandName overstyrer "Sakspilot, Klient-portal" i topp-baren.
 *   - brandPrimaryColor settes som --sp-primary CSS-variabel på <html> så
 *     hele portal-UI får hovedfargen overstyrt (tokens.color.navy peker på
 *     denne CSS-varen, se lib/tokens.ts).
 *   - brandLogoUrl vises som <img> til venstre for navnet hvis satt.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { tokens } from '@/lib/tokens';

export interface PortalBranding {
  hostname: string;
  brandName: string | null;
  brandTagline: string | null;
  brandPrimaryColor: string | null;
  brandLogoUrl: string | null;
}

export interface PortalMe {
  id: string;
  name: string;
  contactEmail: string;
  organizationName: string;
  branding?: PortalBranding | null;
}

export function PortalTopBar({
  me,
  onLogout,
}: {
  me: PortalMe | null;
  onLogout: () => void;
}) {
  const branding = me?.branding ?? null;

  // Propager primær-farge til CSS-var så resten av portal-UI tar den i bruk.
  // ThemeInit på frilanser-siden bruker samme var-navn (--sp-primary), men
  // portal-layout har ikke ThemeInit, vi setter den her direkte på <html>.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (branding?.brandPrimaryColor) {
      root.style.setProperty('--sp-primary', branding.brandPrimaryColor);
      root.style.setProperty('--sp-primary-dark', branding.brandPrimaryColor);
      root.style.setProperty('--sp-primary-light', branding.brandPrimaryColor);
    }
    // Cleanup: ikke nødvendig, portal-layout er isolert fra frilanser-UI,
    // og hvis brukeren navigerer bort fra portalen lastes hele dokumentet
    // på nytt uansett (separat Next.js segment).
  }, [branding?.brandPrimaryColor]);

  const displayName = branding?.brandName || 'Sakspilot';
  const tagline = branding?.brandTagline || 'Klient-portal';

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
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: tokens.color.navy,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {branding?.brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.brandLogoUrl}
            alt={displayName}
            style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        )}
        <span>
          {displayName}
          <span style={{ color: tokens.color.textMuted, fontWeight: 500 }}> - {tagline}</span>
        </span>
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
