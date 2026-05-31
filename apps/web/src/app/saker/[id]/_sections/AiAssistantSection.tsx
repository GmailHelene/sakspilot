'use client';

/**
 * Claude AI-assistent for en sak: oppsummering, e-postutkast og fri prompt.
 * Chat-historikk lagres per sak slik at AI husker konteksten innenfor samme
 * sak (men ikke på tvers av saker). "Ny samtale" sletter historikken.
 * Kaller backend som proxy mot Anthropic.
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { events } from '@/lib/analytics';
import { SectionCard } from './_shared';

type EmailType =
  | 'status-oppdatering'
  | 'frist-utsettelse'
  | 'faktura'
  | 'tilbakemelding'
  | 'egendefinert';

const EMAIL_TYPES: { value: EmailType; label: string; icon: string }[] = [
  { value: 'status-oppdatering', label: 'Statusoppdatering', icon: '📨' },
  { value: 'frist-utsettelse', label: 'Be om utsettelse', icon: '⏰' },
  { value: 'faktura', label: 'Faktura-påminnelse', icon: '💰' },
  { value: 'tilbakemelding', label: 'Be om tilbakemelding', icon: '💬' },
];

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** True mens vi venter på svar fra serveren (kun for siste user-melding). */
  pending?: boolean;
};

