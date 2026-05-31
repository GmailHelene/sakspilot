'use client';

/**
 * AiTriageWidget — viser AI-foreslåtte saker for ukategoriserte TimeEntries.
 *
 * Når desktop-agenten har logget arbeidsøkter uten matching-rule-treff, kan
 * bruker trykke "Foreslå med AI" — backend (POST /ai-triage/suggest) sender
 * window-tittel + app-navn til Claude og foreslår sak fra brukerens egne.
 * Forslagene listes her med "✓ Godta" / "✕ Avslå" per entry.
 *
 * Plassering: /hjem, mellom KPI-er og Tips. Bare synlig hvis det enten finnes
 * pending forslag ELLER ingen forslag ennå (så bruker ser CTA).
 */

import { useEffect, useState } from 'react';
import { Sparkles, Check, X, RefreshCw } from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface PendingItem {
  id: string;
  windowTitle: string | null;
  appName: string | null;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  aiSuggestedAt: string | null;
  suggestedSak: {
    id: string;
    title: string;
    clientName: string | null;
  } | null;
}

interface SuggestResult {
  suggested: number;
  skipped: number;
  quotaUsed: number;
  quotaLimit: number;
  message?: string;
}

export default function AiTriageWidget() {
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<SuggestResult | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const res = await api<{ items: PendingItem[] }>('/ai-triage/pending');
      setItems(res.items);
    } catch (err) {
      // Stille feil — hvis API er nede skjuler vi widgeten heller enn å spam-e.
      console.error('[ai-triage] kunne ikke hente pending:', err);
      setItems([]);
    }
  }

  async function runSuggest() {
    setRunning(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await api<SuggestResult>('/ai-triage/suggest', { method: 'POST' });
      setLastRun(res);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-forslag feilet');
    } finally {
      setRunning(false);
    }
  }

  async function accept(id: string) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await api(`/ai-triage/accept/${id}`, { method: 'POST' });
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke godta forslaget');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function reject(id: string) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await api(`/ai-triage/reject/${id}`, { method: 'POST' });
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke avslå forslaget');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (items === null) {
    // Initial load — vis ingenting (unngår flicker)
    return null;
  }

  const hasItems = items.length > 0;

  return (
    <div style={widgetStyle}>
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${tokens.color.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.color.navy }}>
          <Sparkles size={18} strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>AI-kategorisering</span>
          {hasItems && (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                background: tokens.color.purple,
                color: 'white',
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {items.length}
            </span>
          )}
        </div>
        <button
          onClick={runSuggest}
          disabled={running}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: running ? tokens.color.bgAlt : tokens.color.navy,
            color: running ? tokens.color.textMuted : 'white',
            border: 'none',
            borderRadius: tokens.radius.sm,
            fontSize: 12,
            fontWeight: 600,
            cursor: running ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
          title="Send ukategoriserte tidsregistreringer til Claude og få prosjekt-forslag"
        >
          <RefreshCw size={12} strokeWidth={2.5} style={running ? { animation: 'spin 1s linear infinite' } : undefined} />
          {running ? 'Foreslår…' : 'Foreslå med AI'}
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {error && (
          <div
            style={{
              padding: 10,
              background: '#FEE2E2',
              color: '#7F1D1D',
              borderRadius: tokens.radius.sm,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {lastRun && !hasItems && lastRun.suggested === 0 && (
          <div
            style={{
              padding: 10,
              background: tokens.color.bgAlt,
              color: tokens.color.textMuted,
              borderRadius: tokens.radius.sm,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {lastRun.message || 'Ingen nye forslag — alle entries er enten kategorisert eller uten åpenbar match.'}
          </div>
        )}

        {!hasItems && !lastRun && (
          <p style={{ fontSize: 13, color: tokens.color.textMuted, lineHeight: 1.45, margin: 0 }}>
            Når desktop-agenten logger arbeidsøkter som ikke matcher noe prosjekt, kan Claude foreslå riktig prosjekt basert på vindustittel. Trykk <strong>Foreslå med AI</strong> for å starte.
          </p>
        )}

        {hasItems && (
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((it) => (
              <SuggestionRow
                key={it.id}
                item={it}
                busy={busyIds.has(it.id)}
                onAccept={() => accept(it.id)}
                onReject={() => reject(it.id)}
              />
            ))}
          </div>
        )}

        {lastRun && (lastRun.suggested > 0 || lastRun.skipped > 0) && (
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: tokens.color.textSubtle,
              borderTop: `1px solid ${tokens.color.border}`,
              paddingTop: 8,
            }}
          >
            Siste kjøring: {lastRun.suggested} forslag, {lastRun.skipped} hoppet over.
            {' '}AI-kvote: {lastRun.quotaUsed}/{lastRun.quotaLimit}.
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function SuggestionRow({
  item,
  busy,
  onAccept,
  onReject,
}: {
  item: PendingItem;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const minutes = Math.round(item.durationSec / 60);
  const dateLabel = new Date(item.startedAt).toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        padding: 10,
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.sm,
        borderLeft: `3px solid ${tokens.color.purple}`,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: tokens.color.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={item.windowTitle ?? ''}
        >
          {item.windowTitle || item.appName || '(ukjent økt)'}
        </div>
        <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
          {dateLabel} · {minutes} min
          {item.appName && item.windowTitle ? ` · ${item.appName}` : ''}
        </div>
        <div
          style={{
            fontSize: 12,
            color: tokens.color.navy,
            fontWeight: 600,
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={item.suggestedSak?.title ?? ''}
        >
          → {item.suggestedSak?.title || '(prosjekt slettet)'}
          {item.suggestedSak?.clientName && (
            <span style={{ color: tokens.color.textMuted, fontWeight: 400 }}>
              {' '}({item.suggestedSak.clientName})
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onAccept}
          disabled={busy || !item.suggestedSak}
          style={iconBtnStyle(tokens.color.green, busy)}
          title="Godta forslaget"
          aria-label="Godta"
        >
          <Check size={14} strokeWidth={2.5} />
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          style={iconBtnStyle(tokens.color.red, busy)}
          title="Avslå — ikke spør igjen"
          aria-label="Avslå"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function iconBtnStyle(color: string, busy: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'white',
    color,
    border: `1px solid ${color}`,
    borderRadius: tokens.radius.sm,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    opacity: busy ? 0.5 : 1,
  };
}

const widgetStyle: React.CSSProperties = {
  background: tokens.color.white,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  overflow: 'hidden',
};
