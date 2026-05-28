# Sakspilot for ansvarlig søker — bruksanvisning

Skreddersydd for Nicole Torgersen / byggesakshåndtering. Skal kunne leses på
20 min og dekke alt hun trenger for de første 4 ukene.

---

## Del 1 — Komme i gang (15 min, gjøres én gang)

### Steg 1: Registrer konto

1. Gå til **https://sakspilot.no**
2. Klikk **«Kom i gang»** (oppe til høyre)
3. Fyll inn:
   - Bedriftsnavn (f.eks. «Torgersen Bygg AS» eller ditt ENK-navn)
   - Ditt navn
   - E-post (samme som du bruker på jobb)
   - Passord (min 12 tegn — bruk en passord-manager hvis du ikke har)
4. Klikk **«Opprett konto»**

Du blir logget inn automatisk og får 14 dagers gratis trial.
Pilotbrukere får i tillegg gratis ut hele **2026-12-31** — Helene aktiverer
dette manuelt etter at du har registrert.

### Steg 2: Onboarding-veileder (popper opp automatisk)

En blå modal popper opp. Tre steg:

1. **Velg bransje** → klikk **«Ansvarlig søker / byggesak»** (det blå
   bygg-ikonet). Dette gjør at sidebaren din får snarveier til Holte,
   eByggeSøk, Kartverket, Outlook, Google Drive, Tripletex og Fiken
2. **Slik tjener Sakspilot deg** → bare les og klikk Neste
3. **Du er klar!** → her kan du også velge fargedesign (rosa/lilla, navy/gull,
   eller skog/mose). Velg det som gleder deg mest

Klikk **«Start uten å klikke videre»** for å lukke veiviseren.

### Steg 3: Last ned og installer Windows-appen

Dette er det som gjør automatisk tidsregistrering mulig — uten den må du
fortsatt logge timer manuelt.

1. I Sakspilot, klikk på navnet ditt → **«Last ned Sakspilot Desktop»**
   (eller spør Helene om direkte-lenke til zip-en)
