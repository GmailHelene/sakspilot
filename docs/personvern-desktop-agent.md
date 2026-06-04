# Personvern - Sakspilot Desktop-agent

Dokumentasjon av hva desktop-agenten faktisk samler, hvordan det lagres,
og hva som sendes til serveren. Skal vises til pilotbrukere ved oppstart
og inngå i GDPR-dokumentasjon (DPIA).

## Hva agenten ser

Hvert 15. sekund (default `intervalSec`):

| Type | Eksempel | Bruk |
|------|----------|------|
| **Vindustittel** | `"Bygdøy 12 - rammetillatelse.docx - Word"` | Matching mot sak via brukerens regex-regler |
| **Applikasjonsnavn** | `"WINWORD.EXE"` | Filtrere bort spam (excludedApps) |
| **Filsti hvis åpen** | `"C:\Jobb\Bygdøy12\søknad.docx"` | Matching mot sak |
| **Tidsstempel** | `2026-05-28T14:23:10Z` | Beregne varighet |

I tillegg - KUN når **Auto-spor** er slått på (se egen seksjon):

| Type | Eksempel | Bruk |
|------|----------|------|
| **URL/sti som åpnes via Sakspilot** | `"https://mail.google.com/"` eller `"C:\Programs\Cyberduck.exe"` | Logges som session attribuert til aktiv sak |
| **Label på snarvei** | `"Gmail"` | Vises i rapport |

Disse fanges kun fordi Sakspilot selv initierte åpningen (klikk i Launcher/Mine sites/Mine mapper). Ingenting overvåkes utenom - det er fortsatt poller-mekanismen over som kun ser aktivt vindu.

Agenten ser **IKKE**:
- ❌ Skjermbilder
- ❌ Tastetrykk eller innhold som skrives
- ❌ Innholdet i dokumenter / e-poster
- ❌ Bilder, video, lyd
- ❌ Nettleser-historikk
- ❌ Andre brukeres aktivitet

## Personopplysninger

Vindustittel kan inneholde personopplysninger (klient-navn, e-postemne).
Dette må håndteres som personopplysninger iht. GDPR.

**Eksempel:** `"Outlook - Re: Bygdøy 12 - Kari Nordmann (kari@nordvik.no)"`

Vi handterer ved:
1. **Klient-samtykke** - kunden av selvstendig næringsdrivende (klienten) gir samtykke implisitt når kontaktinfo registreres i Sakspilot
2. **Berettiget interesse** - selvstendig næringsdrivende trenger å spore arbeidstid mot sak for korrekt fakturering
3. **Minimal lagring** - kun det som faktisk matchet en sak. Ikke-matchede entries kan slettes etter 30 dager (settes i konfig).

## Hvor data lagres

| Lokasjon | Hva | Når |
|----------|-----|-----|
| **Lokalt på din PC** | Pending sessions (ikke-synket) | Inntil du klikker "Synk" eller hver 5. min |
| **Sakspilot-server (Neon, Frankfurt)** | Synkede TimeEntry-records | Permanent (inntil bruker sletter sak eller konto) |
| **Audit-logg** | Hver gang sessions synces | 12 måneder, deretter slettes automatisk |

Ingen tredjepart får data automatisk. Outlook-integrasjonen sender e-poster
til Microsoft Graph KUN når brukeren manuelt kobler kontoen.

## Samtykke-flow (anbefalt i .exe)

Ved første oppstart skal brukeren se:

> **Tillat tidsregistrering?**
>
> Sakspilot Desktop logger hvilket vindu du har aktivt hvert 15. sekund.
> Dette inkluderer vindustittel og applikasjonsnavn - som kan inneholde
> klient-navn fra dokumenter eller e-poster.
>
> ✅ **Det vi gjør:** sender til din egen Sakspilot-konto for matching mot sak
> ❌ **Det vi IKKE gjør:** skjermbilder, tastetrykk, innhold, video, lyd
>
> Du kan stoppe når som helst (tray → Stopp) og slette all logget tid fra
> Innstillinger → Sikkerhet → Slett mine data.
>
> [ ] Jeg samtykker til at Sakspilot logger vindustittel + appnavn
> [ ] Jeg har gjort klienter oppmerksom på dette der nødvendig
>
> [ Avbryt ]   [ Aksepter og start ]

**TODO:** Implementere denne dialogen i .exe ved første start (ikke gjort enda).

## Auto-spor (én bryter, fra mai 2026)

I tray-menyen og web-widgeten finnes nå en enkel **🎯 Auto-spor PÅ/AV**-bryter. Når **PÅ**:

1. **Arbeidsøkt startes automatisk** når Sakspilot åpnes (eller når du åpner noe via Sakspilot)
2. **Alle ting du åpner via Sakspilot** (Launcher-snarvei, Mine sites, Mine mapper, lokale .exe-snarveier, eksterne lenker) logges som session
3. **Sessions attribueres til "aktiv sak"** - den siste saken du har åpnet `/saker/[id]` i web-appen. Hvis ingen aktiv sak: `sakId=null` (kan tilordnes senere).

**Hva auto-spor IKKE gjør:**
- ❌ Logger ikke ting du åpner utenfor Sakspilot (f.eks. via Windows Start-meny eller filutforsker direkte). Det fanges fortsatt kun via poller-mekanismen (vindustittel + applikasjonsnavn).
- ❌ Sender ikke skjermbilder, tastetrykk eller innhold.
- ❌ Starter ikke logging automatisk hvis brukeren har slått **AV** bryteren.

**Personvernkonsekvens:** Auto-spor reduserer behovet for matching-regler, men endrer ikke fundamentalt hva som logges. URL-en/stien til det du åpner via Sakspilot lagres som `title`-feltet i `TimeEntry` - samme datatype som vindustittel allerede gjør. Bryteren er bevisst **AV som standard** - bruker må aktivt slå den på.

**Hvor det logges:**
- Lokalt i electron-store: `autoTrackOpened` (bool), `activeSakId` (uuid), `activeSakTitle` (string) - i `%APPDATA%\sakspilot\config.json`
- Som vanlig session via `/agent/sync` til Sakspilot-server, samme retention som øvrige TimeEntries

## Retention-policy (default)

| Data | Slettes etter |
|------|---------------|
| Ikke-matchede TimeEntries | 30 dager (konfigurerbart) |
| Matchede TimeEntries | Aldri - del av fakturerings-historikk |
| Audit-logg | 12 måneder |
| Klistrelapper | Til bruker sletter manuelt |
| Slettede saker | 30 dager soft-delete, så hard delete |
| Brukerens konto ved sletting | Umiddelbart (cascade på alle relasjoner) |

## Slett mine data (GDPR §17)

Brukeren kan når som helst:
1. **Innstillinger → Sikkerhet → Slett kontoen** - sletter alt
2. **Per sak: Slett** - sletter saken + alle tilknyttede entries
3. **Tray-meny → Stopp arbeidsøkt** - stopper ny logging (tidligere data består)

## Eksporter mine data (GDPR §15/§20)

**Innstillinger → Sikkerhet → Eksporter alle mine data** - gir en JSON-fil med:
- Profil + organisasjon
- Alle klienter
- Alle saker + milepæler + matching-regler
- Alle TimeEntries
- Audit-logg
- Klistrelapper
- Outlook-koblinger (uten access-tokens)

## Klage-mulighet

Brukerens klientorganisasjon eller sluttkunden kan kontakte:
**helene721@gmail.com** (databehandler) - vi videresender til behandlingsansvarlig.

Brukeren har klagerett til Datatilsynet: https://datatilsynet.no/personvern/klage/
