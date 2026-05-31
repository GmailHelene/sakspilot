# Facebook-post: WordPress Norge — rekruttering av testbrukere

**Strategi:** Åpen pilot (ingen cap). Pilot-tilgang gratis ut 2026.
Lavere friksjon = flere testere = bedre tilbakemelding.

---

## Versjon A — kort + selvbetjent (anbefalt første post)

👋 Hei alle frilansere/selvstendige!

Jeg har bygget Sakspilot — et arbeidsbord som samler det vi vanligvis gjør i 8 forskjellige faner: kunder, prosjekter, tidsføring, e-post, faktura. Tilpasset norske ENK-er.

🎁 Gratis ut hele 2026 for alle som vil teste i pilotperioden — ingen kredittkort, ingen forpliktelse, ingen «trial som blir til abonnement»-felle. Etter pilotperioden: 199 kr/mnd eller 1990 kr/år.

Funker bra for:
🔧 IT-konsulenter/utviklere
🎨 Designere
🏗️ Ansvarlige søkere / arkitekter
⚖️ Advokater
📊 Regnskap
💡 Konsulenter generelt

Slik kommer du i gang (5 min):

Registrer deg på 👉 sakspilot.no/registrer
Velg bransjen din i oppstartsveilederen — sidebaren tilpasses automatisk med relevante snarveier (Tripletex, Holte, Lovdata, Figma, Vercel osv. avhengig av yrke)
(Valgfritt) Last ned Windows-appen på sakspilot.no/last-ned for automatisk tidsregistrering basert på vindustittel
Setter PRIS på tilbakemelding — også «dette suger»-tilbakemelding 😅. Send DM eller skriv her hvis det er noe som ikke fungerer, så fikser jeg det samme dag i pilotfasen.

---

## Versjon B — featuredrevet (litt mer detaljert, for kommentarsvar
eller egen 2.-post hvis A ikke får trekkraft)

> 🚀 Sakspilot er live for piloter — gratis ut 2026
>
> **Hva er det:** Workspace for selvstendig næringsdrivende. Ett verktøy
> i stedet for 8 faner.
>
> **Kjerne-funksjoner:**
> 📋 Prosjekt-CRM med kanban (dra-og-slipp pågår → ferdig)
> ⏱ Automatisk tidsregistrering (Windows-agent leser vindustittel)
> 📧 Outlook-integrasjon — e-poster knyttes til riktig prosjekt
> 🤖 AI-assistent (Claude) skriver utkast til klient-eposter
> 💰 Faktura rett til Fiken med ett klikk (Tripletex via CSV)
> 🗓️ Kalender, Gantt-tidslinje, klistrelapper, frister
> 🎨 3 fargedesign + tilpassbar sidebar
> 🏗️ Bransje-spesifikke snarveier (Holte/eByggeSøk for ansvarlig søker,
>    GitHub/Vercel/Neon for utvikler, Lovdata for advokat osv.)
>
> **Personvern:** All data i EU (Vercel + Render + Neon Frankfurt).
> AI-prompts er PII-minimisert — kun klient-navn, aldri e-post/telefon.
> Full personvernerklæring på sakspilot.no/personvern.
>
> **Pris etter pilot:** 199 kr/mnd eller 1990 kr/år (= 2 mnd gratis ved
> årsabonnement). Stripe-checkout aktiveres Q1 2027 — frem til da
> manuell faktura.
>
> 👉 Registrer: **sakspilot.no/registrer**
> 👉 Last ned Windows-app: **sakspilot.no/last-ned**
> 👉 Spørsmål: kommentér her eller DM

---

## Versjon C — kort comment-svar / kvikk PM-respons

> Sakspilot er gratis ut 2026 for piloter — bare registrer på
> sakspilot.no/registrer. Velg bransje i oppstartsveilederen, så får du
> snarveiene som passer for det du jobber med. Windows-app for
> tidsregistrering kan lastes på sakspilot.no/last-ned (valgfritt). DM
> hvis noe ikke funker 🙏

---

## Versjon D — etter 2-4 uker (sosial proof-oppfølger)

> Update på Sakspilot-piloten 🎉
>
> [X] piloter inne nå. Tilbakemeldinger så langt:
> - [«kanban-en gjør at jeg endelig ser hva som faktisk haster»]
> - [«AI-utkast-funksjonen er overraskende god»]
> - [«ønsker mobil-versjon»]
>
> Fortsatt gratis ut 2026 for nye piloter — sakspilot.no/registrer.
> Ny build siste uke: [hovedendring, f.eks. «drag-and-drop i Launcher
> + lokale program-snarveier»].
>
> Takk til alle som har testet og rapportert bugs så langt — fikset
> [N] ting basert på tilbakemeldinger 🙌

(Fyll inn tall + faktiske sitater.)

---

## Posting-tips

1. **Spør moderator** før første post — noen WP-grupper er strenge på
   self-promo. Sannsynligvis OK siden det er gratis-pilot uten
   credit card-grep, men spør for å være safe
2. **Post hverdag 09-11** — når WP-folka er våkne men ikke midt i deploy
3. **Ha 2-3 screenshots klart i kommentarfeltet:**
   - Kanban med flere prosjekter (gjerne med IT-stack-launcher synlig)
   - Onboarding-modal med bransje-valg
   - AI-assistent som lager e-post-utkast
4. **Følg opp i kommentarfeltet innen 30 min** — engasjement booster post
5. **Sett auto-svar på DM:** «Hei! Takk for interessen. Registrer på
   sakspilot.no/registrer — jeg svarer på spørsmål her i tråden så det
   blir nyttig for andre også 🙏»
6. **Logg hvem som spør og kommenterer** — selv om de ikke melder seg
   nå, PM dem når en spesifikk feature er live (f.eks. mobil-app)

---

## Skala-grenser å være obs på

Hvis posten tar av (50+ registreringer på en dag):

- **Anthropic Claude-bruk** — sett soft rate-limit per org så ikke én
  power-user spiser hele AI-budsjettet (TODO i kode)
- **Neon Postgres free tier (0.5 GB)** — holder til ~50 piloter, oppgrader
  til Launch ($19/mnd) hvis du nærmer deg
- **Support-tid** — sett av 1 time/dag til triage. Bruk samme tråd til å
  svare bredt så ikke alle får samme svar 1-på-1

Hvis du må strupe: legg til invite-only-flagg på `/registrer` (1-times
jobb) eller pause-banner. Men start åpent — friksjon dreper momentum.
