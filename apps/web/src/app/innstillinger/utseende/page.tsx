'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Palette, RotateCcw, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import ThemePicker from '@/components/ThemePicker';
import { tokens } from '@/lib/tokens';
import { getDarkMode, setDarkMode } from '@/lib/themes';

// Samme liste som i Sidebar.tsx, hold synkronisert
const ALL_NAV: { id: string; label: string }[] = [
  { id: 'hjem', label: 'Hjem' },
  { id: 'prosjekter', label: 'Prosjekter' },
  { id: 'klienter', label: 'Klienter' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'tidslinje', label: 'Tidslinje' },
  { id: 'rapport', label: 'Rapport' },
  { id: 'klistrelapper', label: 'Klistrelapper' },
  { id: 'agenter', label: 'Agenter' },
  { id: 'integrasjoner', label: 'Integrasjoner' },
  { id: 'sikkerhet', label: 'Sikkerhet' },
  { id: 'utseende', label: 'Utseende' },
];

const HIDDEN_NAV_KEY = 'sakspilot_hidden_nav';

export default function UtseendePage() {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [darkMode, setDarkModeState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(HIDDEN_NAV_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {}
    setDarkModeState(getDarkMode());
  }, []);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkModeState(next);
    setDarkMode(next);
    // Trigger ThemeInit-handler så evt. andre lyttere oppdaterer
    try {
      window.dispatchEvent(new Event('sakspilot:theme-updated'));
    } catch {}
  }

  function toggleNav(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(HIDDEN_NAV_KEY, JSON.stringify([...next]));
        // Refresh så Sidebar-en plukker opp endringen
        window.dispatchEvent(new Event('sakspilot:nav-updated'));
      } catch {}
      return next;
    });
  }

  function resetAll() {
    if (
      !confirm(
        'Tilbakestill alt? Dette sletter dine launcher-snarveier, mappe-snarveier, Mine sites, skjulte nav-elementer, hjem-widget-preferanser og bransje-valg. Tema beholdes. Du blir sendt til onboarding.'
      )
    )
      return;
    const keys = [
      'sakspilot_onboarded',
      'sakspilot_profession',
      'sakspilot_launcher_apps',
      'sakspilot_shortcuts',
      'sakspilot_folder_shortcuts',
      'sakspilot_my_sites',
      'sakspilot_hidden_nav',
      'sakspilot_hjem_hidden_widgets',
    ];
    for (const k of keys) localStorage.removeItem(k);
    // Behold theme + active_user
    alert('Tilbakestilt. Siden lastes på nytt.');
    window.location.href = '/hjem';
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
            <Palette size={26} strokeWidth={2} />
            Utseende
          </h1>
          <p style={{ color: tokens.color.textMuted, fontSize: 14, marginTop: 4 }}>
            Tilpass fargedesign, sidebar og widget-visning for Sakspilot
          </p>
        </div>

        {/* Tema */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Fargetema</h2>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
            Velg fargesett. Endringen trer i kraft umiddelbart og lagres lokalt.
          </p>
          <ThemePicker />
        </section>

        {/* Mørk modus */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Mørk modus</h2>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
            Bytt mellom lys og mørk bakgrunn. Påvirker hele grensesnittet -
            farge­temaet over beholdes som aksent.
          </p>
          {mounted && (
            <button
              onClick={toggleDarkMode}
              aria-pressed={darkMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 18px',
                background: darkMode ? tokens.color.navy : tokens.color.surface,
                color: darkMode ? tokens.color.white : tokens.color.text,
                border: `1px solid ${darkMode ? tokens.color.navy : tokens.color.border}`,
                borderRadius: tokens.radius.md,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {darkMode ? <Moon size={16} strokeWidth={2.5} /> : <Sun size={16} strokeWidth={2.5} />}
              Mørk modus: {darkMode ? 'På' : 'Av'}
            </button>
          )}
        </section>

        {/* Nav-skjul */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Sidebar - vis/skjul elementer</h2>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
            Klikk for å skjule. Skjulte elementer kan slås på igjen her.
          </p>
          {mounted && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_NAV.map((n) => {
                const isHidden = hidden.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => toggleNav(n.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      background: isHidden ? tokens.color.surface : tokens.color.navy,
                      color: isHidden ? tokens.color.textMuted : tokens.color.white,
                      border: `1px solid ${isHidden ? tokens.color.border : tokens.color.navy}`,
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    {n.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Reset */}
        <section style={{ ...sectionStyle, borderColor: '#FEE2E2' }}>
          <h2 style={{ ...sectionTitleStyle, color: tokens.color.red }}>
            Tilbakestill grensesnitt
          </h2>
          <p style={{ fontSize: 13, color: tokens.color.textMuted, marginBottom: 16 }}>
            Nuller alle preferanser: snarveier i sidebar, Mine sites, mapper, skjulte nav-elementer,
            widget-valg og bransje-onboarding. Tema beholdes. Kontodata og prosjekter berøres ikke.
            Etter reset åpnes onboarding-veilederen på nytt.
          </p>
          <button
            onClick={resetAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: tokens.color.surface,
              color: tokens.color.red,
              border: `1px solid ${tokens.color.red}`,
              borderRadius: tokens.radius.md,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RotateCcw size={15} strokeWidth={2.5} />
            Tilbakestill grensesnitt
          </button>
        </section>
      </div>
    </AppLayout>
  );
}

const sectionStyle: React.CSSProperties = {
  background: tokens.color.surface,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.lg,
  padding: 20,
  marginBottom: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  color: tokens.color.navy,
  marginBottom: 6,
};
