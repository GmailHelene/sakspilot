'use client';

/**
 * Onboarding-modal for nye brukere.
 *
 * Vises automatisk hvis:
 *   - localStorage-flag 'sakspilot_onboarded' mangler
 *   - bruker er logget inn
 *
 * 3 steg:
 *   1. Velkommen + velg bransje (advokat/arkitekt/regnskap/designer/konsulent/annet)
 *   2. Foreslå 3 ferdige agenter (basert på bransje)
 *   3. Klar — lenker til Saker, Agenter, Klienter
 *
 * Lagrer bransjen i localStorage så vi senere kan personalisere UI/maler.
 */

import { useEffect, useState } from 'react';
import {
  Briefcase, Scale, Building, Calculator, Palette, Lightbulb,
  ArrowRight, Check, X, Sparkles,
} from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { isTokenValid } from '@/lib/api';

const STORAGE_KEY = 'sakspilot_onboarded';
const PROFESSION_KEY = 'sakspilot_profession';

interface Profession {
  id: string;
  label: string;
  Icon: typeof Briefcase;
  color: string;
  tagline: string;
}

const PROFESSIONS: Profession[] = [
  { id: 'advokat', label: 'Advokat / jurist', Icon: Scale, color: '#1E3A5F', tagline: 'Kontrakter, rettssaker, klientkorrespondanse' },
  { id: 'arkitekt', label: 'Arkitekt / ansvarlig søker', Icon: Building, color: '#FF7A45', tagline: 'Byggesaker, dokumentasjon, kommune-kontakt' },
  { id: 'regnskap', label: 'Regnskap / revisor', Icon: Calculator, color: '#00B884', tagline: 'Skatteoppgjør, månedsavslutning, fakturering' },
  { id: 'designer', label: 'Designer / kreativ', Icon: Palette, color: '#FF5AC4', tagline: 'Logo, web, branding, leveranser' },
  { id: 'konsulent', label: 'Konsulent / rådgiver', Icon: Lightbulb, color: '#A358DF', tagline: 'Strategi, prosjekter, workshops' },
  { id: 'annet', label: 'Annet / blandet', Icon: Briefcase, color: '#5E6C84', tagline: 'Jeg gjør litt av hvert' },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profession, setProfession] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isTokenValid()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Vent litt så ikke modal dukker opp før sidens førsteinntrykk
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, []);

  function finish() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      if (profession) localStorage.setItem(PROFESSION_KEY, profession);
    }
    setOpen(false);
  }

  function skip() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, 'skipped');
    setOpen(false);
  }

  if (!open) return null;

  const selectedProf = PROFESSIONS.find((p) => p.id === profession);

  return (
    <div style={overlayStyle} onClick={skip}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={skip}
          aria-label="Lukk"
          style={closeBtn}
        >
          <X size={18} />
        </button>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: n <= step ? tokens.color.navy : tokens.color.border,
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <Sparkles size={28} style={{ color: tokens.color.gold }} />
              <h2 style={{ fontSize: 24, color: tokens.color.navy }}>
                Velkommen til Sakspilot!
              </h2>
            </div>
            <p style={{ color: tokens.color.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
              La oss tilpasse appen til hvordan du jobber. Hva passer best?
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {PROFESSIONS.map((p) => {
                const Icon = p.Icon;
                const selected = profession === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProfession(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: 14,
                      background: selected ? p.color : tokens.color.white,
                      border: `2px solid ${selected ? p.color : tokens.color.border}`,
                      borderRadius: tokens.radius.md,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                      boxShadow: selected ? tokens.shadow.colored(p.color) : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: selected ? 'rgba(255,255,255,0.2)' : p.color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: selected ? 'white' : tokens.color.navy, marginBottom: 2 }}>
                        {p.label}
                      </div>
                      <div style={{ fontSize: 12, color: selected ? 'rgba(255,255,255,0.85)' : tokens.color.textMuted }}>
                        {p.tagline}
                      </div>
                    </div>
                    {selected && <Check size={20} style={{ color: 'white' }} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button onClick={skip} style={ghostBtn}>
                Hopp over
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!profession}
                style={{ ...primaryBtn, opacity: profession ? 1 : 0.5 }}
              >
                Neste <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
              </button>
            </div>
          </>
        )}

        {step === 2 && selectedProf && (
          <>
            <h2 style={{ fontSize: 22, color: tokens.color.navy, marginBottom: 8 }}>
              Slik tjener Sakspilot deg
            </h2>
            <p style={{ color: tokens.color.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              Her er hovedfunksjonene som passer for {selectedProf.label.toLowerCase()}:
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              <FeatureRow
                title="📋 Sak-CRM med kanban"
                desc="Hold styr på alle oppdrag i én visning. Drag-and-drop mellom status (Pågår → Venter → Ferdig)."
              />
              <FeatureRow
                title="⏱ Automatisk tidsregistrering (desktop-agent)"
                desc="Aldri glem å starte timer. Sakspilot ser hva du jobber på basert på vindustittel."
              />
              <FeatureRow
                title="🤖 Agenter / automatiseringer"
                desc='Når en sak blir Ferdig — Sakspilot lager automatisk en klistrelapp som minner deg om å sende faktura.'
              />
              <FeatureRow
                title="✨ AI-assistent (Claude)"
                desc="Få oppsummert saker. La AI-en skrive utkast til klient-eposter (status, utsettelse, faktura-påminnelse)."
              />
              <FeatureRow
                title="🔗 Del med klient"
                desc="Generer offentlig lenke per sak. Klienten ser status og fremdrift uten å logge inn."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button onClick={() => setStep(1)} style={ghostBtn}>
                ← Tilbake
              </button>
              <button onClick={() => setStep(3)} style={primaryBtn}>
                Neste <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: tokens.color.greenSoft,
                  color: tokens.color.green,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Check size={32} strokeWidth={3} />
              </div>
              <h2 style={{ fontSize: 24, color: tokens.color.navy, marginBottom: 8 }}>
                Du er klar!
              </h2>
              <p style={{ color: tokens.color.textMuted, lineHeight: 1.5 }}>
                Anbefalt rekkefølge for å komme i gang:
              </p>
            </div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
              <NextStepLink
                href="/klienter/ny"
                number="1"
                title="Legg til første klient"
                desc="Navn, epost, timesats — så er du klar"
                onClick={finish}
              />
              <NextStepLink
                href="/saker/ny"
                number="2"
                title="Opprett din første sak"
                desc="Koble til klient + sett frist"
                onClick={finish}
              />
              <NextStepLink
                href="/agenter"
                number="3"
                title="Aktiver en agent"
                desc="«Faktura-påminnelse» eller «Klistrelapp ved ny sak»"
                onClick={finish}
              />
              <NextStepLink
                href="/innstillinger/integrasjoner"
                number="4"
                title="Koble til Outlook"
                desc="E-poster knyttes automatisk til saker"
                onClick={finish}
              />
            </div>
            <button onClick={finish} style={{ ...primaryBtn, width: '100%' }}>
              Start uten å klikke videre →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.md,
      }}
    >
      <div style={{ fontWeight: 600, color: tokens.color.navy, fontSize: 14, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: tokens.color.textMuted, lineHeight: 1.5 }}>
        {desc}
      </div>
    </div>
  );
}

function NextStepLink({
  href,
  number,
  title,
  desc,
  onClick,
}: {
  href: string;
  number: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: tokens.color.bgAlt,
        borderRadius: tokens.radius.md,
        color: 'inherit',
        textDecoration: 'none',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = tokens.color.blueSoft)}
      onMouseLeave={(e) => (e.currentTarget.style.background = tokens.color.bgAlt)}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          background: tokens.color.navy,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: tokens.color.navy }}>{title}</div>
        <div style={{ fontSize: 12, color: tokens.color.textMuted }}>{desc}</div>
      </div>
      <ArrowRight size={16} style={{ color: tokens.color.textMuted }} />
    </a>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(23, 43, 77, 0.55)',
  backdropFilter: 'blur(4px)',
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: tokens.font.sans,
};

const modalStyle: React.CSSProperties = {
  background: tokens.color.white,
  borderRadius: tokens.radius.xl,
  maxWidth: 520,
  width: '100%',
  padding: 32,
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
  boxShadow: tokens.shadow.xl,
};

const closeBtn: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  background: 'transparent',
  border: 'none',
  color: tokens.color.textMuted,
  cursor: 'pointer',
  padding: 4,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: tokens.gradient.navy,
  color: 'white',
  border: 'none',
  borderRadius: tokens.radius.md,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'transparent',
  color: tokens.color.textMuted,
  border: 'none',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
