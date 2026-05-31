'use client';

/**
 * Generer / revoker offentlig delt lenke til en sak. Klienten ser
 * status, milepæler og fremdrift uten innlogging. Konfigurerbar utløp +
 * valgfri visning av tidssammendrag.
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { events } from '@/lib/analytics';

interface ShareLink {
  id: string;
  token: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  showTimeEntries: boolean;
  createdAt: string;
}

export default function ShareButton({ sakId }: { sakId: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30);

  async function loadLink() {
    try {
      const r = await api<{ link: ShareLink | null }>(`/saker/${sakId}/share`);
      setLink(r.link);
    } catch {
      // ignorer
    }
  }

  useEffect(() => {
    if (open) loadLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate() {
    setLoading(true);
    try {
      const r = await api<{ link: ShareLink }>(`/saker/${sakId}/share`, {
        method: 'POST',
        body: { expiresInDays, showTimeEntries: showTime },
      });
      events.sharedLinkCreated();
      setLink(r.link);
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    if (!confirm('Revokere lenken? Klienten vil ikke lenger kunne åpne den.')) return;
    setLoading(true);
    try {
      await api(`/saker/${sakId}/share`, { method: 'DELETE' });
      setLink(null);
    } finally {
      setLoading(false);
    }
  }

  const publicUrl =
    link && typeof window !== 'undefined'
      ? `${window.location.origin}/delt/${link.token}`
      : '';

  async function copy() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: marker tekstboksen
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '6px 12px',
          background: tokens.color.bgAlt,
          color: tokens.color.navy,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.sm,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        🔗 Del med klient
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: tokens.color.white,
              borderRadius: tokens.radius.lg,
              maxWidth: 520,
              width: '100%',
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ fontSize: 20, color: tokens.color.navy, marginBottom: 6 }}>
              Del saken med klienten
            </h2>
            <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 20 }}>
              Klienten kan se status, milepæler og fremdrift uten å logge inn.
              Sensitive data (notater, tider, matching-regler) deles ikke.
            </p>

            {link ? (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Lenke (klikk for å kopiere)
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    readOnly
                    value={publicUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: `1px solid ${tokens.color.border}`,
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      fontFamily: tokens.font.mono,
                      background: tokens.color.bgAlt,
                    }}
                  />
                  <button
                    onClick={copy}
                    style={{
                      padding: '10px 16px',
                      background: copied ? '#10B981' : tokens.color.navy,
                      color: tokens.color.white,
                      border: 'none',
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      minWidth: 80,
                    }}
                  >
                    {copied ? '✓ Kopiert' : 'Kopier'}
                  </button>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: tokens.color.textMuted,
                    background: tokens.color.bgAlt,
                    padding: 12,
                    borderRadius: tokens.radius.sm,
                    marginBottom: 16,
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    <strong>{link.viewCount}</strong> visning{link.viewCount === 1 ? '' : 'er'}
                    {link.lastViewedAt && ` · sist ${new Date(link.lastViewedAt).toLocaleString('nb-NO')}`}
                  </div>
                  <div>
                    {link.expiresAt
                      ? `Utløper ${new Date(link.expiresAt).toLocaleDateString('nb-NO')}`
                      : 'Utløper aldri'}
                  </div>
                  <div>
                    {link.showTimeEntries ? '✓ Inkluderer tidssammendrag' : 'Skjuler tidssammendrag'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    onClick={revoke}
                    disabled={loading}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      color: tokens.color.red,
                      border: `1px solid ${tokens.color.red}`,
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Revoker lenken
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      padding: '10px 20px',
                      background: tokens.color.navy,
                      color: tokens.color.white,
                      border: 'none',
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Ferdig
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    Gyldighet
                  </label>
                  <select
                    value={expiresInDays ?? 'never'}
                    onChange={(e) =>
                      setExpiresInDays(e.target.value === 'never' ? null : parseInt(e.target.value, 10))
                    }
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${tokens.color.border}`,
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      background: tokens.color.white,
                    }}
                  >
                    <option value="7">7 dager</option>
                    <option value="30">30 dager</option>
                    <option value="90">90 dager</option>
                    <option value="365">1 år</option>
                    <option value="never">Aldri utløper</option>
                  </select>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: 12,
                    background: tokens.color.bgAlt,
                    borderRadius: tokens.radius.sm,
                    marginBottom: 20,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showTime}
                    onChange={(e) => setShowTime(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Vis tidssammendrag</div>
                    <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>
                      Klienten ser totalt antall timer (ikke detaljer eller beløp)
                    </div>
                  </div>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      color: tokens.color.text,
                      border: `1px solid ${tokens.color.border}`,
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={generate}
                    disabled={loading}
                    style={{
                      padding: '10px 20px',
                      background: tokens.color.navy,
                      color: tokens.color.white,
                      border: 'none',
                      borderRadius: tokens.radius.sm,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {loading ? 'Genererer…' : 'Generer lenke'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
