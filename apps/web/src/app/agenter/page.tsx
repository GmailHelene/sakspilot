'use client';

/**
 * Agenter — Monday/Notion-stil automatiseringer.
 *
 * Brukeren kan:
 *  - Bla i ferdige maler og opprette i ett klikk
 *  - Skru av/på enkelt-agenter
 *  - Test-kjøre en agent uten ekte trigger
 *  - Slette agenter
 */

import { useEffect, useState } from 'react';
import { Zap, Plus, Trash2, Play, Power, CheckCircle2, Clock } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { events } from '@/lib/analytics';

type TriggerType =
  | 'sak_status_changed'
  | 'sak_created'
  | 'milestone_completed'
  | 'milestone_due_soon'
  | 'time_entry_logged';

type ActionType =
  | 'create_sticky'
  | 'create_milestone'
  | 'change_sak_status'
  | 'show_notification';

interface Automation {
  id: string;
  name: string;
  trigger: TriggerType;
  triggerConfig: Record<string, unknown>;
  action: ActionType;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  trigger: TriggerType;
  triggerConfig: Record<string, unknown>;
  action: ActionType;
  actionConfig: Record<string, unknown>;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  sak_status_changed: 'Når sak-status endres',
  sak_created: 'Når ny sak opprettes',
  milestone_completed: 'Når milepæl fullføres',
  milestone_due_soon: 'Når frist nærmer seg',
  time_entry_logged: 'Når tid logges',
};

const ACTION_LABELS: Record<ActionType, string> = {
  create_sticky: 'Lag klistrelapp',
  create_milestone: 'Lag milepæl',
  change_sak_status: 'Endre sak-status',
  show_notification: 'Vis varsel',
};

