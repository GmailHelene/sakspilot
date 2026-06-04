'use client';

/**
 * /admin/inbox - Helene's Domeneshop-innboks (kontakt@helene.cloud).
 *
 * Read-only. Bare for pilot-admin (gated bak email-whitelist i backend).
 * For aa svare, klikk avsender-adressen for mailto eller aapne Domeneshop
 * webmail i en ny fane.
 */
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { tokens } from '@/lib/tokens';
import { Mail, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

interface ImapMessage {
  uid: number;
  from: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
}

interface InboxResponse {
  user: string;
  total: number;
  count: number;
  messages: ImapMessage[];
}

interface ConfigErrorResponse {
  error: string;
  configHelp?: Record<string, string>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'nettopp';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min siden`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} t siden`;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

export default function InboxPage() {
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configHelp, setConfigHelp] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    setConfigHelp(null);
    try {
      const data = await api<InboxResponse>('/admin/imap-inbox?limit=30');
      setInbox(data);
    } catch (err: unknown) {
      const e = err as { message?: string; details?: unknown };
      setError(e.message || 'Henting feilet');
      // Sjekk om server returnerte config-hjelp
      try {
        const txt = e.message || '';
        if (txt.includes('IMAP_HOST')) {
          // Vi har ikke direkte tilgang til JSON-body her uten egen fetch
          // Kalle endepunktet pa nytt for aa hente full feilmelding
          const r = await fetch('/api/admin/imap-inbox?limit=30', { credentials: 'include' });
          const j: ConfigErrorResponse = await r.json().catch(() => ({ error: 'parse-feil' }));
          if (j.configHelp) setConfigHelp(j.configHelp);
        }
      } catch { /* ignorer */ }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mail size={22} />
              Innboks
            </h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, margin: '4px 0 0' }}>
              {inbox ? `${inbox.user} - ${inbox.count} av ${inbox.total} totalt` : 'Henter fra Domeneshop IMAP...'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href="https://www.domeneshop.no/webmail/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${tokens.color.border}`,
                background: 'white', color: tokens.color.navy, fontSize: 13, fontWeight: 600,
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <ExternalLink size={13} /> Webmail
            </a>
            <button
              onClick={load}
              disabled={loading}
              style={{
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${tokens.color.border}`,
                background: 'white', color: tokens.color.navy, fontSize: 13, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={13} />
              Oppdater
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#FEF3C7', color: '#92400E', padding: 16, borderRadius: 8,
            marginBottom: 16, fontSize: 13, lineHeight: 1.5,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <strong>Kunne ikke hente inbox:</strong> {error}
              {configHelp && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Sett disse env-vars i Render:</div>
                  <pre style={{
                    background: 'white', padding: 12, borderRadius: 6, fontSize: 12,
                    overflow: 'auto', margin: 0, fontFamily: 'monospace',
                  }}>
                    {Object.entries(configHelp).map(([k, v]) => `${k}=${v}`).join('\n')}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && !inbox && (
          <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted }}>Henter inbox...</div>
        )}

        {inbox && inbox.messages.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: tokens.color.textMuted, background: 'white', border: `1px solid ${tokens.color.border}`, borderRadius: 8 }}>
            Innboksen er tom.
          </div>
        )}

        {inbox && inbox.messages.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${tokens.color.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {inbox.messages.map((m) => {
              const fromMatch = m.from.match(/<(.+?)>/);
              const replyTo = fromMatch ? fromMatch[1] : m.from;
              const replyUrl = `mailto:${encodeURIComponent(replyTo)}?subject=${encodeURIComponent('Re: ' + m.subject)}`;
              return (
                <div
                  key={m.uid}
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${tokens.color.bg}`,
                    background: m.unread ? '#F8FAFC' : 'white',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', gap: 8,
                      fontSize: 13, marginBottom: 4,
                    }}>
                      <span style={{
                        fontWeight: m.unread ? 700 : 500,
                        color: m.unread ? tokens.color.navy : tokens.color.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.from}
                      </span>
                      <span style={{ color: tokens.color.textMuted, fontSize: 12, flexShrink: 0 }}>
                        {formatDate(m.date)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: m.unread ? 600 : 500,
                      color: tokens.color.navy, marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {m.subject}
                    </div>
                    {m.preview && (
                      <div style={{ fontSize: 12, color: tokens.color.textMuted, lineHeight: 1.4 }}>
                        {m.preview}
                      </div>
                    )}
                  </div>
                  <a
                    href={replyUrl}
                    style={{
                      padding: '6px 12px', fontSize: 12, fontWeight: 600,
                      color: tokens.color.navy, textDecoration: 'none',
                      border: `1px solid ${tokens.color.border}`, borderRadius: 6,
                      whiteSpace: 'nowrap', alignSelf: 'flex-start',
                    }}
                    title={`Svar til ${replyTo}`}
                  >
                    Svar
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 11, color: tokens.color.textSubtle, marginTop: 16, lineHeight: 1.5 }}>
          Read-only. Inbox hentes via IMAP fra Domeneshop ved hvert oppdater-klikk. For aa svare:
          klikk &quot;Svar&quot;-knappen (apner standard e-postklient med mailto) eller &quot;Webmail&quot; for full
          tilgang. Sending fra Sakspilot kommer som egen funksjon senere.
        </p>
      </div>
    </AppLayout>
  );
}
