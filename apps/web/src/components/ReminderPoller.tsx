'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X, Clock } from 'lucide-react';
import { api, isTokenValid } from '@/lib/api';
import { tokens } from '@/lib/tokens';

/**
 * Global påminnelse-poller for klistrelapper.
 *
 * Pollerer GET /stickies/due-reminders hvert 60. sek. For hver klistrelapp
 * med remindAt <= now og notifiedAt = null:
 *   1. Vises en in-app toast øverst på siden (alle plattformer)
 *   2. Hvis Notification.permission === 'granted' vises også en native
 *      browser-notif (lurt på desktop hvis brukeren har Sakspilot i annen tab)
 *
 * Bruker kan:
 *   - Klikke "OK" → POST /stickies/:id/mark-notified (notifiedAt settes,
 *     samme påminnelse kommer ikke igjen)
 *   - Klikke "Slumre 5 min" → PATCH remindAt = now + 5min (backend nullstiller
 *     notifiedAt så ny varsel kommer om 5 min)
 *
 * Strategi: in-app toast er hovedkanalen (fungerer alltid, ingen permissions
 * nødvendig). Native Notification er bonus når tillatt. Web Push (med
 * service-worker + VAPID) er ikke implementert nå — kommer hvis brukere
 * spør etter varsler når Sakspilot-tab er helt lukket.
 *
 * Edge cases:
 *   - Bruker avviser Notification.permission → fortsatt full funksjonalitet
 *     via in-app toast (vi nag-er ikke om permission etter første "denied")
 *   - Vinduet er minimert/skjult → in-app toast vises ved retur, native
 *     notification vises umiddelbart hvis tillatt
 *   - Bruker ikke innlogget → poller stopper (sjekker isTokenValid)
 *   - Bruker er på Electron-desktop → main.js poller ALSO og viser native
 *     OS-notif. For å unngå dobbeltvarsler markeres som notified av den som
 *     vinner racet (backend er kilden til sannhet).
 */

interface DueReminder {
  id: string;
  content: string;
  color: string;
  remindAt: string;
}

const POLL_INTERVAL_MS = 60 * 1000;

export default function ReminderPoller() {
  const [active, setActive] = useState<DueReminder[]>([]);
  // Hindre at samme toast dukker opp to ganger hvis poll kommer før
  // mark-notified er ferdig (intern in-memory dedupe).
  const shownIdsRef = useRef<Set<string>>(new Set());

  const fetchDue = useCallback(async () => {
    if (!isTokenValid()) return;
    try {
      const { notes } = await api<{ notes: DueReminder[] }>('/stickies/due-reminders');
      if (!notes || notes.length === 0) return;
      setActive((prev) => {
        const existing = new Set(prev.map((n) => n.id));
        const fresh = notes.filter(
          (n) => !existing.has(n.id) && !shownIdsRef.current.has(n.id),
        );
        if (fresh.length === 0) return prev;
        for (const n of fresh) {
          shownIdsRef.current.add(n.id);
          maybeShowNativeNotification(n);
        }
        return [...prev, ...fresh];
      });
    } catch {
      // Stille feil — vi prøver igjen ved neste poll
    }
  }, []);

  useEffect(() => {
    // Be om Notification-permission én gang hvis ikke besluttet ennå.
    // 'default' = ikke spurt, 'granted'/'denied' = ferdig.
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      // Bruker-gesture er ikke strengt påkrevd i de fleste browsere lenger,
      // men noen (Safari iOS) krever det. Vi prøver — feiler stille.
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignorer
      }
    }

    // Initial fetch + interval
    fetchDue();
    const id = window.setInterval(fetchDue, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchDue]);

  async function dismiss(reminder: DueReminder) {
    setActive((prev) => prev.filter((n) => n.id !== reminder.id));
    try {
      await api(`/stickies/${reminder.id}/mark-notified`, { method: 'POST' });
    } catch {
      // Hvis dette feiler kommer samme påminnelse igjen ved neste poll —
      // det er greit. shownIdsRef-en glemmer den hvis brukeren reloader.
    }
  }

  async function snooze(reminder: DueReminder) {
    setActive((prev) => prev.filter((n) => n.id !== reminder.id));
    // Fjern fra shown så brukeren får ny varsel om 5 min
    shownIdsRef.current.delete(reminder.id);
    const newRemindAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    try {
      await api(`/stickies/${reminder.id}`, {
        method: 'PATCH',
        body: { remindAt: newRemindAt },
      });
    } catch {
      // Hvis det feiler vises ingen ny påminnelse — bruker kan sette ny
      // tid manuelt fra klistrelapp-siden.
    }
  }

  if (active.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
      }}
      role="region"
      aria-label="Påminnelser"
    >
      {active.map((r) => {
        const accent = colorEdge(r.color);
        return (
          <div
            key={r.id}
            style={{
              background: 'white',
              borderRadius: tokens.radius.md,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              borderLeft: `4px solid ${accent}`,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              animation: 'sakspilot-reminder-slide 0.25s ease-out',
            }}
            role="alert"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Bell size={16} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 2 }}>
                  Påminnelse
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: tokens.color.text,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {r.content || <em style={{ color: tokens.color.textMuted }}>(tom klistrelapp)</em>}
                </div>
              </div>
              <button
                onClick={() => dismiss(r)}
                aria-label="Lukk varsel"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: '#999',
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => snooze(r)} style={btnSecondary}>
                <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Slumre 5 min
              </button>
              <button onClick={() => dismiss(r)} style={{ ...btnPrimary, background: accent }}>
                OK
              </button>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes sakspilot-reminder-slide {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function maybeShowNativeNotification(r: DueReminder) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Sakspilot — påminnelse', {
      body: r.content || '(tom klistrelapp)',
      tag: `sakspilot-sticky-${r.id}`, // dedupe i samme browser-instans
      silent: false,
    });
    // Når bruker klikker varselet, fokuser tab-en
    n.onclick = () => {
      try { window.focus(); } catch { /* ignorer */ }
      n.close();
    };
  } catch {
    // Safari og noen browsere kan kaste hvis Notification konstrueres
    // utenom en aktiv user-gesture — ignorer.
  }
}

function colorEdge(color: string): string {
  switch (color) {
    case 'pink':   return '#EC4899';
    case 'blue':   return '#3B82F6';
    case 'green':  return '#10B981';
    case 'purple': return '#8B5CF6';
    case 'orange': return '#F97316';
    case 'yellow':
    default:       return '#F59E0B';
  }
}

const btnPrimary: React.CSSProperties = {
  background: tokens.color.navy,
  color: 'white',
  border: 'none',
  borderRadius: tokens.radius.sm,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  background: 'white',
  color: tokens.color.text,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
};
