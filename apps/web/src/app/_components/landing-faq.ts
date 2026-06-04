/**
 * FAQ-data for forsiden, brukes både i Vanlige spørsmål-seksjonen
 * (kuratert subset) og i FAQPage JSON-LD (full liste) for AEO.
 *
 * Når du endrer noe her: husk å sjekke at toppen (FAQ[0..6]) fortsatt
 * er de mest relevante svarene for førstegangsbesøkende. JSON-LD-en
 * får ALLE for søkemotorer + svartjenester.
 */
export const FAQ = [
  {
    q: 'Hva er Sakspilot?',
    a: 'Sakspilot er et workspace for selvstendig næringsdrivende - prosjekt-CRM, automatisk tidsregistrering, Outlook-integrasjon, AI-assistent og fakturagrunnlag i ett verktøy. Du slipper å hoppe mellom Excel, klistrelapper og 3 forskjellige timeregistreringer.',
  },
  {
    q: 'Hva koster Sakspilot etter pilotperioden?',
    a: 'Sakspilot er gratis i pilotperioden frem til 2026-12-31. Etter det blir prisen 199 kr/mnd eller 1990 kr/år. Ingen kredittkort kreves for å prøve.',
  },
  {
    q: 'Lagres data i EU?',
    a: 'Ja. All data lagres på EU-servere (Neon i Frankfurt). Du har full data-eksport (GDPR §15) og slette-rett (§17) tilgjengelig i innstillinger. Ingen tracking-cookies - bruker Umami analytics (samtykke-fritt).',
  },
  {
    q: 'Hva med GDPR?',
    a: 'Sakspilot leverer DPA-mal, audit-log over hvem som har sett hva, og knapp for full sletting av konto + data. Vi er databehandler - du er behandlingsansvarlig for dine klientdata.',
  },
  {
    q: 'Erstatter Sakspilot Tripletex eller Fiken?',
    a: 'Nei - Sakspilot kompletterer regnskapssystemet ditt. Vi pusher timer og fakturagrunnlag TIL Tripletex/Fiken via CSV (direkte API kommer Q3 2026). Du bruker Sakspilot til daglig arbeidsflyt og tidsføring, Tripletex/Fiken til selve regnskapet.',
  },
  {
    q: 'Kan jeg eksportere data hvis jeg slutter?',
    a: 'Ja. Innstillinger → Sikkerhet → "Last ned mine data" gir deg ALL din data som JSON (GDPR-rettighet, alltid tilgjengelig). Hvis Sakspilot legges ned gir vi minst 90 dagers varsel + samme eksport.',
  },
  {
    q: 'Hvordan funker desktop-agenten?',
    a: 'Du installerer en liten Windows-app (Sakspilot Desktop). Den leser vindustittel hvert 15. sekund og kobler tiden til riktig prosjekt via dine egne matching-regler. Ingen behov for å starte og stoppe timer manuelt.',
  },
  {
    q: 'Hva med klient-personvern på desktop-agenten?',
    a: 'Desktop-agenten ser KUN vindustittel og filsti - aldri innholdet i dokumenter eller e-poster. Du kan også slå av agenten med ett klikk fra systemtray-en når du jobber med noe sensitivt.',
  },
  {
    q: 'Hvordan kobler jeg Outlook til Sakspilot?',
    a: 'Innstillinger → Integrasjoner → "Koble til Outlook". Logg inn med Microsoft-kontoen (Outlook.com, Hotmail eller Microsoft 365). Sakspilot kobler innkommende e-poster til riktig prosjekt basert på avsender eller emnefelt.',
  },
  {
    q: 'Hvilke yrkesgrupper passer Sakspilot for?',
    a: 'Sakspilot er bygget for selvstendig næringsdrivende: advokater, ansvarlige søkere, arkitekter, regnskapsførere, designere, IT-konsulenter - og andre med klientoppdrag og timeføring.',
  },
  {
    q: 'Kan jeg dele et prosjekt med klienten min?',
    a: 'Ja - generer en offentlig delt lenke per prosjekt. Klienten ser status, milepæler og fremdrift uten å logge inn. Sensitive data (notater, tidsregistreringer, beløp) deles ikke.',
  },
  {
    q: 'Lagres data hos OpenAI eller Anthropic?',
    a: 'AI-assistent bruker Anthropic Claude. Vi sender KUN klient-navn + prosjekt-metadata (titler, status, milepæler) - aldri klient-epost, telefon eller fritekst-notater. For EU-residency kan vi rute via AWS Bedrock i Frankfurt (Enterprise-konfigurerbart).',
  },
];

// Kortere kuratert FAQ for visning på forsiden (full liste går i JSON-LD).
export const FAQ_HOME = FAQ.slice(0, 7);

/**
 * JSON-LD structured data for forsiden (SoftwareApplication + FAQPage + Organization).
 * Returnerer ferdig stringified JSON så page.tsx kan dryppe det rett inn
 * i <script type="application/ld+json">.
 */
export function landingJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Sakspilot',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Windows',
        description:
          'Workspace for selvstendig næringsdrivende. Prosjekt-CRM, passiv tidsregistrering, Outlook-integrasjon, AI-assistent og fakturagrunnlag i ett verktøy.',
        url: 'https://sakspilot.no',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'NOK',
          availability: 'https://schema.org/InStock',
          description: 'Gratis i pilotperioden frem til 2026-12-31',
        },
        creator: {
          '@type': 'Person',
          name: 'Helene Åsheim Grønberg',
          url: 'https://helene.cloud',
        },
        inLanguage: 'nb-NO',
        featureList: [
          'Prosjekt-CRM med kanban',
          'Passiv tidsregistrering (desktop-agent)',
          'Outlook-integrasjon (Microsoft Graph)',
          'AI-assistent (Claude)',
          'Klient-portal med delte lenker',
          'CSV-eksport til Tripletex og Fiken',
          'PWA / installerbar mobil-app',
          'GDPR-klar (data-eksport + slett konto)',
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((q) => ({
          '@type': 'Question',
          name: q.q,
          acceptedAnswer: { '@type': 'Answer', text: q.a },
        })),
      },
      {
        '@type': 'Organization',
        name: 'Sakspilot',
        url: 'https://sakspilot.no',
        logo: 'https://sakspilot.no/icon-512.svg',
        founder: { '@type': 'Person', name: 'Helene Åsheim Grønberg' },
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'helene@helene.cloud',
          contactType: 'customer support',
          availableLanguage: ['Norwegian', 'English'],
        },
      },
    ],
  });
}
