'use client';

/**
 * Floating-widget nederst i venstre hjørne — kun synlig i Electron.
 *
 * Viser status for desktop-agenten (kjører/pauset/ikke startet) og lar
 * brukeren starte/stoppe/pause arbeidsøkten direkte fra web-vinduet
 * i stedet for å måtte gå via tray-ikonet.
 */

import { useEffect, useState, useCallback } from 'react';
import { Play, Square, Pause, RefreshCw, Clock } from 'lucide-react';

interface AgentStatus {
  active: boolean;
  paused: boolean;
  startedAt: number | null;
  sessionCount: number;
  pendingCount: number;
}

interface DesktopApi {
  isDesktop?: boolean;
  getStatus?: () => Promise<AgentStatus>;
  startWorkSession?: () => Promise<boolean>;
  stopWorkSession?: () => Promise<boolean>;
  togglePause?: () => Promise<boolean>;
  syncNow?: () => Promise<boolean>;
}

function getApi(): DesktopApi | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).sakspilot;
  return api?.isDesktop ? api : null;
}

function fmt(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function DesktopAgentControls() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const api = getApi();
    if (!api?.getStatus) return;
    try {
      const s = await api.getStatus();
      setStatus(s);
    } catch {
      // ignorer — desktop kan være restarting
    }
  }, []);

  useEffect(() => {
    const api = getApi();
    if (!api) return;
    refresh();
    const i = setInterval(refresh, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(i);
      clearInterval(tick);
    };
  }, [refresh]);

  async function action(fn: 'start' | 'stop' | 'pause' | 'sync') {
    const api = getApi();
    if (!api) return;
    setBusy(true);
    try {
      if (fn === 'start') await api.startWorkSession?.();
      if (fn === 'stop') await api.stopWorkSession?.();
      if (fn === 'pause') await api.togglePause?.();
      if (fn === 'sync') await api.syncNow?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const api = getApi();
  if (!api) return null; // ikke desktop = ikke vis
  if (!status) return null;

  const elapsedMs = status.startedAt ? now - status.startedAt : 0;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Vis tidsregistreringen"
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 9000,
          width: 44,
          height: 44,
          borderRadius: 22,
          background: status.active
            ? status.paused
              ? '#E9C46A'
              : '#2D6A4F'
            : '#1E3A5F',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Clock size={20} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9000,
        background: 'white',
        border: '1px solid #E2E2DC',
        borderRadius: 12,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        padding: 12,
        minWidth: 220,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            color: status.active
              ? status.paused
                ? '#9C7E1D'
                : '#2D6A4F'
              : '#555',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: status.active
                ? status.paused
                  ? '#E9C46A'
                  : '#2D6A4F'
                : '#94A3B8',
              animation: status.active && !status.paused ? 'pulse 2s infinite' : undefined,
            }}
          />
          {status.active
            ? status.paused
              ? 'Pauset'
              : 'Tar tid'
            : 'Klar'}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Minimer"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#8A8A8A',
            cursor: 'pointer',
            padding: 2,
            fontSize: 11,
          }}
        >
          ✕
        </button>
      </div>

      {status.active && (
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: '#1E3A5F',
            marginBottom: 4,
          }}
        >
          {fmt(elapsedMs)}
        </div>
      )}

      {status.active && status.sessionCount > 0 && (
        <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
          {status.sessionCount} sessions logget · {status.pendingCount} venter på sync
        </div>
      )}
      {!status.active && status.pendingCount > 0 && (
        <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
          {status.pendingCount} entries venter på sync
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {!status.active ? (
          <button
            onClick={() => action('start')}
            disabled={busy}
            style={primaryBtn('#2D6A4F')}
          >
            <Play size={13} strokeWidth={2.5} style={{ marginRight: 4 }} />
            Start
          </button>
        ) : (
          <>
            <button
              onClick={() => action('pause')}
              disabled={busy}
              style={secondaryBtn}
              title={status.paused ? 'Fortsett' : 'Pause'}
            >
              {status.paused ? (
                <Play size={13} strokeWidth={2.5} />
              ) : (
                <Pause size={13} strokeWidth={2.5} />
              )}
            </button>
            <button
              onClick={() => action('stop')}
              disabled={busy}
              style={primaryBtn('#9D0208')}
              title="Stopp arbeidsøkt + lag rapport"
            >
              <Square size={13} strokeWidth={2.5} style={{ marginRight: 4 }} />
              Stopp
            </button>
          </>
        )}
        {status.pendingCount > 0 && (
          <button
            onClick={() => action('sync')}
            disabled={busy}
            style={secondaryBtn}
            title="Synkroniser nå"
          >
            <RefreshCw size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

function primaryBtn(bg: string): React.CSSProperties {
  return {
    flex: 1,
    background: bg,
    color: 'white',
    border: 'none',
    padding: '7px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

const secondaryBtn: React.CSSProperties = {
  background: '#F4F4F0',
  color: '#1E3A5F',
  border: '1px solid #E2E2DC',
  padding: '7px 10px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
