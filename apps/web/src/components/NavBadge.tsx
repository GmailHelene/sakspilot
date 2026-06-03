/**
 * NavBadge — Facebook-stil varselprikk for sidebar-elementer.
 *
 *   <NavBadge count={3} />          → rød sirkel med "3"
 *   <NavBadge count={0} total={5} /> → grå sirkel med "5" (alle lest, men noen finnes)
 *   <NavBadge count={0} total={0} /> → ingenting (null returneres)
 *   <NavBadge count={150} />         → "99+"
 *
 * Designvalg:
 *   - 18×18 px sirkel for å passe ved 16 px ikoner
 *   - Rød (#dc2626) når count > 0 (ulest)
 *   - Grå (#94a3b8) når count=0 men total>0 (alle lest, men finnes ting)
 *     — dette varsler at det finnes f.eks. forfalte fakturaer, men brukeren
 *     har allerede sett dem. Mindre påtrengende enn rød.
 *   - Aktiv variant: hvit på navy når aktiv nav-item er bg-navy
 */
import React from 'react';

interface NavBadgeProps {
  /** Antall nye/uleste siden lastVisited */
  count: number;
  /** Totalt antall aktive (forfalte, åpne, etc.) — vises i grått hvis count=0 */
  total?: number;
  /** Aktiv-modus: nav-itemet har mørk bakgrunn, badge må være lysere */
  activeMode?: boolean;
}

export function NavBadge({ count, total, activeMode }: NavBadgeProps) {
  // Ingenting å vise hvis verken count eller total er > 0
  const showCount = count > 0;
  const showTotal = !showCount && (total ?? 0) > 0;
  if (!showCount && !showTotal) return null;

  const display = showCount ? count : (total as number);
  const label = display > 99 ? '99+' : String(display);

  const bg = showCount
    ? (activeMode ? '#ffffff' : '#dc2626')          // rød (eller hvit på mørk bg)
    : (activeMode ? 'rgba(255,255,255,0.3)' : '#cbd5e1');  // grå

  const fg = showCount
    ? (activeMode ? '#dc2626' : '#ffffff')
    : (activeMode ? '#ffffff' : '#475569');

  return (
    <span
      aria-label={showCount ? `${count} nye` : `${total} aktive`}
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
