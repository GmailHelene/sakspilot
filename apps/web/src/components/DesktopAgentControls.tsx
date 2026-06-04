'use client';

/**
 * Tidsregistrerings-widget, DEPRECATED i web-laget.
 *
 * Tidligere var dette en floating widget i hjørnet av dashboardet som styrte
 * desktop-agenten (start/stopp arbeidsøkt, auto-spor osv). Fra mai 2026
 * håndteres dette av en NATIVE Electron BrowserView som main-prosessen
 * alltid holder øverst, det er den eneste måten å sørge for at widgeten
 * forblir synlig når en snarvei (Gmail, WP-admin osv) er åpen som BrowserView.
 *
 * Se `apps/desktop/src/renderer/widget.html` + `widgetView` i
 * `apps/desktop/src/main.js`.
 *
 * Browser-bruk uten desktop-agent får ingen widget (det er ingen agent å
 * styre fra ren web).
 */
export default function DesktopAgentControls() {
  return null;
}
