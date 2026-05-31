'use client';

/**
 * Hovedheader-kortet på sak-detalj-siden — viser tittel, klient, frist, hourly
 * rate, mappe-sti, statusdropdown, ShareButton og slett-knapp.
 */

import { tokens } from '@/lib/tokens';
import ShareButton from './ShareButton';
import type { Sak, SakStatus } from './_shared';

export const STATUS_OPTIONS: { value: SakStatus; label: string; color: string }[] = [
  { value: 'ikke_pabegynt', label: 'Ikke påbegynt', color: '#94A3B8' },
  { value: 'pagaaende', label: 'Pågår', color: '#2D6A4F' },
  { value: 'venter_kunde', label: 'Venter på kunde', color: '#E9C46A' },
  { value: 'venter_3part', label: 'Venter på 3.part', color: '#D4A017' },
  { value: 'ferdig', label: 'Ferdig', color: '#1E3A5F' },
  { value: 'arkivert', label: 'Arkivert', color: '#CBD5E1' },
];

export default function SakHeaderCard({
  sak,
  onStatusChange,
  onDelete,
}: {
  sak: Sak;
  onStatusChange: (s: SakStatus) => void;
  onDelete: () => void;
}) {
  const statusOpt = STATUS_OPTIONS.find((s) => s.value === sak.status)!;

  return (
    <div
      style={{
        background: tokens.color.white,
        padding: 24,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.color.border}`,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, marginBottom: 8 }}>
            {sak.title}
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 16,
              fontSize: 14,
              color: tokens.color.textMuted,
              flexWrap: 'wrap',
            }}
          >
            {sak.client && <span>👤 {sak.client.name}</span>}
            {sak.saksnummer && <span># {sak.saksnummer}</span>}
            {sak.hourlyRate && (
              <span>💰 {sak.hourlyRate.toLocaleString('nb-NO')} kr/t</span>
            )}
            {sak.deadline && (
              <span>
                📅 frist {new Date(sak.deadline).toLocaleDateString('nb-NO')}
              </span>
            )}
          </div>
          {sak.folderPath && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: tokens.color.textSubtle,
                fontFamily: tokens.font.mono,
              }}
            >
              📁 {sak.folderPath}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <select
            value={sak.status}
            onChange={(e) => onStatusChange(e.target.value as SakStatus)}
            style={{
              padding: '8px 12px',
              borderRadius: tokens.radius.sm,
              border: `2px solid ${statusOpt.color}`,
              background: tokens.color.white,
              fontWeight: 600,
              fontSize: 13,
              color: statusOpt.color,
              cursor: 'pointer',
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ShareButton sakId={sak.id} />
            <button
              onClick={onDelete}
              style={{
                fontSize: 12,
                color: tokens.color.red,
                padding: '4px 8px',
              }}
            >
              Slett sak
            </button>
          </div>
        </div>
      </div>

      {sak.description && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${tokens.color.border}`,
            whiteSpace: 'pre-wrap',
            color: tokens.color.text,
            fontSize: 14,
          }}
        >
          {sak.description}
        </div>
      )}
    </div>
  );
}