export default function AiAssistantSection({ sakId }: { sakId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);

  // Hele chat-tråden for denne saken (per bruker, hentet fra backend).
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [emailDraft, setEmailDraft] = useState<{
    subject: string;
    body: string;
    recipient: string | null;
    type: EmailType;
  } | null>(null);
  const [emailLoading, setEmailLoading] = useState<EmailType | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Hent historikk ved mount / når sakId endres.
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    api<{ messages: ChatMessage[] }>(`/ai/sak/${sakId}/history`)
      .then((r) => {
        if (!cancelled) setChat(r.messages);
      })
      .catch(() => {
        // Stille feile — historikk er ikke kritisk for å bruke assistenten.
        if (!cancelled) setChat([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sakId]);

  async function generateSummary() {
    setSummaryLoading(true);
    setError(null);
    try {
      const r = await api<{ summary: string }>(`/ai/sak/${sakId}/summary`, { method: 'POST' });
      events.aiSummary();
      setSummary(r.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-tjenesten svarte ikke');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setAskLoading(true);
    setError(null);

    // Optimistisk: vis bruker-melding + en placeholder assistant-melding med spinner.
    const now = new Date().toISOString();
    const tempUserId = `tmp-u-${Date.now()}`;
    const tempAssistantId = `tmp-a-${Date.now()}`;
    setChat((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: q, createdAt: now },
      { id: tempAssistantId, role: 'assistant', content: '', createdAt: now, pending: true },
    ]);
    setQuestion('');

    try {
      const r = await api<{ answer: string }>(`/ai/sak/${sakId}/ask`, {
        method: 'POST',
        body: { question: q },
      });
      // Erstatt placeholder med ekte svar.
      setChat((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? { ...m, content: r.answer, pending: false, createdAt: new Date().toISOString() }
            : m
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-tjenesten svarte ikke');
      // Fjern placeholder-meldingen, behold bruker-meldingen så hen kan prøve igjen.
      setChat((prev) => prev.filter((m) => m.id !== tempAssistantId));
    } finally {
      setAskLoading(false);
    }
  }

  async function startNewConversation() {
    if (chat.length === 0) return;
    if (!confirm('Slette hele samtalen og starte en ny? Dette kan ikke angres.')) return;
    try {
      await api(`/ai/sak/${sakId}/history`, { method: 'DELETE' });
      setChat([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke slette samtalen');
    }
  }

  async function draftEmail(type: EmailType) {
    setEmailLoading(type);
    setError(null);
    try {
      const r = await api<{ subject: string; body: string; recipient: string | null }>(
        `/ai/sak/${sakId}/draft-email`,
        { method: 'POST', body: { type } }
      );
      events.aiEmail(type);
      setEmailDraft({ ...r, type });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-tjenesten svarte ikke');
    } finally {
      setEmailLoading(null);
    }
  }

  function openMailto() {
    if (!emailDraft) return;
    const params = new URLSearchParams();
    if (emailDraft.subject) params.set('subject', emailDraft.subject);
    if (emailDraft.body) params.set('body', emailDraft.body);
    const url = `mailto:${emailDraft.recipient ?? ''}?${params.toString()}`;
    window.location.href = url;
  }

  async function copyEmail() {
    if (!emailDraft) return;
    const text = emailDraft.subject
      ? `Emne: ${emailDraft.subject}\n\n${emailDraft.body}`
      : emailDraft.body;
    try {
      await navigator.clipboard.writeText(text);
      alert('E-postutkast kopiert til utklippstavlen');
    } catch {
      // ignorer
    }
  }

  function formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });
    } catch {
      return '';
    }
  }

  return (
    <SectionCard title="✨ AI-assistent">
      {error && (
        <div
          style={{
            padding: 12,
            background: '#FEE2E2',
            color: '#7F1D1D',
            borderRadius: tokens.radius.sm,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Hurtighandlinger ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          onClick={generateSummary}
          disabled={summaryLoading}
          style={aiBtnStyle}
        >
          {summaryLoading ? '⏳ Tenker…' : '📝 Oppsummer saken'}
        </button>
        {EMAIL_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => draftEmail(t.value)}
            disabled={emailLoading === t.value}
            style={aiBtnStyle}
          >
            {emailLoading === t.value ? '⏳' : t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Oppsummering ── */}
      {summary && (
        <div
          style={{
            background: tokens.color.bgAlt,
            padding: 14,
            borderRadius: tokens.radius.sm,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
          }}
        >
          {summary}
        </div>
      )}

      {/* ── Epost-utkast ── */}
      {emailDraft && (
        <div
          style={{
            background: tokens.color.white,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.md,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: tokens.color.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            ✉️ E-postutkast
          </div>
          {emailDraft.recipient && (
            <div style={{ fontSize: 12, color: tokens.color.textMuted, marginBottom: 4 }}>
              <strong>Til:</strong> {emailDraft.recipient}
            </div>
          )}
          {emailDraft.subject && (
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: tokens.color.navy }}>
              {emailDraft.subject}
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              padding: 12,
              background: tokens.color.bgAlt,
              borderRadius: tokens.radius.sm,
              marginBottom: 12,
            }}
          >
            {emailDraft.body}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={openMailto} style={aiPrimaryBtnStyle}>
              📧 Åpne i e-postklient
            </button>
            <button onClick={copyEmail} style={aiSecondaryBtnStyle}>
              📋 Kopier
            </button>
            <button onClick={() => setEmailDraft(null)} style={aiSecondaryBtnStyle}>
              Lukk
            </button>
          </div>
        </div>
      )}

      {/* ── Chat-tråd ── */}
      <details style={{ marginTop: 8 }} open={chat.length > 0}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: tokens.color.navy,
            padding: '8px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>💬 Still et eget spørsmål{chat.length > 0 ? ` (${chat.length})` : ''}</span>
          {chat.length > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void startNewConversation();
              }}
              style={{
                ...aiSecondaryBtnStyle,
                padding: '4px 10px',
                fontSize: 12,
              }}
              title="Slett samtalen og start på nytt"
            >
              🗑️ Ny samtale
            </button>
          )}
        </summary>

        <div style={{ marginTop: 8 }}>
          {historyLoading && (
            <div style={{ fontSize: 13, color: tokens.color.textMuted, padding: '8px 0' }}>
              Laster historikk…
            </div>
          )}

          {!historyLoading && chat.length === 0 && (
            <div style={{ fontSize: 13, color: tokens.color.textMuted, padding: '8px 0' }}>
              Ingen meldinger ennå — still et spørsmål under for å starte en samtale.
              AI-en husker konteksten innenfor denne saken.
            </div>
          )}

          {chat.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 12,
                maxHeight: 480,
                overflowY: 'auto',
                padding: 4,
              }}
            >
              {chat.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: tokens.radius.md,
                      background: m.role === 'user' ? '#DBEAFE' : tokens.color.bgAlt,
                      color: tokens.color.text,
                      fontSize: 14,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.pending ? (
                      <span style={{ color: tokens.color.textMuted }}>⏳ Tenker…</span>
                    ) : (
                      m.content
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: tokens.color.textMuted,
                      marginTop: 2,
                      padding: '0 4px',
                    }}
                  >
                    {m.role === 'user' ? 'Du' : 'AI'} · {formatTimestamp(m.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="F.eks. «Hva burde jeg fokusere på neste uke?» eller «Hvor mye igjen til jeg er ferdig?»"
            rows={3}
            style={{
              width: '100%',
              padding: 10,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.sm,
              fontFamily: 'inherit',
              fontSize: 14,
              resize: 'vertical',
            }}
          />
          <button
            onClick={ask}
            disabled={askLoading || !question.trim()}
            style={{ ...aiPrimaryBtnStyle, marginTop: 8 }}
          >
            {askLoading ? '⏳ Tenker…' : 'Spør'}
          </button>
        </div>
      </details>
    </SectionCard>
  );
}

const aiBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: tokens.color.bgAlt,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  color: tokens.color.text,
  cursor: 'pointer',
  fontWeight: 500,
};

const aiPrimaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: tokens.color.navy,
  color: tokens.color.white,
  border: 'none',
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const aiSecondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: tokens.color.text,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 13,
  cursor: 'pointer',
};