2. Pakk ut zip-fila — du får en mappe `Sakspilot-win32-x64`
3. Flytt mappa et sted permanent (f.eks. `C:\Programmer\Sakspilot\`)
4. Dobbeltklikk **`Sakspilot.exe`** inni mappa
5. Et tray-ikon dukker opp i hjørnet (nederst til høyre) — det betyr appen
   kjører. Klikk på det for å åpne dashboardet
6. Første gang spør den om innlogging — bruk samme e-post + passord som på
   web-en

**Tips:** Legg snarvei i Windows Start-meny ved å høyreklikke
`Sakspilot.exe` → «Fest til startmeny».

### Steg 4: Koble til Outlook (5 min, valgfritt men sterkt anbefalt)

Slik at e-poster fra byggherrer og kommune knyttes til riktig sak automatisk.

1. I Sakspilot, gå til **Innstillinger → Integrasjoner** (i sidebaren)
2. Klikk **«Koble til Outlook»**
3. Et popup-vindu åpnes med Microsoft-pålogging — logg inn med jobb-e-posten
4. Godta tilgangene Sakspilot ber om (lese e-post, ingen sending)
5. Popup-en lukkes automatisk når det er ferdig

Synking skjer hvert 15. minutt, eller klikk **«Synk nå»** for å hente
manuelt.

### Steg 5: Koble til Fiken (3 min, valgfritt)

Slik at du kan sende faktura med ett klikk fra en ferdig sak.

1. Logg inn på Fiken og gå til **Innstillinger → API-tilgang**
2. Klikk **«Generer personlig token»** og kopier tokenet (lang streng)
3. Noter bedrifts-slug-en din — finn det i URL-en når du er inne i bedriften.
   F.eks. `https://fiken.no/foretak/torgersen-bygg/...` → slug er
   `torgersen-bygg`
4. Tilbake i Sakspilot: **Innstillinger → Integrasjoner → Fiken**
5. Lim inn slug + token, klikk **«Koble til Fiken»**
6. Du får bekreftelse hvis tokenet er gyldig

Tokenet lagres kryptert (AES-256-GCM) på Sakspilot-serveren. Du kan koble
fra når som helst.

---

## Del 2 — Daglig bruk

### Dette gjør du første gang en byggesak kommer inn

1. Klikk **«Klienter»** i sidebaren → **«+ Ny klient»**
2. Fyll inn byggherrens navn (privatperson eller selskap) + e-post + telefon
3. Lagre
4. Klikk **«Prosjekter»** → **«+ Nytt prosjekt»**
5. Fyll inn:
   - **Tittel:** F.eks. «Tilbygg Storgata 12»
   - **Saksnummer:** Kommunens saksnummer (kan legges til senere)
   - **Klient:** Velg byggherren du nettopp opprettet
   - **Frist:** Når søknaden må være inne (eller kommunens behandlingsfrist
     hvis det er den du følger)
   - **Timesats:** Din normalsats (f.eks. 1450 kr/t)
6. Klikk **«Opprett sak»**

### Slik knytter du tid til saken automatisk

Når Windows-appen er installert og du har klikket **«Start arbeidsøkt»**
(enten i tray-menyen eller på Hjem-siden):

- Sakspilot ser hva som er aktivt vindu hvert sekund
- Hvis vindustittelen matcher en regel — knytter den tid til riktig sak
- Du ser timer dukke opp på saken etter ca 30 sek

**Sett opp matching-regler første gang:**

1. Åpne saken **«Tilbygg Storgata 12»**
2. Scroll til **«Matching-regler»**-seksjonen
3. Klikk **«+ Legg til regel»**
4. Type: **«Vindustittel inneholder»** → skriv f.eks. `Storgata 12`
5. Eller **«Filsti inneholder»** → f.eks. `\Storgata12\` hvis du har egen mappe
6. Lagre

Nå vil all tid hvor «Storgata 12» er i vindustittelen (Word-dokument, Outlook-
e-post, PDF-viewer osv) automatisk knyttes til den saken.

### Slik håndterer du innkommende e-post

Hvis Outlook er koblet til:

- E-poster fra byggherrens e-postadresse → automatisk koblet til alle saker
  hvor de er klient
- E-poster med saksnummer i emnefeltet → automatisk koblet
- E-poster du må koble manuelt: åpne saken → **«E-poster»**-seksjonen →
  **«+ Knytt e-post»** → velg fra liste

### Slik bruker du AI-assistenten

Når du sliter med å formulere en e-post til kommunen eller byggherren:

1. Åpne saken
2. Scroll til **«AI-assistent»** (Claude)
3. Klikk **«Skriv e-post-utkast»** og velg:
   - **«Status-oppdatering»** — gir byggherre kort statusrapport
   - **«Frist-utsettelse»** — ber kommune/byggherre om utvidet tidsfrist
   - **«Faktura-påminnelse»** — hyggelig påminnelse om kommende faktura
   - **«Egendefinert»** — du skriver hva e-posten skal si
4. Du får et utkast på 5-10 sek — kopier, lim inn i Outlook, juster, send

**OBS:** AI-en kjenner ikke konfidensiell info — den får bare saks-tittel,
klient-navn, milepæler, timer. Ingen klient-eposter eller telefon. Du kan
trygt bruke den.

### Slik fakturerer du en ferdig sak (med Fiken-integrasjon)

1. Åpne saken
2. Endre status til **«Ferdig»** (drag-and-drop i kanban eller velg i
   dropdown)
3. Scroll til **«Tidssammendrag»**
4. Klikk **«📄 Lag faktura i Fiken»**
5. Bekreft dialog (viser timer × timesats)
6. Sakspilot oppretter fakturadraft i Fiken med:
   - Klient som mottaker (auto-opprettet hvis ny)
   - Antall timer × timesats som faktura-linje
   - 25% MVA (du kan endre i Fiken hvis tjenesten er fritatt)
   - 14 dagers forfall
7. Klikk lenken som dukker opp for å åpne utkastet i Fiken
8. Kontroller, send fra Fiken

**Uten Fiken:** Bruk CSV-eksport i stedet. **Rapport → Måned →
Eksporter CSV** — importer i Tripletex eller Fiken manuelt.

---

## Del 3 — Spesifikt for byggesaksbehandling

### Anbefalt sak-mal for ansvarlig søker

For hver byggesak, opprett disse milepælene med en gang:

| Milepæl | Frist (eks) |
|---|---|
| Befaring + dokumentasjon | + 1 uke fra start |
| Søknadsutkast ferdig | + 3 uker |
| Nabovarsel sendt | + 4 uker |
| Søknad innlevert kommune | + 6 uker |
| Kommunen behandler (passiv venting) | + 18 uker |
| Vedtak mottatt | + 20 uker |
| Faktura sendt | + 20 uker |

Bruk **«Milepæler»**-seksjonen på saken til å legge disse inn.
**Klistrelapper** kan brukes for ad-hoc TODOs som ikke fortjener egen
milepæl (f.eks. «ring nabo Per om garasjefasade»).

### Holte-arbeidsflyt

- Klikk Holte-snarveien i sidebaren — den åpner i en innbygd fane i Windows-
  appen (eller i ny nettleser-fane på web). Sakspilot fortsetter å logge tid
  selv om du jobber i Holte
- Lag mappe-snarveier til prosjekt-mapper på lokalt disk under **«Mine
  mapper»** i sidebaren — så åpner du Holte-prosjekt-mappa raskt
- Bruk matching-regel **«App = SmartByggSak.exe»** for å knytte all Holte-
  tid til riktig sak

### Kommune-dialog

- Knytt alle e-poster fra kommunesaksbehandler til saken
- Bruk AI-assistenten til formelle svar — den treffer en god tone for
  kommune-korrespondanse
- Lag klistrelapp med kommunens saksbehandler-navn og direktenummer

### Nabovarsel

- Lag en klient per nabo (skjelett — bare navn + adresse)
- Bruk **«Del med klient»**-funksjonen for å gi naboen lenke til status uten
  innlogging

### Tips: Eksporter timeliste til byggherre

Mange byggherrer vil se «hva du har brukt tid på». Generer rapport:

1. **Rapport** i sidebaren
2. Velg sak + tidsperiode
3. Klikk **«Eksporter PDF»** eller **«Kopier som tekst»**
4. Send sammen med faktura

---

## Del 4 — Når noe ikke virker

| Problem | Løsning |
|---|---|
| Glemt passord | sakspilot.no/login → **«Glemt passord»** → e-post med reset-lenke |
| Windows-appen åpner seg ikke | Sjekk tray-ikon. Hvis ikke der: høyreklikk Sakspilot.exe → «Kjør som administrator» én gang |
| Tid registreres ikke | Klikk tray-ikon → sjekk at det står «Arbeidsøkt aktiv». Hvis pauset → klikk Start |
| Outlook synker ikke | Innstillinger → Integrasjoner → **«Synk nå»**-knappen. Hvis feilmelding → koble fra + til på nytt |
| Fiken sier «token avvist» | Tokenet er utløpt eller fjernet. Generer nytt i Fiken og koble til på nytt |
| AI gir rare svar | Skriv mer spesifikk instruksjon. AI vet bare det som står på saken |
| Noe annet | Ring/SMS Helene 📞 |

---

## Del 5 — Hva Sakspilot **ikke** gjør (og hvorfor)

- **Sender ikke e-poster for deg** — AI lager utkast, du sender. Bevisst valg
  så ikke noe sendes ved uhell
- **Genererer ikke byggesøknader** — fortsatt Holte/eByggeSøk som lager dem.
  Sakspilot er styringssystemet, ikke fagsystemet
- **Bokfører ikke** — Fiken/Tripletex gjør det. Sakspilot pusher kun timene
- **Lagrer ikke kommune-vedtak som juridiske dokumenter** — bruk Drive/
  OneDrive til arkivering, knytt lenker fra saken

---

## Kontakt

- **Helene:** helene@helene.cloud · 📞 [Helenes nummer]
- **Akutt feil i prod:** SMS — jeg fikser samme dag i pilotperioden
- **Tilbakemelding / forslag:** bare skriv i samme tråd, jeg leser alt

🙏 Tusen takk for at du tester!
