'use client';

/**
 * Delte UI-komponenter, typer og stiler for sak-detalj-sectionene.
 * Holdt sammen så styling og oppførsel er konsistent.
 */

import { tokens } from '@/lib/tokens';

// ── Typer (delt mellom page.tsx og sectionene) ───────────────────

export type SakStatus =
  | 'ikke_pabegynt'
  | 'pagaaende'
  | 'venter_kunde'
  | 'venter_3part'
  | 'ferdig'
  | 'arkivert';

export type MatchingRuleType = 'title' | 'path' | 'app' | 'email';

export interface MatchingRule {
  id: string;
  type: MatchingRuleType;
  pattern: string;
  priority: number;
  enabled: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
  notifyDaysBefore: number;
}

export interface Sak {
  id: string;
  title: string;
  status: SakStatus;
  saksnummer: string | null;
  description: string | null;
  deadline: string | null;
  hourlyRate: number | null;
  folderPath: string | null;
  createdAt: string;
  closedAt: string | null;
  client: { id: string; name: string } | null;
  matchingRules: MatchingRule[];
  milestones: Milestone[];
  _count: { timeEntries: number; emailLinks: number };
}

export interface TimeSummary {
  entryCount: number;
  totalHours: number;
  billableHours: number;
  totalAmount: number;
  lastEntryAt: string | null;
}

// ── UI-komponenter ───────────────────────────────────────────────

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

// ── Felles stiler ────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: tokens.radius.sm,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 14,
  background: tokens.color.white,
};

export const inlineCodeStyle: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  background: tokens.color.white,
  padding: '2px 6px',
  borderRadius: 4,
  border: `1px solid ${tokens.color.border}`,
  fontSize: 12,
  color: tokens.color.text,
};
