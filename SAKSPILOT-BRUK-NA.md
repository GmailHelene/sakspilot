# Bruke Sakspilot uten .exe - for nå

`.exe`-bygget kan vente til du skal distribuere til pilotene (uker unna). Inntil
da kan du bruke Sakspilot direkte. Slik:

## Daglig oppstart (3 dobbeltklikk)

1. **`Start - Sakspilot dev.bat`** - starter API + web (la vinduet stå åpent)
2. **`Start - Sakspilot desktop.bat`** - starter tray-app (la vinduet stå åpent)
3. Åpne **http://localhost:3001** i nettleser

Ferdig. Tray-ikonet dukker opp ved klokken. Du kan gjøre Start arbeidsøkt /
Stopp + rapport derfra.

## Daglig avslutning

- Lukk de to .bat-vinduene (X øverst til høyre), eller:
- Dobbeltklikk **`Stopp alt - Sakspilot.bat`** - dreper alt på én gang

## Snarvei i Start-meny (valgfritt)

Hvis du vil at Sakspilot skal være lett tilgjengelig i Start-menyen uten .exe:

1. Høyreklikk på `Start - Sakspilot desktop.bat` → **Send to → Desktop (create shortcut)**
2. Høyreklikk på snarveien på skrivebordet → **Properties → Change icon...**
3. Pek på `apps\desktop\assets\icon.png` (eller bruk default - Windows aksepterer .png i nyere versjoner)
4. Dra snarveien til **Start-menyen** for å feste den der

Nå har du Sakspilot i Start-menyen som en vanlig app, uten .exe-bygging.

## .exe-bygging når du er klar

`electron-builder` + npm workspaces på Windows er kjent vrient. Når du om uker
skal lage installer til Nicole/piloter, er det tre stier:

1. **Flytt apps/desktop til eget standalone repo** - uten workspaces. Krever
   duplisert package.json + manuell `require('@sakspilot/db')`-fjerning.
2. **Bytt til electron-packager** - enklere enn electron-builder, gir kun en
   .zip eller .exe (ikke installer). Funker bedre med workspaces.
3. **Bygg fra GitHub Actions (Ubuntu/Mac)** - Linux/Mac har færre workspace-
   issues for cross-build til Windows. Lager auto-release ved git tag.

Vi tar dette når det blir aktuelt - det stopper deg ikke nå.

## Hvis noe ikke fungerer

| Symptom | Sjekk |
|---|---|
| Tray-ikon dukker ikke opp | Sjekk `^`-pilen for skjulte ikoner. Hold mus over for å se "Sakspilot" tooltip. |
| `electron is not recognized` | Kjør `npm install --force` i sakspilot-mappa |
| `npm run build:exe` feiler | Forventet for nå (se over). Bruk `npm start` istedenfor. |
| API svarer ikke | Sjekk http://localhost:8001/health i nettleser |
| Web åpner ikke | Sjekk http://localhost:3001 - kan ta 10 sek første gang |
| Database-feil | Sjekk at apps/api/.env har DATABASE_URL fra Neon |
