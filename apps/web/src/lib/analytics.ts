/**
 * Umami custom events.
 *
 * Bruk: trackEvent('Sak opprettet', { client: 'Nordvik' });
 *
 * Events sendes kun hvis Umami-skriptet er lastet, faller silent ellers.
 * Sjekk Umami Dashboard → Events for å se hva som kommer inn.
 *
 * Umami-API: window.umami.track(eventName, eventData?)
 */

type UmamiFn = (event: string, data?: Record<string, string | number | boolean>) => void;

declare global {
  interface Window {
    umami?: { track: UmamiFn };
  }
}

export function trackEvent(
  event: string,
  data?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return;
  if (!window.umami?.track) return;
  try {
    window.umami.track(event, data);
  } catch {
    // ignore
  }
}

// Predefinerte events, gjør det lettere å spore konsistent
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
