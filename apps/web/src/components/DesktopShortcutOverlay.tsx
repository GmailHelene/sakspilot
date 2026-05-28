'use client';

/**
 * Desktop-only: vises som en topp-bar OVER alt annet UI når Electron
 * har åpnet en ekstern URL som BrowserView inne i dashboard-vinduet.
 *
 * Sub-viewen reserverer plass fra y=44px og ned, så vi har 44px topp
 * å rendre "← Lukk Tripletex"-knappen i.
 *
 * Kjører kun i Electron — i nettleser returneres null umiddelbart.
 */

import { useEffect, useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';

interface ShortcutMeta {
  url: string;
  label: string;
}

interface DesktopApi {
  isDesktop?: boolean;
  closeShortcutView?: () => Promise<{ ok: boolean }>;
  onShortcutOpened?: (cb: (meta: ShortcutMeta) => void) => () => void;
  onShortcutClosed?: (cb: () => void) => () => void;
}

export default function DesktopShortcutOverlay() {
  const [meta, setMeta] = useState<ShortcutMeta | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (!api?.isDesktop || !api.onShortcutOpened || !api.onShortcutClosed) return;

    const offOpened = api.onShortcutOpened((m) => setMeta(m));
    const offClosed = api.onShortcutClosed(() => setMeta(null));

    return () => {
      offOpened?.();
      offClosed?.();
    };
  }, []);

  async function close() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (api?.closeShortcutView) await api.closeShortcutView();
    setMeta(null);
  }

  if (!meta) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        background: '#1E3A5F',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        zIndex: 99999,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <button
        onClick={close}
        style={{
          background: 'transparent',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.3)',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        Tilbake til Sakspilot
      </button>
      <div style={{ flex: 1, fontSize: 13, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <strong>{meta.label}</strong>
        <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>{meta.url}</span>
      </div>
      <button
        onClick={close}
        aria-label="Lukk"
        style={{
          background: 'transparent',
          color: 'white',
          border: 'none',
          opacity: 0.7,
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
        }}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
