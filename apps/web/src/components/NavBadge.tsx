/**
 * NavBadge, Facebook-stil varselprikk for sidebar-elementer.
 *
 *   <NavBadge count={3} />     → rød sirkel med "3"
 *   <NavBadge count={0} />     → ingenting (null returneres)
 *   <NavBadge count={150} />   → "99+"
 *
 * Designvalg:
 *   - 18×18 px sirkel for å passe ved 16 px ikoner
 *   - Rød (#dc2626) når count > 0
 *   - Ingen render når count = 0, vi vil ikke ha "alle lest"-grå-badge
 *     siden den kan oppleves som varsel for noe brukeren ALLEREDE har sett
 *     (Prosjekter med 8 forfalte saker → grå 8 blir misvisende fordi
 *     du ikke har nye, du har bare ikke fikset de gamle).
 *   - Aktiv variant: hvit på navy når aktiv nav-item er bg-navy
 *
 * total-prop er beholdt for bakoverkompatibilitet med eksisterende kallsteder,
 * men ignoreres i render. Kan fjernes ved opprydding senere.
 */
import React from 'react';

interface NavBadgeProps {
  /** Antall nye/uleste siden lastVisited */
  count: number;
  /** Legacy - ignoreres etter "grå-badge"-fjerningen. Beholdes for compat. */
  total?: number;
  /** Aktiv-modus: nav-itemet har mørk bakgrunn, badge må være lysere */
  activeMode?: boolean;
}

export function NavBadge({ count, activeMode }: NavBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);
  const bg = activeMode ? '#ffffff' : '#dc2626';
  const fg = activeMode ? '#dc2626' : '#ffffff';

  return (
    <span
      aria-label={`${count} nye`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        background: bg,
        color: fg,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 999,
        lineHeight: 1,
        marginLeft: 'auto',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
