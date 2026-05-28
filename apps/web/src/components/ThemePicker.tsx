'use client';

/**
 * ThemePicker — liten 3-swatch-velger som lar brukeren bytte fargedesign.
 * Lagrer i localStorage via setTheme() og dispatcher 'sakspilot:theme-updated'
 * så ThemeInit re-applier umiddelbart.
 *
 * Bruk inline i innstillinger eller i onboarding-modalen.
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { THEMES, type ThemeId, getTheme, setTheme } from '@/lib/themes';
import { tokens } from '@/lib/tokens';

interface Props {
  compact?: boolean;
}

export default function ThemePicker({ compact = false }: Props) {
  const [current, setCurrent] = useState<ThemeId>('navy');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrent(getTheme());
  }, []);

  function choose(id: ThemeId) {
    setTheme(id);
    setCurrent(id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sakspilot:theme-updated'));
    }
  }

  if (!mounted) return null;

  return (
    <div>
      {!compact && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.color.navy, marginBottom: 4 }}>
            Fargedesign
          </div>
          <div style={{ fontSize: 12, color: tokens.color.textMuted }}>
            Velg fargesett. Trer i kraft umiddelbart.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(Object.values(THEMES) as Array<typeof THEMES[ThemeId]>).map((t) => {
          const selected = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => choose(t.id)}
              aria-label={`Velg tema ${t.label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '6px 10px' : '10px 12px',
                background: 'white',
                border: `2px solid ${selected ? t.primary : tokens.color.border}`,
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                color: tokens.color.navy,
                boxShadow: selected ? `0 0 0 3px ${t.primary}20` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 20,
                  borderRadius: 6,
                  background: `linear-gradient(135deg, ${t.primary} 0%, ${t.primary} 55%, ${t.accent} 55%, ${t.accent} 100%)`,
                  flexShrink: 0,
                }}
              />
              <span>{t.emoji}</span>
              <span style={{ fontWeight: selected ? 600 : 500 }}>{t.label}</span>
              {selected && <Check size={14} style={{ color: t.primary }} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
