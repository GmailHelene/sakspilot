'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Client {
  id: string;
  name: string;
  orgNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultHourlyRate: number | null;
  _count: { saker: number };
}

export default function KlienterPage() {
  const [clients, setClients] = useState<Client[] | null>(null);

  useEffect(() => {
    api<{ clients: Client[] }>('/klienter').then((res) => setClients(res.clients));
  }, []);

  return (
    <AppLayout>
      <div>
        <div
          style={{
            padding: '24px 24px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: 1100,
            margin: '0 auto',
          }}
        >
          <div>
            <h1 style={{ fontSize: 26, color: tokens.color.navy }}>Klienter</h1>
            <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
              {clients ? `${clients.length} ${clients.length === 1 ? 'klient' : 'klienter'}` : 'Henter…'}
            </p>
          </div>
          <Link
            href="/klienter/ny"
            style={{
              background: tokens.color.navy,
              color: tokens.color.white,
              padding: '10px 18px',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            + Ny klient
          </Link>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 24px 24px' }}>
          {clients === null ? (
            <div style={{ color: tokens.color.textMuted, padding: 24 }}>Henter klienter…</div>
          ) : clients.length === 0 ? (
            <div
              style={{
                padding: 48,
                background: tokens.color.white,
                borderRadius: tokens.radius.lg,
                border: `1px dashed ${tokens.color.border}`,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>Ingen klienter enda</h2>
              <p style={{ color: tokens.color.textMuted, marginBottom: 20 }}>
                Legg til din første klient så du kan opprette saker.
              </p>
              <Link
                href="/klienter/ny"
                style={{
                  display: 'inline-block',
                  background: tokens.color.navy,
                  color: tokens.color.white,
                  padding: '10px 18px',
                  borderRadius: tokens.radius.md,
                  fontWeight: 600,
                }}
              >
                Legg til klient →
              </Link>
            </div>
          ) : (
            <div
              style={{
                background: tokens.color.white,
                borderRadius: tokens.radius.lg,
                border: `1px solid ${tokens.color.border}`,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: tokens.color.bgAlt }}>
                    <th style={thStyle}>Navn</th>
                    <th style={thStyle}>Kontakt</th>
                    <th style={thStyle}>Org.nr</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Sats</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saker</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        borderTop: i > 0 ? `1px solid ${tokens.color.border}` : undefined,
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 13 }}>{c.contactEmail || '—'}</div>
                        {c.contactPhone && (
                          <div style={{ fontSize: 12, color: tokens.color.textSubtle }}>
                            {c.contactPhone}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>{c.orgNumber || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {c.defaultHourlyRate
                          ? `${c.defaultHourlyRate.toLocaleString('nb-NO')} kr/t`
                          : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c._count.saker}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 700,
  color: tokens.color.text,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  color: tokens.color.text,
};
