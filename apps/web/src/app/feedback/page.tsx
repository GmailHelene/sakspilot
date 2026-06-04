'use client';

/**
 * /feedback — pilot-tilbakemelding.
 *
 * Liten intern side hvor piloter kan svare på 4 korte spørsmål.
 * Helene leser via Prisma Studio (eller liten admin-side senere).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

const MAX_LEN = 1000;

interface FeedbackResponse {
  id: string;
  submittedAt: string;
}

export default function FeedbackPage() {
  const router = useRouter();
  const [whatWorksBest, setWhatWorksBest] = useState('');
  const [whatFrustrates, setWhatFrustrates] = useState('');
  const [whatIsMissing, setWhatIsMissing] = useState('');
  const [wantsVideoCall, setWantsVideoCall] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    !submitting &&
    (whatWorksBest.trim().length > 0 ||
      whatFrustrates.trim().length > 0 ||
      whatIsMissing.trim().length > 0 ||
      wantsVideoCall);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api<FeedbackResponse>('/feedback', {
        method: 'POST',
        body: {
          whatWorksBest: whatWorksBest.trim() || null,
          whatFrustrates: whatFrustrates.trim() || null,
          whatIsMissing: whatIsMissing.trim() || null,
          wantsVideoCall,
        },
      });
      setDone(true);
      setTimeout(() => router.push('/hjem'), 3000);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Noe gikk galt. Prøv igjen.';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 48px' }}>
        <h1 style={{ fontSize: 28, color: tokens.color.navy, marginBottom: 8 }}>
          Pilot-tilbakemelding
        </h1>
        <p style={{ color: tokens.color.textMuted, fontSize: 15, marginBottom: 28, lineHeight: 1.5 }}>
          Som pilot er din ærlige tilbakemelding gull verdt. Svar på det som
          treffer - du trenger ikke svare på alle. Vi leser hvert eneste svar.
        </p>

        {done ? (
          <div style={successStyle}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🙏</div>
            <h2 style={{ color: tokens.color.navy, marginBottom: 8 }}>
              Takk! Vi leser hvert eneste svar
            </h2>
            <p style={{ color: tokens.color.textMuted }}>
              Du sendes tilbake til hjem-siden om noen sekunder…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={formStyle}>
            <Field
              label="Hva fungerer best for deg i Sakspilot?"
              hint="Det du faktisk bruker og er glad for."
              value={whatWorksBest}
              onChange={setWhatWorksBest}
            />
            <Field
              label="Hva frustrerer deg eller bremser deg?"
              hint="Småting teller - knapper som er rare, ting som henger seg, uklar tekst."
              value={whatFrustrates}
              onChange={setWhatFrustrates}
            />
            <Field
              label="Hva mangler - hva skulle du ønske Sakspilot kunne?"
              hint="Funksjoner, integrasjoner, snarveier - alt fra ville idéer til små ønsker."
              value={whatIsMissing}
              onChange={setWhatIsMissing}
            />

            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={wantsVideoCall}
                onChange={(e) => setWantsVideoCall(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: tokens.color.text }}>
                  Jeg vil gjerne ha en kort video-samtale med Helene
                </span>
                <span style={{ display: 'block', fontSize: 13, color: tokens.color.textMuted, marginTop: 2 }}>
                  15–20 min - for å gå dypere i hvordan du jobber og hva som kunne hjulpet.
                </span>
              </span>
            </label>

            {error && <div style={errorStyle}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  ...primaryButtonStyle,
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Sender…' : 'Send tilbakemelding'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}

// ── Field ───────────────────────────────────────────────────────

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const remaining = MAX_LEN - value.length;
  const tooLong = remaining < 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontWeight: 600, fontSize: 14, color: tokens.color.text }}>
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 13, color: tokens.color.textMuted, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_LEN}
        rows={4}
        style={{
          ...textareaStyle,
          borderColor: tooLong ? tokens.color.red : tokens.color.border,
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: tooLong ? tokens.color.red : tokens.color.textSubtle,
          textAlign: 'right',
        }}
      >
        {value.length} / {MAX_LEN}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  background: tokens.color.white,
  padding: 28,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  boxShadow: tokens.shadow.sm,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  fontSize: 14,
  fontFamily: 'inherit',
  color: tokens.color.text,
  background: tokens.color.white,
  resize: 'vertical',
  minHeight: 90,
  lineHeight: 1.5,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: 16,
  background: tokens.color.bgAlt,
  borderRadius: tokens.radius.md,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '12px 22px',
  borderRadius: tokens.radius.md,
  fontWeight: 600,
  fontSize: 14,
  border: 'none',
};

const errorStyle: React.CSSProperties = {
  padding: 14,
  background: tokens.color.redSoft,
  color: '#7F1D1D',
  borderRadius: tokens.radius.sm,
  fontSize: 14,
};

const successStyle: React.CSSProperties = {
  padding: 48,
  background: tokens.color.white,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${tokens.color.border}`,
  boxShadow: tokens.shadow.sm,
  textAlign: 'center',
};
