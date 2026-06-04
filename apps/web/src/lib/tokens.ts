/**
 * Design-tokens for Sakspilot. Inline-styling mønster.
 *
 * Designspråk: Monday/Basaas-inspirert — vibrante statusfarger, romsligere
 * radius, mykere skygger, mer pastell i bakgrunner. Beholder navy + gull
 * som primær-/aksentbrand, men legger til en bredere palett for
 * statusbadges, kategorier og illustrasjoner.
 */
export const tokens = {
  color: {
    // Primary — leser fra CSS-variabler så ThemePicker faktisk endrer farger
    // i hele UI-et. Fallback til navy hvis ThemeInit ikke har kjørt ennå (SSR).
    navy: 'var(--sp-primary, #1E3A5F)',
    navyDark: 'var(--sp-primary-dark, #152A47)',
    navyLight: 'var(--sp-primary-light, #2D5183)',
    gold: 'var(--sp-accent, #D4A017)',
    goldLight: 'var(--sp-accent-light, #E9C46A)',

    // Vibrant statusfarger (Monday-stil)
    green: '#00B884',         // pågående / suksess
    greenSoft: '#D5F5E9',
    blue: '#0086CC',          // info / aktiv
    blueSoft: '#D6EEFA',
    purple: '#A358DF',        // venter / spesial
    purpleSoft: '#EEDFF9',
    pink: '#FF5AC4',          // notater / kreativt
    pinkSoft: '#FFDAF1',
    orange: '#FF7A45',        // varsel / mellomstatus
    orangeSoft: '#FFE2D4',
    red: '#E2445C',           // kritisk / sletting
    redSoft: '#FBD9DD',
    yellow: '#FFCB00',        // venter / advarsel
    yellowSoft: '#FFF5CC',
    teal: '#00C7BE',          // alternativ aksent
    tealSoft: '#CCF4F2',

    // Nøytral — leser fra CSS-variabler så de flipper i mørk modus
    // (se globals.css :root og [data-mode="dark"]). Fallback-verdiene
    // matcher lys modus så SSR/tidlig render ser riktig ut.
    white: '#FFFFFF',                                       // ren hvit - for tekst på mørke flater (header-tekst, badges osv). Endres IKKE av mørk modus.
    surface: 'var(--sp-bg-surface, #FFFFFF)',               // kort-/panel-bakgrunn - flipper til mørk grå i mørk modus
    bg: 'var(--sp-bg, #F8F9FB)',                            // app-bakgrunn
    bgAlt: 'var(--sp-bg-alt, #F1F3F7)',                     // sub-flater (sidebar add-form, hover)
    border: 'var(--sp-border, #E6E9EF)',
    text: 'var(--sp-text, #172B4D)',
    textMuted: 'var(--sp-text-muted, #5E6C84)',
    textSubtle: 'var(--sp-text-subtle, #8993A4)',
  },
  // Gradients til CTA-knapper og hero-elementer.
  // navy/gold leser CSS-vars så de bytter med tema.
  gradient: {
    navy:
      'linear-gradient(135deg, var(--sp-primary, #1E3A5F) 0%, var(--sp-primary-light, #2D5183) 100%)',
    gold:
      'linear-gradient(135deg, var(--sp-accent, #D4A017) 0%, var(--sp-accent-light, #E9C46A) 100%)',
    green: 'linear-gradient(135deg, #00B884 0%, #00D4A1 100%)',
    blue: 'linear-gradient(135deg, #0086CC 0%, #00A3E0 100%)',
    pink: 'linear-gradient(135deg, #FF5AC4 0%, #FF85D7 100%)',
  },
  font: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '18px',
    xl: '24px',
    pill: '999px',
  },
  shadow: {
    sm: '0 1px 2px rgba(23, 43, 77, 0.06)',
    md: '0 4px 16px rgba(23, 43, 77, 0.08)',
    lg: '0 12px 32px rgba(23, 43, 77, 0.12)',
    xl: '0 24px 64px rgba(23, 43, 77, 0.18)',
    colored: (color: string) => `0 6px 20px ${color}40`,
  },
  spacing: (n: number) => `${n * 4}px`,
};

// Statusfarge-mapper — brukes på saker, milepæler, agent-status
export const statusColors: Record<string, { bg: string; fg: string; soft: string }> = {
  ikke_pabegynt: { bg: '#8993A4', fg: '#FFFFFF', soft: '#E6E9EF' },
  pagaaende: { bg: '#00B884', fg: '#FFFFFF', soft: '#D5F5E9' },
  venter_kunde: { bg: '#FFCB00', fg: '#172B4D', soft: '#FFF5CC' },
  venter_3part: { bg: '#FF7A45', fg: '#FFFFFF', soft: '#FFE2D4' },
  ferdig: { bg: '#1E3A5F', fg: '#FFFFFF', soft: '#D6EEFA' },
  arkivert: { bg: '#CBD5E1', fg: '#5E6C84', soft: '#F1F3F7' },
};

// Klient-farge basert på navn (hash → palett) — for avatar-sirkler
export function clientColor(name: string): { bg: string; fg: string } {
  const palette = [
    { bg: '#FF5AC4', fg: '#FFFFFF' },
    { bg: '#A358DF', fg: '#FFFFFF' },
    { bg: '#0086CC', fg: '#FFFFFF' },
    { bg: '#00B884', fg: '#FFFFFF' },
    { bg: '#FF7A45', fg: '#FFFFFF' },
    { bg: '#00C7BE', fg: '#FFFFFF' },
    { bg: '#D4A017', fg: '#FFFFFF' },
    { bg: '#E2445C', fg: '#FFFFFF' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
