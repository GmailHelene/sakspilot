'use client';

/**
 * Desktop-only: tab-bar som vises i toppen av main content area når
 * Electron har åpnet en ekstern URL som BrowserView.
 *
 * BrowserView posisjoneres slik at sidebar (220px) + launcher (64px) +
 * sakspilot-header (60px) forblir synlig. Tab-baren er 36px høy og dekker
 * akkurat plassen over BrowserView i main content area.
 *
 * Brukerflyt:
 *   - Klikk på en snarvei i Launcher → tab-bar dukker opp + BrowserView lastes
 *   - Tab-baren har "← Tilbake" + "Åpne i nettleser" + "X Lukk"
 *
 * Kjører kun i Electron — i nettleser returneres null umiddelbart.
 */

import { useEffect, useState } from 'react';
import { X, ArrowLeft, ExternalLink } from 'lucide-react';

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

// MÅ matche konstantene i apps/desktop/src/main.js
const SAKSPILOT_HEADER_HEIGHT = 60;
const SIDEBAR_WIDTH = 220;
const LAUNCHER_WIDTH = 64;
const TAB_BAR_HEIGHT = 36;

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

  function openInBrowser() {
    if (!meta) return;
    // Åpne i ekstern nettleser — bruker fortsatt anchor-tag fordi sakspilot.openExternal er ikke wrappet
    window.open(meta.url, '_blank', 'noopener,noreferrer');
  }

  if (!meta) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: SAKSPILOT_HEADER_HEIGHT,
        left: SIDEBAR_WIDTH + LAUNCHER_WIDTH,
        right: 0,
        height: TAB_BAR_HEIGHT,
        background: '#F1F3F7',
        borderBottom: '1px solid #E6E9EF',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        zIndex: 99999,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <button
        onClick={close}
        title="Tilbake til Sakspilot"
        style={{
          background: '#1E3A5F',
          color: 'white',
          border: 'none',
          padding: '5px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <ArrowLeft size={13} strokeWidth={2.5} />
        Tilbake
      </button>

      {/* "Aktiv fane"-pille */}
      <div
        style={{
          background: 'white',
          border: '1px solid #E6E9EF',
          borderRadius: 16,
          padding: '4px 12px 4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#172B4D',
          fontWeight: 500,
          maxWidth: 340,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: '#00B884',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontWeight: 600,
            color: '#1E3A5F',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta.label}
        </span>
        <button
          onClick={close}
          aria-label="Lukk"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#5E6C84',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={openInBrowser}
        title="Åpne i nettleser"
        style={{
          background: 'transparent',
          color: '#5E6C84',
          border: 'none',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 11,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <ExternalLink size={12} strokeWidth={2} />
        Åpne i nettleser
      </button>
    </div>
  );
}
