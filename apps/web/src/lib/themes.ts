/**
 * Tema-varianter for Sakspilot. Brukeren kan velge mellom flere fargesett.
 * Lagres i localStorage; default = 'navy'.
 *
 * For å bytte tema: setTheme('rose') → ny palette anvendes via CSS variabler
 * (kommer i en senere iterasjon, per nå er bytting "kun" gjennom localStorage
 * og krever reload av sidan).
 */

export type ThemeId = 'navy' | 'rose' | 'forest';

export interface Theme {
  id: ThemeId;
  label: string;
  emoji: string;
  /// Hovedfargene som overstyrer tokens.color.* via CSS-variabler
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  navy: {
    id: 'navy',
    label: 'Navy & Gull',
    emoji: '🌊',
    primary: '#1E3A5F',
    primaryDark: '#152A47',
    primaryLight: '#2D5183',
    accent: '#D4A017',
    accentLight: '#E9C46A',
  },
  rose: {
    id: 'rose',
    label: 'Rosa & Hvit',
    emoji: '🌸',
    primary: '#C2185B',
    primaryDark: '#880E4F',
    primaryLight: '#E91E63',
    // Hvit aksent gir hvite knapper på rosa header, bedre kontrast enn
    // lilla-på-rosa (som ble vasket ut). accentLight er soft kremrosa for
    // pastell-bakgrunner og hover-states.
    accent: '#FFFFFF',
    accentLight: '#FFE4EC',
  },
  forest: {
    id: 'forest',
    label: 'Skog & Mose',
    emoji: '🌲',
    primary: '#2C5F2D',
    primaryDark: '#1B4332',
    primaryLight: '#52B788',
    accent: '#D4A017',
    accentLight: '#E9C46A',
  },
};

const STORAGE_KEY = 'sakspilot_theme';

export function getTheme(): ThemeId {
  if (typeof window === 'undefined') return 'navy';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in THEMES) return stored as ThemeId;
  return 'navy';
}

export function setTheme(id: ThemeId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}

/**
 * Anvender tema ved å sette CSS-variabler på <html>-elementet.
 * Komponenter som bruker var(--sp-primary) får automatisk ny farge.
 * Eksisterende komponenter med tokens.color.navy kan migreres gradvis.
 */
export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  const t = THEMES[id] || THEMES.navy;
  const root = document.documentElement;
  root.style.setProperty('--sp-primary', t.primary);
  root.style.setProperty('--sp-primary-dark', t.primaryDark);
  root.style.setProperty('--sp-primary-light', t.primaryLight);
  root.style.setProperty('--sp-accent', t.accent);
  root.style.setProperty('--sp-accent-light', t.accentLight);
  root.setAttribute('data-theme', id);
}

/* ────────────────────────────────────────────────────────────────
 * Mørk modus, separat akse fra palette.
 * Lagres som sakspilot_dark_mode='1' (på) / '0' eller fraværende (av).
 * Default = lys modus (vi auto-detect ikke prefers-color-scheme, bruker
 * må aktivt velge mørk for å unngå overraskelser ved første besøk).
 * ──────────────────────────────────────────────────────────────── */

const DARK_MODE_KEY = 'sakspilot_dark_mode';

export function getDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DARK_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDarkMode(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DARK_MODE_KEY, on ? '1' : '0');
  } catch {}
  applyDarkMode(on);
}

export function applyDarkMode(on: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (on) {
    root.setAttribute('data-mode', 'dark');
  } else {
    root.removeAttribute('data-mode');
  }
}
