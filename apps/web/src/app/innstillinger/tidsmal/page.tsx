'use client';

import { useEffect, useState } from 'react';
import { Target, Save, Info } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

interface Goals {
  weeklyHoursGoal: number | null;
  monthlyHoursGoal: number | null;
  goalType: 'billable' | 'total';
}

export default function TidsmalPage() {
  const [weekly, setWeekly] = useState<string>('');
  const [monthly, setMonthly] = useState<string>('');
  const [goalType, setGoalType] = useState<'billable' | 'total'>('billable');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Last inn nåværende mål via progress-endepunktet (returnerer goal + goalType)
    (async () => {
      try {
        const data = await api<{
          week: { goal: number | null };
          month: { goal: number | null };
          goalType: 'billable' | 'total';
        }>('/me/goals/progress');
        setWeekly(data.week.goal != null ? String(data.week.goal) : '');
        setMonthly(data.month.goal != null ? String(data.month.goal) : '');
        setGoalType(data.goalType);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Kunne ikke hente tidsmål');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('saving');

    // Tomt felt = nullstill mål (sendes som null til API).
    const weeklyVal = weekly.trim() === '' ? null : Number(weekly);
    const monthlyVal = monthly.trim() === '' ? null : Number(monthly);

    if (weeklyVal !== null && (!Number.isFinite(weeklyVal) || weeklyVal < 0 || weeklyVal > 168)) {
      setError('Uke-mål må være mellom 0 og 168 timer');
      setStatus('error');
      return;
    }
    if (monthlyVal !== null && (!Number.isFinite(monthlyVal) || monthlyVal < 0 || monthlyVal > 744)) {
      setError('Måneds-mål må være mellom 0 og 744 timer');
      setStatus('error');
      return;
    }

    try {
      await api<Goals>('/me/goals', {
        method: 'PATCH',
        body: {
          weeklyHoursGoal: weeklyVal !== null ? Math.round(weeklyVal) : null,
          monthlyHoursGoal: monthlyVal !== null ? Math.round(monthlyVal) : null,
          goalType,
        },
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lagring feilet');
      setStatus('error');
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, color: tokens.color.navy, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Target size={26} strokeWidth={2} />
            Tidsmål
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Sett uke- og månedsmål for hvor mye du vil jobbe. Hjem-siden viser
            fremdrift og varsler hvis du henger etter.
          </p>
        </div>

        <section style={sectionStyle}>
          {!loaded ? (
            <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>Henter…</div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'grid', gap: 18 }}>
              <Field label="Mål per uke (timer)" hint="La stå tomt for ikke å sette mål">
                <input
                  type="number"
                  min={0}
                  max={168}
                  step={1}
                  value={weekly}
                  onChange={(e) => setWeekly(e.target.value)}
                  placeholder="f.eks. 30"
                  style={inputStyle}
                />
              </Field>

              <Field label="Mål per måned (timer)" hint="La stå tomt for ikke å sette mål">
                <input
                  type="number"
                  min={0}
                  max={744}
                  step={1}
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  placeholder="f.eks. 120"
                  style={inputStyle}
                />
              </Field>

              <Field label="Tell">
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as 'billable' | 'total')}
                  style={inputStyle}
                >
                  <option value="billable">Kun fakturerbare timer</option>
                  <option value="total">Alle loggede timer</option>
                </select>
              </Field>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 12,
                  background: tokens.color.blueSoft,
                  borderRadius: tokens.radius.sm,
                  borderLeft: `3px solid ${tokens.color.blue}`,
                  fontSize: 13,
                  color: tokens.color.text,
                  lineHeight: 1.45,
                }}
              >
                <Info size={16} strokeWidth={2} style={{ color: tokens.color.blue, flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Tips:</strong> Frilansere ligger typisk på 25–35 fakturerbare timer per uke.
                  Resten av arbeidsdagen går ofte til e-post, oppfølging og admin.
                </span>
              </div>

              {error && (
                <div
                  style={{
                    padding: 12,
                    background: tokens.color.redSoft,
                    color: tokens.color.red,
                    borderRadius: tokens.radius.sm,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              {status === 'success' && (
                <div
                  style={{
                    padding: 12,
                    background: tokens.color.greenSoft,
                    color: tokens.color.green,
                    borderRadius: tokens.radius.sm,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Lagret!
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={status === 'saving'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    background: tokens.gradient.navy,
                    color: 'white',
                    border: 'none',
                    borderRadius: tokens.radius.md,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: status === 'saving' ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: status === 'saving' ? 0.7 : 1,
                  }}
                >
                  <Save size={15} strokeWidth={2.5} />
                  {status === 'saving' ? 'Lagrer…' : 'Lagre tidsmål'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: tokens.color.text }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 12, color: tokens.color.textSubtle }}>{hint}</span>
      )}
    </label>
  );
}

const sectionStyle: React.CSSProperties = {
  background: 'white',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 20,
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  fontSize: 14,
  fontFamily: 'inherit',
  color: tokens.color.text,
  background: 'white',
  maxWidth: 240,
};
