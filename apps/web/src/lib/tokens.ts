/**
 * Design-tokens for Sakspilot. Inline-styling mønster — samme som ByggPilot.
 * Hold alle farger/spacing/typografi her så endringer er sentraliserte.
 */
export const tokens = {
  color: {
    // Primary — dyp navy (tillit, profesjonell)
    navy: '#1E3A5F',
    navyDark: '#152A47',
    navyLight: '#2D5183',
    // Accent — varm gull (verdi, premium)
    gold: '#B8860B',
    goldLight: '#D4A017',
    // Status
    green: '#2D6A4F',
    greenLight: '#52B788',
    red: '#9D0208',
    yellow: '#E9C46A',
    // Nøytral
    white: '#FFFFFF',
    bg: '#FAFAF7',
    bgAlt: '#F4F4F0',
    border: '#E2E2DC',
    text: '#1A1A1A',
    textMuted: '#555555',
    textSubtle: '#8A8A8A',
  },
  font: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
  },
  spacing: (n: number) => `${n * 4}px`,
};
