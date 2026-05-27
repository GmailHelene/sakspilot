# Sakspilot Desktop Agent

Tray-app for Windows som logger aktivt vindu og kobler det til riktig sak.

**Status:** Electron-app v0.0.1 + frittstående POC-script. Pakker som .exe
via `npm run build:exe` (krever ekstra setup for code signing).

## Kjøre Electron-appen

```bash
cd C:\Users\helen\Desktop\sakspilot\apps\desktop
npm install         # første gang
npm start           # starter tray-app
```

Ved første start dukker innstillinger-vinduet opp. Logg inn med samme
e-post + passord som på sakspilot-web. Etter innlogging kjører agenten
i bakgrunnen som tray-ikon (nederst til høyre, ved klokken).

Høyreklikk på tray-ikonet for å se:
- Status (hvilken sak du jobber på akkurat nå)
- Antall sessions logget
- Pause / Fortsett
- Åpne web-dashboardet
- Synk nå
- Innstillinger
- Logg ut

## Bygg som installerbar .exe

```bash
npm run build:exe
```

Lager `release/Sakspilot Setup 0.0.1.exe` som kan installeres på
Windows-maskiner. Krever ikke admin-rettigheter (per-user install).

For ekte distribusjon trenger appen et **code signing-sertifikat**
(~3000 kr/år hos Sectigo) — ellers vil SmartScreen advare brukere.

---

## POC — bevis at vinduslogging fungerer

Denne mappen inneholder en frittstående Node.js-POC som beviser at vi kan
lese aktivt vindu på Windows. Hvis denne kjører stabilt i 5 minutter med
vindusbytter — er hovedkonseptet flygbart.

### Kjør

```bash
cd C:\Users\helen\Desktop\sakspilot\apps\desktop
npm install
npm run poc:fast     # 3s intervall, 2 min — rask test
```

### Hva du skal se

Konsollet logger hver gang du bytter vindu:

```
[09:42:13] ▶  Code.exe: "poc-logger.js — Sakspilot — Visual Studio Code"
[09:42:18] ▶  chrome.exe: "Sakspilot — Workspace for selvstendig…"
[09:42:34] ▶  WINWORD.EXE: "Bygdoy 12 — rammetillatelse.docx — Word"
```

Med `--rules`-flagget legger den til sak-matching:

```bash
npm run poc:matching
```

```
[09:42:34] ▶  WINWORD.EXE: "Bygdoy 12 — rammetillatelse.docx — Word"  → 🎯 Bygdøy 12 — rammetillatelse (title)
```

### Etter at POC-en er ferdig

Du får en sluttrapport som viser:
- Totalt antall polls og feilrate
- Tid per applikasjon
- Tid per sak (hvis matching var på)
- JSON-fil med alle TimeEntry-utkast i `%TEMP%\sakspilot-poc\`

### Hva POC-en validerer

✅ Hovedkonseptet er flygbart hvis:
- 0 (eller < 10 %) feil over 5 minutter
- Vindusbytter detekteres innen ett polling-intervall
- App-navn og titler er lesbare (ikke krypterte/maskerte)
- Polling påvirker ikke CPU-belastning merkbart

❌ Vi må tenke nytt hvis:
- get-windows krasjer eller henger
- Windows-titler er tomme/maskerte for vanlige apper
- AutoCAD/PDF-readere viser ikke filnavn i tittel

### CLI-argumenter

| Argument | Default | Beskrivelse |
|----------|---------|-------------|
| `--interval=N` | 15 | Polling-intervall i sekunder |
| `--duration=N` | 300 | Hvor lenge POC-en kjører (sekunder) |
| `--rules` | av | Aktiver demo sak-matching |

### Kjente begrensninger i POC

- **Ingen filsti for alle apps**: Word/Excel viser filnavn i tittel, men ikke
  alltid filsti. Vi henter `owner.path` (sti til .exe-en) — for full filsti
  trenger vi Windows UI Automation API i full agent.
- **Ingen lagring til backend**: POC-en skriver kun til lokal JSON. Full
  agent sender batch til `/agent/sync` hvert 5. minutt.
- **Ingen tray-ikon**: Ren konsoll. Full agent bruker Electron med tray.
- **Ingen auto-start**: Du må starte med `npm run poc` hver gang.

### Neste steg etter POC

Hvis POC-en lykkes:
1. Pakk inn i Electron med tray-ikon, auto-start, pause-knapp
2. Bytt JSON-fil til better-sqlite3 for offline-kø
3. Implementer batch-sync til backend
4. Implementer matching-regelmotor med hent fra `/agent/rules`
5. Implementer privacy-innstillinger (ekskluderte apper)

Detaljert plan i `../../Sakspilot-Konsept-Arkitektur-Fremdriftsplan-v1.docx`
del 2 og del 3.
