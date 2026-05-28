'use client';

/**
 * PWA-init — registrerer service worker + viser "installer som app"-banner
 * når nettleseren støtter PWA-installasjon. Vises kun:
 *   - hvis ikke allerede installert som standalone
 *   - hvis brukeren ikke har avvist banneret før (lagres i localStorage)
 */

import { useEffect, useState } from 'react';
import { X, Smartphone } from 'lucide-react';
import { events } from '@/lib/analytics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'sakspilot_pwa_dismissed';

export default function PwaInit() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Registrer service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] Service worker-registrering feilet:', err);
      });
    }

    // Standalone-modus = allerede installert → ikke vis banner
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Sjekk om brukeren har avvist før
    if (localStorage.getItem(DISMISSED_KEY)) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShow(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') events.pwaInstalled();
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setShow(false);
      setInstallEvent(null);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 460,
        margin: '0 auto',
        background: '#1E3A5F',
        color: 'white',
        padding: 14,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <Smartphone size={28} strokeWidth={2} style={{ color: '#B8860B', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
          Installer Sakspilot
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
          Få Sakspilot som app på hjem-skjermen
        </div>
      </div>
      <button
        onClick={install}
        style={{
          padding: '8px 14px',
          background: '#B8860B',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Installer
      </button>
      <button
        onClick={dismiss}
        aria-label="Lukk"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          opacity: 0.7,
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
