# Plan for neste arbeidsøkt

*Sist oppdatert: 27. mai 2026, sent på kvelden*

## TL;DR

Du har ferdig produkt og er klar for FASE 0: validering. **Ikke kod mer
før du har snakket med 4-5 mennesker.** Hvis under 4 av 8 vil betale,
sparte du 5 måneder ved å stoppe.

## Når du våkner i morgen

### 30 minutter med kaffe ☕

- [ ] Test Sakspilot.exe selv først:
  - [ ] Naviger til `apps\desktop\release\Sakspilot-win32-x64\`
  - [ ] Dobbeltklikk `Sakspilot.exe`
  - [ ] Bekreft at tray-ikonet dukker opp
  - [ ] Logg inn med `demo@sakspilot.no` / `Test12345!` (eller din egen konto)
  - [ ] Klikk Start arbeidsøkt → vent 5 min → Stopp + rapport
  - [ ] Åpne Excel-fila — ser den profesjonell ut?

Hvis svaret er ja: **du har et reelt produkt klart for tester.**

### 1 time på Nicole-mobilisering

- [ ] Ring Nicole (eller send SMS):
  > "Hei Nicole — vil du være den første som tester Sakspilot? Det er
  > workspacet for ansvarlige søkere vi snakket om. Jeg vil gjerne ha
  > deg på Teams en halvtime denne uka, vise det jeg har bygd, og høre
  > hva som mangler for at du skulle brukt det selv. Gratis i 3 måneder
  > for å gi tilbakemelding."

- [ ] Send henne på e-post:
  - [ ] `Sakspilot-Konseptbeskrivelse-1side.docx`
  - [ ] Lenke til Sakspilot.exe (last opp til Dropbox eller WeTransfer)
  - [ ] Ditt valg: vis henne live på Teams ELLER la henne prøve selv

- [ ] Be henne om 3 navn på andre i bransjen — hun kjenner mange

## Resten av uka

### Validerings-intervjuer (mål: 6-8 stk)

Bruk `Sakspilot-Intervjuguide.docx` for hvert intervju. Bok 30 min via
Calendly eller Teams. Etter hvert intervju, fyll inn scoringskjemaet
samme dag (du glemmer detaljer innen 24t).

**Mål etter 8 intervjuer:**
- ≥ 4 sier "ja, jeg ville betalt 500+ kr/mnd"
- ≥ 3 vil være pilotbruker
- Samme smerte nevnt av ≥ 5
- 0 deal-breakers oppdaget

**Hvis du treffer mål:** GO til Fase 1
**Hvis ikke:** STOPP, ikke kod mer. Sleng prosjektet ærlig.

## Hvis du er klar for koding (etter validering = GO)

Prioritert kø — IKKE start før Nicole + andre intervjuer er gjort:

### Uke 5 — Deploy til Railway (~3 timer)

- [ ] Opprett Railway-prosjekt for Sakspilot
- [ ] Koble til samme Neon-database (eller flytt til Railway Postgres)
- [ ] Sett env-vars: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL=https://sakspilot.no`
- [ ] Deploy `apps/api` og `apps/web` som separate Railway-tjenester
- [ ] Registrer sakspilot.no på Domeneshop
- [ ] Koble custom domain til Railway

### Uke 5 — Re-build .exe mot prod (~30 min)

- [ ] Endre default `apiUrl` i `apps/desktop/src/settings.js` til `https://api.sakspilot.no`
- [ ] `npm run build:exe`
- [ ] Last opp `Sakspilot-X.Y.Z-win-x64.zip` til Dropbox/GitHub Releases

### Uke 6 — Polish for piloter (~2 dager)

- [ ] Edit-knapp på saker (bare create + delete finnes nå)
- [ ] Drag-and-drop kanban for status-bytte
- [ ] Manuell omkategorisering av TimeEntry (ikke-matchet → sak)
- [ ] Faktura-grunnlag-side i web (ikke bare Excel fra desktop)
- [ ] Frist-varsler via e-post (Brevo)

### Uke 7-8 — Pilot-onboarding (~1 dag per pilot)

- [ ] Personlig onboarding (Teams) med hver av 5 piloter
- [ ] Hjelp dem sette opp 3-5 saker hver med matching-regler
- [ ] Daglig statussjekk første uke
- [ ] Pilotavtale signert — gratis i 3 mnd mot tilbakemelding

### Uke 8 — Nivå 2-integrasjon mot ByggPilot (~1 dag)

*Etter at minst 3 piloter har bekreftet at de vil betale.*

Se `Sakspilot-ByggPilot-Integrasjonsplan-v1.docx` for detaljer.
Knapp i sak-detaljsiden: "🔍 Test mot kommunens regelmotor".

## Hva du IKKE skal gjøre nå

❌ Bygge flere features før Nicole har sett produktet
❌ Pusse på .exe-ikon, kosmetikk, edge-cases
❌ Skrive mer dokumentasjon
❌ Diskutere Nivå 3-integrasjon (kommer mnd 12)
❌ Bekymre deg for code signing (kommer etter første 10 betalende)
❌ Stresse over hva som mangler — du har **et komplett MVP**

## Dokumenter du kan vise andre

Ligger i `C:\Users\helen\Desktop\sakspilot\`:

| Dokument | Til hvem | Når |
|---|---|---|
| `Sakspilot-Konseptbeskrivelse-1side.docx` | Intervjuobjekter, før møte | E-post før samtale |
| `Sakspilot-Intervjuguide.docx` | Deg selv under intervju | Print én per intervju |
| `Sakspilot-Komplett-Dokumentasjon-v1.docx` | Seriøse interessenter | Hvis noen ber om "dypere" |
| `Sakspilot-Konsept-Arkitektur-Fremdriftsplan-v1.docx` | Tekniske partnere | Bare hvis spurt |
| `Sakspilot-ByggPilot-Strategi-2sider-v1.docx` | Investorer, mulige oppkjøpere | År 1-2 |
| `Sakspilot-ByggPilot-Integrasjonsplan-v1.docx` | Du selv, om 8 uker | Når Sakspilot Pro har 10+ kunder |

## Hovedstrategi du kan stole på

Du eier nå BÅDE kommune-siden (ByggPilot) og søker-siden (Sakspilot) av
norsk byggesaksbehandling. Ingen konkurrent kan kopiere det. På 18-24
måneder gjør dette deg attraktiv for oppkjøp av Sikri/Acos (vil ha
ByggPilot) eller Holte/EG (vil ha Sakspilot) — og du får premium fordi
du eier den andre halvdelen.

**Men:** det gjelder kun hvis Sakspilot blir validert. Hvis ikke blir
ByggPilot stående alene, og strategien degraderes til "ett produkt".

**Derfor:** validering først. Alt annet etterpå.

---

🌙 *Sove godt. Du har gjort en hel ukes arbeid i dag.*
