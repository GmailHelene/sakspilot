'use client';

/**
 * Desktop-only: tab-bar med multi-tab BrowserView-system.
 *
 * Hver åpne snarvei (Gmail, Railway, Outlook osv) har sin egen BrowserView
 * i Electron-main. Bare ÉN er synlig av gangen ("active"), men alle holdes
 * i live så bruker kan switche mellom dem uten å miste sesjons-state.
 *
 * Tab-baren viser alle åpne tabs:
 *   - Klikk tab-pill → switcher aktiv view
 *   - Klikk X på en tab → lukker den tab-en (de andre forblir åpne)
 *   - "Tilbake"-knapp → lukker ALLE (tilbake til Sakspilot)
 *
 * Kjører kun i Electron — i nettleser returneres null umiddelbart.
 */

import { useEffect, useState } from 'react';
import { X, ArrowLeft, ExternalLink } from 'lucide-react';

interface Tab {
  url: string;
  label: string;
  loading?: boolean;
}

interface ShortcutState {
  tabs: Tab[];
  activeUrl: string | null;
}

interface DesktopApi {
  isDesktop?: boolean;
  switchShortcut?: (url: string) => Promise<{ ok: boolean }>;
  closeShortcutView?: (url?: string) => Promise<{ ok: boolean }>;
  getShortcutState?: () => Promise<ShortcutState>;
  onShortcutState?: (cb: (state: ShortcutState) => void) => () => void;
}

// MÅ matche konstantene i apps/desktop/src/main.js
const SAKSPILOT_HEADER_HEIGHT = 72;
const SIDEBAR_WIDTH = 220;
const LAUNCHER_WIDTH = 60;
const TAB_BAR_HEIGHT = 36;

export default function DesktopShortcutOverlay() {
  const [state, setState] = useState<ShortcutState>({ tabs: [], activeUrl: null });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (!api?.isDesktop) return;

    // Hent initial state
    if (api.getShortcutState) {
      api.getShortcutState().then(setState).catch(() => {});
    }

    // Lytt på endringer
    let off: (() => void) | undefined;
    if (api.onShortcutState) {
      off = api.onShortcutState(setState);
    }
    return () => {
      off?.();
    };
  }, []);

  async function switchTo(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (api?.switchShortcut) await api.switchShortcut(url);
  }

  async function closeTab(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (api?.closeShortcutView) await api.closeShortcutView(url);
  }

  async function closeAll() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: DesktopApi | undefined = (window as any).sakspilot;
    if (api?.closeShortcutView) await api.closeShortcutView();
  }

  function openInBrowser() {
    const active = state.tabs.find((t) => t.url === state.activeUrl);
    if (!active) return;
    window.open(active.url, '_blank', 'noopener,noreferrer');
  }

  if (state.tabs.length === 0) return null;

  return (
    <>
      {/* Solid backdrop som dekker hele main-content-området så React-page
          ikke bleder gjennom rundt BrowserView-en. */}
      <div
        style={{
          position: 'fixed',
          top: SAKSPILOT_HEADER_HEIGHT,
          left: SIDEBAR_WIDTH + LAUNCHER_WIDTH,
          right: 0,
          bottom: 0,
          background: '#FFFFFF',
          zIndex: 99998,
        }}
      />
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
          overflow: 'hidden',
        }}
      >
        <button
          onClick={closeAll}
          title="Lukk alle og tilbake til Sakspilot"
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
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={13} strokeWidth={2.5} />
          Tilbake
        </button>

        {/* Tab-pills — én per åpen snarvei */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            flex: 1,
            overflow: 'auto',
            minWidth: 0,
          }}
        >
          {state.tabs.map((tab) => {
            const isActive = tab.url === state.activeUrl;
            return (
              <div
                key={tab.url}
                onClick={() => !isActive && switchTo(tab.url)}
                style={{
                  background: isActive ? 'white' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${isActive ? '#1E3A5F' : '#E6E9EF'}`,
                  borderRadius: 16,
                  padding: '4px 10px 4px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: '#172B4D',
                  fontWeight: 500,
                  maxWidth: 220,
                  overflow: 'hidden',
                  cursor: isActive ? 'default' : 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.1s',
                }}
              >
                {tab.loading ? (
                  <span
                    aria-label="Laster"
                    title="Laster siden …"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      border: '2px solid #CBD5E1',
                      borderTopColor: '#1E3A5F',
                      animation: 'sp-tab-spin 0.8s linear infinite',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: isActive ? '#00B884' : '#CBD5E1',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#1E3A5F' : '#5E6C84',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tab.label}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.url);
                  }}
                  aria-label={`Lukk ${tab.label}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#5E6C84',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={openInBrowser}
          title="Åpne aktiv fane i nettleser"
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
            flexShrink: 0,
          }}
        >
          <ExternalLink size={12} strokeWidth={2} />
          Åpne i nettleser
        </button>
      </div>
      <style>{`@keyframes sp-tab-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
