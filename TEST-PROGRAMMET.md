# Test Sakspilot lokalt — komplett sjekkliste

Slik tester du alt som er bygget så langt. Tar ca. 15 minutter.

## Start systemet (2 min)

I én terminal — start API + web:
```bash
cd C:\Users\helen\Desktop\sakspilot
npm run dev
```

Vent til du ser:
```
🚀 Sakspilot API kjører på http://localhost:8001
   ▲ Next.js 14.2.5  - Local: http://localhost:3001
```

I en annen terminal (eller dobbeltklikk .exe i `apps\desktop\release\Sakspilot-win32-x64\`):
```bash
cd C:\Users\helen\Desktop\sakspilot\apps\desktop
npm start
```

## Sjekk 1: /hjem-dashbord (3 min)

Åpne **http://localhost:3001/hjem** i nettleser.

- [ ] Tidsbasert hilsen ("God ettermiddag, Helene!" eller liknende)
- [ ] 4 KPI-kort på toppen: Aktive saker, Timer denne uka, Frister i dag, Forsinket
- [ ] Widget "Kommende frister" — viser dine forsinkede/i-dag/uka frister
- [ ] Widget "Nylige saker" — liste av siste saker
- [ ] Widget "Hurtighandlinger" — 4 knapper (Ny sak, Ny klient, Kalender, Tidslinje)
- [ ] Widget "Tips for dagen" — kontekstuelle gule tips

Hvis du har 0 saker: KPI-er viser "—" eller "0", widgets viser tom-tilstand.

## Sjekk 2: Venstre launcher (1 min)

På venstre kant skal det være en smal mørk-blå kolonne med 12 brand-logoer:
- [ ] Outlook, Gmail, Teams, Slack
- [ ] Google Kalender
- [ ] Tripletex, Fiken
- [ ] Holte
- [ ] GitHub, ChatGPT, Claude
- [ ] Google Drive
- [ ] + knapp nederst
- [ ] Hover viser tooltip med app-navn
- [ ] Klikk åpner appen i ny fane
- [ ] Høyreklikk fjerner appen

## Sjekk 3: Sidebar med snarveier (2 min)

220px-bred sidebar til høyre for launcheren:

- [ ] Seksjon "Sakspilot" med 5 ikoner: Hjem, Saker, Klienter, Kalender, Tidslinje
- [ ] Klikk hver — du navigerer mellom sidene
- [ ] Aktiv side er markert med mørk-blå bakgrunn
- [ ] Seksjon "Mine snarveier" med 6 forhåndskonfigurerte
- [ ] Klikk `+` → fyll inn emoji + navn + URL → klikk "Lagre snarvei"
- [ ] Din nye snarvei vises i listen
- [ ] Hover viser slett-knappen (kurv)
- [ ] Slett virker

## Sjekk 4: Saker — Kanban + Tabell (3 min)

Navigér til **Saker** i sidebar.

- [ ] Øverst til høyre: toggle mellom "▦ Kanban" og "☰ Tabell"
- [ ] **Kanban-visning:** 5 kolonner (Ikke påbegynt → Pågår → Venter på kunde → Venter på 3.part → Ferdig)
- [ ] Saker vises som kort i riktige kolonner
- [ ] Klikk et kort → detaljvisning
- [ ] **Tabell-visning:** rader med Sak, Klient, Status, Frist, Sats, Timer
- [ ] Klikk kolonneoverskrifter for å sortere (▲/▼)
- [ ] Klikk rad → åpner sak
- [ ] Forsinkede saker har rød frist-tekst

Hvis ingen saker: tom-tilstand med "+ Opprett første sak"-knapp.

## Sjekk 5: Opprett sak + klient (3 min)

- [ ] Sidebar → **Klienter** → "+ Ny klient" → fyll inn → Opprett
- [ ] Klienten dukker opp i listen
- [ ] Sidebar → **Saker** → "+ Ny sak" → fyll inn (velg klienten, sett frist, sats)
- [ ] Klikk på saken → detaljvisning
- [ ] Endre status via dropdown → den oppdateres
- [ ] **Matching-regler:** klikk "⚡ Velg mal" → klikk "Auto: match sakens navn (fleksibel)" → Lagre regel
- [ ] **Frister:** klikk "+ Legg til frist" → fyll inn → Lagre
- [ ] Sjekk at frist nå vises i kalender (sjekk 6)

## Sjekk 6: Kalender (1 min)

Sidebar → **Kalender**.

- [ ] Måneds-grid med 7 dager (Man-Søn)
- [ ] Frister og milepæler vises som fargede strimler
- [ ] Rød = sak-frist, gull = milepæl, grå = fullført
- [ ] I dag er markert med blå sirkel rundt datoen
- [ ] ← / → knapper for å bytte måned
- [ ] "I dag"-knappen hopper tilbake til denne måneden
- [ ] Klikk hendelse → hopper til saken

## Sjekk 7: Gantt (1 min)

Sidebar → **Tidslinje**.

- [ ] Horisontal tidslinje med måneds-markører på toppen
- [ ] Rød vertikal linje markerer "i dag"
- [ ] Hver sak = en bjelke med status-fargekoding
- [ ] Forsinkede saker har rød kant
- [ ] Klikk bjelke → åpner saken

## Sjekk 8: Desktop-app — tray + dashbord (3 min)

I trayen (nederst til høyre, evt. under ^):

- [ ] Sakspilot-ikonet er der (navy-gul trekant)
- [ ] Hover viser "Sakspilot"
- [ ] Høyreklikk → meny
  - [ ] "Start arbeidsøkt"
  - [ ] "Åpne dashbord (i Sakspilot)"
  - [ ] "Åpne i nettleser"
  - [ ] "Innstillinger"
  - [ ] "Logg ut"
  - [ ] "Avslutt"
- [ ] Klikk **"Åpne dashbord"** → Sakspilot-vinduet med web-UI dukker opp
- [ ] Vinduet viser samme som localhost:3001 men inne i et eget program

## Sjekk 9: Arbeidsøkt + rapport (5 min)

For å teste den passive logging:

1. Dobbeltklikk tray-ikonet (åpner settings-vinduet)
2. Klikk **▶ Start arbeidsøkt**
3. Jobb i 2-3 minutter — bytt mellom apper (Word, Outlook, nettleser)
4. Hvis du har en sak med matching-regler: åpne en fil/side som matcher → sjekk at tray-menyen viser "🎯 Logger: [saksnavn]"
5. Klikk **■ Stopp + rapport**
6. Velg hvor Excel-fila lagres (default: Dokumenter)
7. Åpne fila — du skal se 4 ark:
   - **Sammendrag** — totaltid, beløp
   - **Per sak** — fakturagrunnlag
   - **Per applikasjon** — tid per program
   - **Detaljer** — hver enkelt vindusperiode

Hvis du har 0 matching-regler: tiden går til "ikke-matchet" og du ser fortsatt totaltall + per-app, bare ikke per-sak.

## Sjekk 10: Synk fra desktop → web (1 min)

Etter en arbeidsøkt:
- [ ] I tray-menyen, klikk **"🔄 Synk til backend"**
- [ ] Vent 2 sek → "Ikke synket" antall går til 0
- [ ] Åpne en sak i web-dashbordet
- [ ] Under "Tidssammendrag" skal du nå se entries fra desktop-økten
- [ ] Total tid + beløp regnes ut

## Hvis noe ikke fungerer

| Problem | Sjekk |
|---|---|
| Sider er hvite/tomme | `npm run dev` kjører? Sjekk terminal. |
| "Kunne ikke koble til serveren" | Åpne `http://localhost:8001/health` — får du JSON? |
| Tray-ikon vises ikke | Sjekk under ^ for skjulte ikoner. Hvis ikke der: avslutt + start på nytt. |
| Matching-regel matcher ikke | Filnavnet ditt må inneholde sakens nøkkelord. F.eks. lagre Word-fil som "Bygdoy-12-notat.docx", ikke "notat.docx". |
| Sak-detaljside har ikke sidebar | Riktig — den siden bruker fortsatt gammel layout. Fikses neste runde. |

## Etter testing — hva sier du?

Hvis alt fungerer som forventet:
- ✅ Klar for Railway-deploy (se RAILWAY-DEPLOY.md)
- ✅ Klar for å vise Nicole

Hvis noe ikke funker eller du har innspill:
- Si fra hva du så — så fikser vi det først
