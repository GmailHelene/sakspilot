'use client';

/**
 * /innstillinger/kalender — abonner på iCal-feed med dine frister.
 *
 * Brukeren genererer et token én gang. Resultatet er en URL som
 * Google Calendar / Apple Calendar / Outlook kan abonnere på.
 * One-way sync: Sakspilot → kalender. Endringer i Sakspilot
 * dukker opp i kalenderen ved neste poll (typisk hver time).
 *
 * Sikkerhetsadvarsel er fremtredende: URL-en autentiserer ene og
 * alene — hvem som helst som har den kan se brukerens åpne saker
 * og frister. Vi tilbyr "Slett og lag ny" for rotering hvis URL
 * lekker.
 */

import { useEffect, useState } from 'react';
import { Calendar, Copy, Check, Trash2, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { tokens } from '@/lib/tokens';
import { api, ApiError } from '@/lib/api';

interface IcalStatus {
  hasToken: boolean;
  icalUrl?: string;
}

export default function KalenderFeedPage() {
  const [status, setStatus] = useState<IcalStatus | null>(null);
  const [busy, setBusy] = useState<'generate' | 'regenerate' | 'revoke' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const data = await api<IcalStatus>('/me/ical');
      setStatus(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Kunne ikke hente status');
      setStatus({ hasToken: false });
    }
  }

  async function generate(isRegenerate: boolean) {
    setError(null);
    setBusy(isRegenerate ? 'regenerate' : 'generate');
    try {
      const data = await api<{ icalUrl: string; warning: string }>('/me/ical/generate', {
        method: 'POST',
      });
      setStatus({ hasToken: true, icalUrl: data.icalUrl });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ukjent feil');
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (
      !confirm(
        'Skru av kalender-feeden? Lenken slutter umiddelbart å virke i Google/Apple/Outlook. ' +
          'Du kan generere en ny senere, men det blir en annen URL.',
      )
    ) {
      return;
    }
    setError(null);
    setBusy('revoke');
    try {
      await api('/me/ical', { method: 'DELETE' });
      setStatus({ hasToken: false });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ukjent feil');
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!status?.icalUrl) return;
    try {
      await navigator.clipboard.writeText(status.icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for nettlesere uten clipboard API
      const ta = document.createElement('textarea');
      ta.value = status.icalUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 26,
              color: tokens.color.navy,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Calendar size={26} strokeWidth={2} />
            Kalender-feed
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Få frister og milepæler fra Sakspilot direkte i Google Calendar, Apple Calendar
            eller Outlook
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              background: '#FEE2E2',
              color: '#7F1D1D',
              border: '1px solid #FCA5A5',
              borderRadius: tokens.radius.sm,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {!status ? (
          <Section title="Henter status…">
            <div style={{ color: tokens.color.textMuted, fontSize: 13 }}>…</div>
          </Section>
        ) : !status.hasToken ? (
          <NotGeneratedView
            onGenerate={() => generate(false)}
            busy={busy === 'generate'}
          />
        ) : (
          <ActiveView
            icalUrl={status.icalUrl!}
            copied={copied}
            onCopy={copyUrl}
            onRegenerate={() => generate(true)}
            onRevoke={revoke}
            busy={busy}
          />
        )}

        <Instructions />
      </div>
    </AppLayout>
  );
}

// ── Når ingen feed er generert ──────────────────────────────────

function NotGeneratedView({
  onGenerate,
  busy,
}: {
  onGenerate: () => void;
  busy: boolean;
}) {
  return (
    <Section title="Få frister i kalenderen din">
      <p
        style={{
          fontSize: 14,
          color: tokens.color.text,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        Sakspilot kan generere en URL som du legger inn i kalender-appen din. Da
        dukker alle åpne frister og milepæler opp som hendelser, og oppdateres
        automatisk når du endrer noe i Sakspilot. Synkronisering er enveis -
        endringer du gjør i kalenderen påvirker ikke prosjektene.
      </p>

      <div
        style={{
          padding: '12px 14px',
          background: tokens.color.yellowSoft,
          border: `1px solid ${tokens.color.yellow}`,
          borderRadius: tokens.radius.sm,
          fontSize: 13,
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <AlertTriangle
          size={16}
          strokeWidth={2}
          style={{ color: '#8B6F00', flexShrink: 0, marginTop: 2 }}
        />
        <div>
          <strong>Hvem som helst med URL-en kan se dine åpne frister.</strong> URL-en
          er din eneste beskyttelse - del den bare med deg selv (kalender-appen).
          Hvis den lekker kan du når som helst generere en ny.
        </div>
      </div>

      <button onClick={onGenerate} disabled={busy} style={primaryBtn}>
        <Calendar size={14} strokeWidth={2} />
        {busy ? 'Genererer…' : 'Generer iCal-URL'}
      </button>
    </Section>
  );
}

// ── Når feed er aktiv ───────────────────────────────────────────

function ActiveView({
  icalUrl,
  copied,
  onCopy,
  onRegenerate,
  onRevoke,
  busy,
}: {
  icalUrl: string;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  busy: 'generate' | 'regenerate' | 'revoke' | null;
}) {
  return (
    <Section title="Din iCal-URL">
      <p
        style={{
          fontSize: 13,
          color: tokens.color.textMuted,
          marginBottom: 12,
        }}
      >
        Kopier denne URL-en og lim den inn i kalender-appen din (se instruksjoner under).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          readOnly
          value={icalUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.sm,
            fontSize: 13,
            fontFamily: tokens.font.mono,
            background: tokens.color.bg,
          }}
        />
        <button onClick={onCopy} style={primaryBtn}>
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
          {copied ? 'Kopiert!' : 'Kopier'}
        </button>
      </div>

      <div
        style={{
          padding: '10px 14px',
          background: tokens.color.yellowSoft,
          border: `1px solid ${tokens.color.yellow}`,
          borderRadius: tokens.radius.sm,
          fontSize: 12,
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <AlertTriangle
          size={14}
          strokeWidth={2}
          style={{ color: '#8B6F00', flexShrink: 0, marginTop: 2 }}
        />
        <div>
          Hvem som helst med denne URL-en kan se dine åpne frister og prosjektnavn.
          Ikke del med uvedkommende. Hvis den har lekket - generer en ny (den
          gamle slutter da å virke).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onRegenerate}
          disabled={!!busy}
          style={secondaryBtn}
          title="Generer ny URL. Gammel slutter umiddelbart å virke."
        >
          <RefreshCw size={14} strokeWidth={2} />
          {busy === 'regenerate' ? 'Roterer…' : 'Slett og lag ny'}
        </button>
        <button
          onClick={onRevoke}
          disabled={!!busy}
          style={dangerBtn}
          title="Deaktiver feeden helt - ingen kalender-app kan lese den lenger."
        >
          <Trash2 size={14} strokeWidth={2} />
          {busy === 'revoke' ? 'Slår av…' : 'Skru av'}
        </button>
      </div>
    </Section>
  );
}

// ── Instruksjoner per kalender-klient ───────────────────────────

function Instructions() {
  return (
    <Section title="Slik abonnerer du" icon={<Info size={18} strokeWidth={2} />}>
      <div style={{ display: 'grid', gap: 16 }}>
        <InstructionBlock
          name="Google Calendar"
          steps={[
            'Åpne Google Calendar i nettleseren (calendar.google.com).',
            'Klikk på + ved siden av "Andre kalendere" i venstremenyen.',
            'Velg "Fra URL".',
            'Lim inn URL-en ovenfor og klikk "Legg til kalender".',
            'Det kan ta opptil noen timer før hendelsene dukker opp første gang. Google polleren typisk hver 8.–24. time.',
          ]}
        />
        <InstructionBlock
          name="Apple Calendar (Mac/iPhone)"
          steps={[
            'På Mac: Åpne Kalender → Fil → Nytt kalenderabonnement.',
            'På iPhone: Innstillinger → Kalender → Kontoer → Legg til konto → Annet → Legg til abonnert kalender.',
            'Lim inn URL-en ovenfor.',
            'Sett oppdaterings-intervall til "Hver time" for raskest oppdatering.',
          ]}
        />
        <InstructionBlock
          name="Outlook"
          steps={[
            'Åpne Outlook på nett (outlook.live.com eller outlook.office.com).',
            'Klikk på kalender-ikonet i sidemenyen.',
            'Velg "Legg til kalender" → "Abonner fra web".',
            'Lim inn URL-en, gi den et navn, og klikk "Importér".',
            'I desktop-Outlook: Fil → Kontoinnstillinger → Internett-kalendere → Ny.',
          ]}
        />
      </div>
    </Section>
  );
}

function InstructionBlock({ name, steps }: { name: string; steps: string[] }) {
  return (
    <div
      style={{
        padding: 14,
        background: tokens.color.bg,
        borderRadius: tokens.radius.sm,
        border: `1px solid ${tokens.color.border}`,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: tokens.color.navy,
          marginBottom: 8,
        }}
      >
        {name}
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: tokens.color.text, lineHeight: 1.6 }}>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

// ── Reusable ────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: tokens.color.white,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${tokens.color.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: tokens.color.navy,
          }}
        >
          {icon}
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
        </div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.navy,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.white,
  color: tokens.color.textMuted,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: `1px solid ${tokens.color.border}`,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: tokens.color.red,
  color: tokens.color.white,
  padding: '10px 18px',
  borderRadius: tokens.radius.md,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};
