# Søknadsprosess: Tripletex- og Fiken-partner-status

For å bygge direkte API-integrasjon (push av timer/fakturagrunnlag rett til
regnskapssystem) trenger Sakspilot **partner-status** hos hver leverandør.
Dette tar 1-3 uker per leverandør.

## Tripletex

### Steg 1: Søknad (~2 dager arbeid)

1. Gå til https://tripletex.no/partner
2. Klikk **"Bli partner"** → fyll skjema med:
   - Selskapsnavn: Sakspilot (ENK org-nr)
   - Bransje: SaaS / regnskap-integrasjon
   - Beskrivelse: "Workspace for selvstendig næringsdrivende — bygger
     toveis integrasjon for å synke time-entries og kunde-data til Tripletex"
   - Antall kunder per nå: 0 (pilot)
   - Forventet antall kunder år 1: 50-200
3. Last opp:
   - Logo (har — `apps/web/public/icon-512.svg`)
   - Skjermbilder av Sakspilot (ta fra prod via Claude Browser)
   - Personvernerklæring: **https://sakspilot.no/personvern** (live)
   - DPA-mal: **`docs/dpa-mal.md`** — eksporter til PDF og legg ved.
     Fyll inn `{HELENE_ORG_NR}`, `{HELENE_ADRESSE}`, `{HELENE_TELEFON}`
     i Sakspilot-feltene før innsending. Kunde-feltene (`{KUNDE_NAVN}`
     osv) kan stå tomme — Tripletex bruker dokumentet som bevis på at
     vi har formell databehandleravtale på plass overfor egne kunder,
     ikke som signert kontrakt.

### Steg 2: Svar fra Tripletex (3-10 dager)

Tripletex svarer typisk med:
- Godkjent → access til developer portal (test-konto + dokumentasjon)
- Avslag (sjeldent for små partnere — vanligvis bare hvis mistanke om scam)
- Forespørsel om mer informasjon (svar raskt)

### Steg 3: Implementering

Når godkjent, implementer i `apps/api/src/routes/accounting.ts`:

**OAuth 2.0-flow:**
```
GET /accounting/tripletex/oauth/start
  → redirect til Tripletex-login med scope=timesheet:write,project:read
GET /accounting/tripletex/oauth/callback
  → bytter code mot access_token + refresh_token
  → lagrer (kryptert) i AccountingAccount-tabell
```

**Push timeentry:**
```
POST /accounting/tripletex/push-timesheet?month=2026-05
  body: { sakIds: [...] }
  → mapper Sakspilot-TimeEntry → Tripletex /v2/timesheet/entry
  → returnerer { pushed: N, failed: [...] }
```

**Endepunkter vi trenger:**
- `POST /v2/timesheet/entry` — opprett time-entry
- `GET /v2/employee/whoAmI` — verifiser tilkobling
- `GET /v2/project` — hent prosjekter (for mapping)
- `GET /v2/customer` — hent kunder

**Test-miljø:**
- API-base: `https://api-test.tripletex.io/v2/`
- Token-utveksling med session-tokens (NB: ikke standard OAuth Bearer)
- Dokumentasjon: https://tripletex.no/v2-docs/

### Steg 4: Annonser i Tripletex Marketplace

Tripletex har "App Store" hvor godkjente partnere kan listes:
- Logo + beskrivelse + skjermbilder
- Lenke til sakspilot.no/registrer
- Genererer leads gratis (Tripletex-kunder kan oppdage Sakspilot)

---

## Fiken

### Steg 1: Søknad

1. Gå til https://fiken.no/api
2. **Fyll ut "Bli partner"-skjema** (mindre detaljer enn Tripletex)
3. Vent 2-7 dager på godkjenning

### Steg 2: Implementering

Fiken bruker **enklere** OAuth-flow enn Tripletex:
- Standard OAuth 2.0 Bearer
- Single access token (ikke session-tokens som Tripletex)
- API-base: `https://api.fiken.no/api/v2/`

**Endepunkter vi trenger:**
- `POST /companies/:slug/invoice-drafts` — lag faktura-utkast
- `GET /companies/:slug/contacts` — hent kunder
- `POST /companies/:slug/contacts` — opprett kunde
- `GET /companies/:slug/products` — hent fakturalinjer-maler

### Steg 3: Test + lansering

Fiken har test-miljø: `https://api-test.fiken.no/api/v2/`

---

## Estimert tidsbruk

| Aktivitet | Tid |
|-----------|-----|
| Tripletex-søknad | 2 dager arbeid + 1-2 uker venting |
| Tripletex-implementering | 3-5 dager når godkjent |
| Tripletex-testing + lansering | 2 dager |
| **Tripletex totalt** | **~2-3 uker fra start** |
| Fiken-søknad | 0.5 dag arbeid + 2-7 dager venting |
| Fiken-implementering | 2-3 dager |
| Fiken-testing | 1 dag |
| **Fiken totalt** | **~1-2 uker fra start** |

## Anbefalt rekkefølge

1. **Søk Fiken først** (raskere godkjenning + enklere API)
2. **Lanser Fiken-integrasjon** etter ~2 uker
3. **Søk Tripletex parallelt** når Fiken er bygd
4. **Lanser Tripletex** ~4-5 uker fra start

## Stubs som finnes nå

Endpoints i `apps/api/src/routes/accounting.ts`:
- `GET /accounting/tripletex/status` → returnerer `{ connected: false, implementationStatus: "stub" }`
- `POST /accounting/tripletex/oauth/start` → 501
- `POST /accounting/tripletex/push-timesheet` → 501
- Samme for `/accounting/fiken/*`

Frontend kan kalle status-endpoints for å vise "Kommer snart"-meldinger
uten å feile.

## Inntil API er klar

CSV-eksport finnes allerede i `/reports/month.csv` og er **fungerende
mot import-funksjonen i begge systemer**. Brukere kan bruke det i dag.