export default function AgenterPage() {
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    try {
      const [a, t] = await Promise.all([
        api<{ automations: Automation[] }>('/automations'),
        api<{ templates: Template[] }>('/automations/templates'),
      ]);
      setAutomations(a.automations);
      setTemplates(t.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    }
  }

  async function createFromTemplate(tpl: Template) {
    setBusy('create:' + tpl.id);
    try {
      const created = await api<Automation>('/automations', {
        method: 'POST',
        body: {
          name: tpl.name,
          trigger: tpl.trigger,
          triggerConfig: tpl.triggerConfig,
          action: tpl.action,
          actionConfig: tpl.actionConfig,
          enabled: true,
        },
      });
      setAutomations((prev) => (prev ? [created, ...prev] : [created]));
      events.agentActivated(tpl.id);
      setToast(`«${tpl.name}» aktivert`);
      setShowGallery(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opprettelse feilet');
    } finally {
      setBusy(null);
    }
  }

  async function toggle(a: Automation) {
    setBusy('toggle:' + a.id);
    try {
      const updated = await api<Automation>(`/automations/${a.id}`, {
        method: 'PATCH',
        body: { enabled: !a.enabled },
      });
      setAutomations((prev) =>
        prev ? prev.map((x) => (x.id === a.id ? updated : x)) : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Endring feilet');
    } finally {
      setBusy(null);
    }
  }

  async function testRun(a: Automation) {
    setBusy('test:' + a.id);
    try {
      const res = await api<{ ok: boolean; message: string }>(
        `/automations/${a.id}/test`,
        { method: 'POST' }
      );
      events.agentTested();
      setToast(res.message || 'Test-kjøring ferdig');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test-kjøring feilet');
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Automation) {
    if (!confirm(`Slette agenten «${a.name}»?`)) return;
    setBusy('del:' + a.id);
    try {
      await api(`/automations/${a.id}`, { method: 'DELETE' });
      setAutomations((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
      setToast('Agent slettet');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sletting feilet');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                color: tokens.color.navy,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Zap size={26} strokeWidth={2.5} style={{ color: tokens.color.gold }} />
              Agenter
            </h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {automations
                ? `${automations.length} ${automations.length === 1 ? 'agent' : 'agenter'}`
                : 'Henter…'}{' '}
              · Automatiser repetitive oppgaver
            </p>
          </div>
          <button
            onClick={() => setShowGallery(!showGallery)}
            style={primaryBtn}
          >
            <Plus
              size={16}
              strokeWidth={2.5}
              style={{ marginRight: 6, verticalAlign: 'middle' }}
            />
            Ny agent fra mal
          </button>
        </div>

        {error && (
          <div style={errorStyle}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{
                float: 'right',
                background: 'transparent',
                border: 'none',
                color: '#7F1D1D',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {toast && <div style={toastStyle}>{toast}</div>}

        {showGallery && (
          <section style={gallerySectionStyle}>
            <h2 style={{ fontSize: 18, color: tokens.color.navy, marginBottom: 12 }}>
              Velg en mal
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => createFromTemplate(tpl)}
                  disabled={busy === 'create:' + tpl.id}
                  style={templateCardStyle}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{tpl.icon}</div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: tokens.color.navy,
                      marginBottom: 6,
                    }}
                  >
                    {tpl.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: tokens.color.textMuted,
                      lineHeight: 1.4,
                    }}
                  >
                    {tpl.description}
                  </div>
                  {busy === 'create:' + tpl.id && (
                    <div style={{ marginTop: 8, fontSize: 11, color: tokens.color.navy }}>
                      Oppretter…
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {!automations ? (
          <div style={{ color: tokens.color.textMuted, padding: 40, textAlign: 'center' }}>
            Henter agenter…
          </div>
        ) : automations.length === 0 ? (
          <div style={emptyStyle}>
            <Zap
              size={48}
              strokeWidth={1.5}
              style={{ color: tokens.color.gold, marginBottom: 12 }}
            />
            <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>Ingen agenter enda</h2>
            <p style={{ color: tokens.color.textMuted, marginBottom: 20, maxWidth: 420, margin: '0 auto 20px' }}>
              Agenter gjør boring repetitivt arbeid for deg — som å opprette
              faktura-påminnelser når en sak er ferdig, eller varsle om
              nærmende frister.
            </p>
            <button onClick={() => setShowGallery(true)} style={primaryBtn}>
              + Bla i maler
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {automations.map((a) => (
              <div
                key={a.id}
                style={{
                  ...cardStyle,
                  opacity: a.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        ...badgeStyle,
                        background: a.enabled ? '#D1FAE5' : '#F3F4F6',
                        color: a.enabled ? '#065F46' : '#6B7280',
                      }}
                    >
                      {a.enabled ? 'Aktiv' : 'Pauset'}
                    </div>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: tokens.color.navy,
                      }}
                    >
                      {a.name}
                    </h3>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: tokens.color.textMuted,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>{TRIGGER_LABELS[a.trigger]}</strong> →{' '}
                    {ACTION_LABELS[a.action]}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: tokens.color.textSubtle,
                      marginTop: 6,
                      display: 'flex',
                      gap: 12,
                    }}
                  >
                    <span>
                      <CheckCircle2 size={11} style={{ verticalAlign: 'middle' }} />{' '}
                      {a.runCount} kjøringer
                    </span>
                    {a.lastRunAt && (
                      <span>
                        <Clock size={11} style={{ verticalAlign: 'middle' }} /> Sist:{' '}
                        {new Date(a.lastRunAt).toLocaleString('nb-NO', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => testRun(a)}
                    disabled={busy === 'test:' + a.id || !a.enabled}
                    style={iconBtnStyle}
                    title="Test-kjør"
                  >
                    <Play size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => toggle(a)}
                    disabled={busy === 'toggle:' + a.id}
                    style={{
                      ...iconBtnStyle,
                      color: a.enabled ? '#10B981' : '#6B7280',
                    }}
                    title={a.enabled ? 'Pause' : 'Aktiver'}
                  >
                    <Power size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => remove(a)}
                    disabled={busy === 'del:' + a.id}
                    style={{ ...iconBtnStyle, color: '#EF4444' }}
                    title="Slett"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const primaryBtn: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const gallerySectionStyle: React.CSSProperties = {
  background: tokens.color.bgAlt,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 20,
  marginBottom: 24,
};

const templateCardStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 16,
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  cursor: 'pointer',
  transition: 'transform 0.1s, border-color 0.1s',
  fontFamily: 'inherit',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: 16,
  background: tokens.color.white,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: tokens.radius.sm,
  background: tokens.color.bgAlt,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: tokens.color.text,
};

const errorStyle: React.CSSProperties = {
  padding: 16,
  background: '#FEE2E2',
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
};

const toastStyle: React.CSSProperties = {
  padding: 12,
  background: '#D1FAE5',
  color: '#065F46',
  borderRadius: tokens.radius.sm,
  marginBottom: 16,
  fontWeight: 500,
};

const emptyStyle: React.CSSProperties = {
  padding: 48,
  textAlign: 'center',
  background: tokens.color.white,
  borderRadius: tokens.radius.lg,
  border: `1px dashed ${tokens.color.border}`,
};
