'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Palette, RotateCcw, Eye, EyeOff } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import ThemePicker from '@/components/ThemePicker';
import { tokens } from '@/lib/tokens';

// Samme liste som i Sidebar.tsx — hold synkronisert
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(HIDDEN_NAV_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

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

        {/* Nav-skjul */}
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Sidebar — vis/skjul elementer</h2>
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
                      background: isHidden ? 'white' : tokens.color.navy,
                      color: isHidden ? tokens.color.textMuted : 'white',
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
              background: 'white',
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
  background: 'white',
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
