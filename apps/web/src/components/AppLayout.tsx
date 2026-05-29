'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import Launcher from './Launcher';
import { isTokenValid } from '@/lib/api';
import { initPreferenceSync } from '@/lib/preferenceSync';
import { tokens } from '@/lib/tokens';

/**
 * Layout for innloggede sider — header på toppen, sidebar til venstre,
 * innhold til høyre. Redirecter til /login hvis ikke autentisert.
 *
 * Mobil (< 768px): sidebar er skjult bak hamburger-knapp.
 * Launcher er også skjult på mobil for å spare plass.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!isTokenValid()) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
    // Start cloud-sync av UI-preferanser (snarveier, sites, mapper, tema osv)
    // — sørger for at data overlever ny .exe-install / browser-bytte.
    initPreferenceSync().catch(() => {});
  }, [router]);

  // Når brukeren navigerer i Sakspilot (klikker Prosjekter, Klienter osv) mens
  // en snarvei er åpen (Railway/Outlook i BrowserView), lukk BrowserView-en
  // så hovedinnholdet faktisk vises. Uten dette ligger Railway "på toppen"
  // og dekker den navigerte siden.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (typeof window !== 'undefined' ? (window as any).sakspilot : null);
    if (api?.isDesktop && api.closeShortcutView) {
      api.closeShortcutView().catch(() => {});
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Lukk meny ved navigasjon
  useEffect(() => {
    setMobileMenuOpen(false);
  }, []);

  if (authed === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: tokens.color.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens.color.textMuted,
        }}
      >
        Laster…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Mobil-hamburger — floating top-left, men under main-content
            (innhold dyttes ned via paddingTop:60 så de ikke overlapper) */}
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Lukk meny' : 'Åpne meny'}
            style={{
              position: 'fixed',
              top: 64,
              left: 10,
              zIndex: 998,
              width: 36,
              height: 36,
              borderRadius: 10,
              background: tokens.color.navy,
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: tokens.shadow.md,
            }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}

        {/* Launcher (eksterne apper) — kun desktop */}
        {!isMobile && <Launcher />}

        {/* Sidebar */}
        {isMobile ? (
          <>
            {mobileMenuOpen && (
              <div
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(23, 43, 77, 0.5)',
                  zIndex: 996,
                }}
              />
            )}
            <div
              style={{
                position: 'fixed',
                top: 60,
                left: 0,
                bottom: 0,
                width: 260,
                background: 'white',
                zIndex: 997,
                transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.2s ease',
                boxShadow: mobileMenuOpen ? tokens.shadow.lg : 'none',
                overflowY: 'auto',
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Sidebar />
            </div>
          </>
        ) : (
          <Sidebar />
        )}

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: tokens.color.bg,
            // På mobil: 52px topp-padding rydder plass til floating hamburger
            // (som ligger fast ved top:64, height:36). Uten dette overlapper
            // hamburger med sidens H1.
            paddingTop: isMobile ? 52 : 0,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
