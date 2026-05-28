/**
 * Plausible custom events.
 *
 * Bruk: trackEvent('Sak opprettet', { props: { client: 'Nordvik' } });
 *
 * Events sendes kun hvis Plausible-skriptet er lastet (prod), faller
 * silent i dev. Sjekk Plausible Dashboard → Goals → Custom Events for
 * å se hva som kommer inn.
 */

type PlausibleFn = (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

export function trackEvent(
  event: string,
  props?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return;
  if (typeof window.plausible !== 'function') return;
  try {
    window.plausible(event, props ? { props } : undefined);
  } catch {
    // ignore
  }
}

// Predefinerte events — gjør det lettere å spore konsistent
export const events = {
  sakCreated: (clientName?: string) =>
    trackEvent('Sak opprettet', clientName ? { client: clientName } : undefined),
  sakStatusChanged: (toStatus: string) =>
    trackEvent('Sak status endret', { status: toStatus }),
  agentActivated: (template: string) =>
    trackEvent('Agent aktivert', { template }),
  agentTested: () => trackEvent('Agent test-kjørt'),
  klientCreated: () => trackEvent('Klient opprettet'),
  aiSummary: () => trackEvent('AI: Oppsummering'),
  aiEmail: (type: string) => trackEvent('AI: E-postutkast', { type }),
  outlookConnected: () => trackEvent('Outlook tilkoblet'),
  outlookSynced: (linked: number) =>
    trackEvent('Outlook synket', { linked }),
  csvDownloaded: (scope: 'sak' | 'month') =>
    trackEvent('CSV nedlastet', { scope }),
  sharedLinkCreated: () => trackEvent('Klient-lenke generert'),
  pwaInstalled: () => trackEvent('PWA installert'),
  onboardingCompleted: (profession?: string) =>
    trackEvent('Onboarding fullført', profession ? { profession } : undefined),
};
