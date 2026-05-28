'use client';

/**
 * Delte UI-komponenter for sak-detalj-sectionene.
 * Holdt sammen så styling og oppførsel er konsistent.
 */

import { tokens } from '@/lib/tokens';

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.color.border}`,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${tokens.color.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ fontSize: 16, color: tokens.color.navy }}>{title}</h2>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: tokens.color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tokens.color.navy }}>
        {value}
      </div>
    </div>
  );
}
