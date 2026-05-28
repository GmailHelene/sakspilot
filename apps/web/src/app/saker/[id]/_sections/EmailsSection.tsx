'use client';

/**
 * E-poster knyttet til en sak — synket fra Outlook via Microsoft Graph.
 * Vises kun hvis det finnes e-poster. Bruker har retning-indikator
 * (innkommende ↘ blå / utgående ↗ lilla).
 */

import { useEffect, useState } from 'react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';
import { SectionCard } from './_shared';

interface EmailLink {
  id: string;
  fromAddress: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: string;
  isOutgoing: boolean;
}

export default function EmailsSection({ sakId }: { sakId: string }) {
  const [emails, setEmails] = useState<EmailLink[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api<{ emails: EmailLink[] }>(`/emails/sak/${sakId}`)
      .then((r) => setEmails(r.emails))
      .catch(() => setEmails([]));
  }, [sakId]);

  if (!emails || emails.length === 0) return null;

  const visible = expanded ? emails : emails.slice(0, 3);

  return (
    <SectionCard title={`E-poster (${emails.length})`}>
      <div style={{ display: 'grid', gap: 8 }}>
        {visible.map((e) => (
          <div
            key={e.id}
            style={{
              padding: 12,
              background: tokens.color.bgAlt,
              borderRadius: tokens.radius.md,
              borderLeft: `3px solid ${e.isOutgoing ? '#A358DF' : '#0086CC'}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: tokens.color.navy }}>
                {e.isOutgoing ? '↗ ' : '↘ '}
                {e.fromAddress}
              </span>
              <span style={{ fontSize: 11, color: tokens.color.textSubtle }}>
                {new Date(e.receivedAt).toLocaleString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {e.subject || '(intet emne)'}
            </div>
            {e.bodyPreview && (
              <div style={{ fontSize: 12, color: tokens.color.textMuted, lineHeight: 1.4 }}>
                {e.bodyPreview.slice(0, 200)}
                {e.bodyPreview.length > 200 ? '…' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
      {emails.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: tokens.color.navy,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {expanded ? '↑ Vis færre' : `↓ Vis alle (${emails.length})`}
        </button>
      )}
    </SectionCard>
  );
}
