'use client';

/**
 * GoalProgressWidget, viser fremdrift mot uke- og månedsmål på /hjem.
 *
 * Henter /me/goals/progress ved mount og hvert 60. sekund. Farger baseres
 * på logged-timer vs pro-rata-mål (lineær progresjon gjennom perioden):
 *   • logged < prorataTarget * 0.7   → grå "Du henger litt etter"
 *   • logged 0.7-1.0x prorataTarget  → grønn "Bra rute"
 *   • logged > prorataTarget         → blå "Over mål"
 *
 * Hvis brukeren ikke har satt mål: liten CTA til /innstillinger/tidsmal.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, ArrowRight } from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { api } from '@/lib/api';

interface Period {
  goal: number | null;
  logged: number;
  percentage: number | null;
  prorataTarget: number | null;
  daysIn: number;
  daysTotal: number;
}

interface Progress {
  week: Period;
  month: Period;
  goalType: 'billable' | 'total';
}

const REFRESH_INTERVAL_MS = 60_000;

export default function GoalProgressWidget() {
  const [data, setData] = useState<Progress | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api<Progress>('/me/goals/progress');
        if (!cancelled) {
          setData(res);
          setLoaded(true);
        }
      } catch {
        // Stille feil, widgeten skjuler seg da. Ikke spam dashboard
        // med feilmeldinger hvis API midlertidig ute.
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!loaded) {
    return (
      <div style={widgetStyle}>
        <Header />
        <div style={{ padding: 16, fontSize: 13, color: tokens.color.textMuted, textAlign: 'center' }}>
          Henter…
        </div>
      </div>
    );
  }

  // Ingen mål satt, vis CTA
  const hasWeekGoal = data?.week.goal != null && data.week.goal > 0;
  const hasMonthGoal = data?.month.goal != null && data.month.goal > 0;

  if (!data || (!hasWeekGoal && !hasMonthGoal)) {
    return (
      <div style={widgetStyle}>
        <Header />
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 12, lineHeight: 1.45 }}>
            Sett ukentlig eller månedlig timesmål for å se hvor du ligger an i forhold til planen.
          </p>
          <Link
            href="/innstillinger/tidsmal"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: tokens.color.navy,
              color: 'white',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Target size={14} strokeWidth={2.5} />
            Sett tidsmål
            <ArrowRight size={13} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={widgetStyle}>
      <Header
        action={
          <Link
            href="/innstillinger/tidsmal"
            style={{
              fontSize: 12,
              color: tokens.color.navy,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Endre →
          </Link>
        }
      />
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        {hasWeekGoal && (
          <ProgressBar
            label="Denne uka"
            period={data.week}
            subText={`Dag ${data.week.daysIn} av ${data.week.daysTotal}`}
          />
        )}
        {hasMonthGoal && (
          <ProgressBar
            label="Denne måneden"
            period={data.month}
            subText={`Dag ${data.month.daysIn} av ${data.month.daysTotal}`}
          />
        )}
        <div style={{ fontSize: 11, color: tokens.color.textSubtle }}>
          Teller {data.goalType === 'billable' ? 'kun fakturerbare' : 'alle loggede'} timer.
        </div>
      </div>
    </div>
  );
}

function Header({ action }: { action?: React.ReactNode } = {}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${tokens.color.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.color.navy }}>
        <Target size={18} strokeWidth={2} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Tidsmål</span>
      </div>
      {action}
    </div>
  );
}

function ProgressBar({ label, period, subText }: { label: string; period: Period; subText: string }) {
  const goal = period.goal ?? 0;
  const prorata = period.prorataTarget ?? 0;
  const logged = period.logged;

  // Status-fargekoding basert på pro-rata.
  // Edge case: prorata = 0 (helt i starten av perioden). Da regnes alt som "i rute".
  let statusColor: string;
  let statusText: string;
  if (prorata > 0 && logged < prorata * 0.7) {
    statusColor = tokens.color.textMuted;
    statusText = 'Du henger litt etter';
  } else if (prorata === 0 || logged <= prorata) {
    statusColor = tokens.color.green;
    statusText = 'Bra rute';
  } else {
    statusColor = tokens.color.blue;
    statusText = 'Over mål';
  }

  // Bar-bredde basert på percentage, cappet til 100% visuelt.
  // Selv om brukeren ligger på 130% viser baren full, men status-teksten sier "Over mål".
  const percentage = period.percentage ?? 0;
  const widthPct = Math.min(100, Math.max(0, percentage));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: tokens.color.text }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tokens.color.navy,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {logged} / {goal} t
        </span>
      </div>
      <div
        style={{
          height: 10,
          background: tokens.color.bgAlt,
          borderRadius: 999,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${widthPct}%`,
            background: statusColor,
            borderRadius: 999,
            transition: 'width 0.3s ease',
          }}
        />
        {/* Pro-rata-markør - liten vertikal strek der brukeren BURDE være nå */}
        {goal > 0 && prorata > 0 && prorata < goal && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              bottom: -2,
              left: `${Math.min(100, (prorata / goal) * 100)}%`,
              width: 2,
              background: tokens.color.textSubtle,
              opacity: 0.5,
            }}
            title={`Pro-rata-mål: ${prorata} t`}
          />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 11, color: tokens.color.textSubtle }}>{subText}</span>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{statusText}</span>
      </div>
    </div>
  );
}

const widgetStyle: React.CSSProperties = {
  background: tokens.color.white,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  overflow: 'hidden',
};
