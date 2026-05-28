# DPA-sjekkliste for Sakspilot

Underdataprosessor-oversikt + tiltak du må gjøre FØR første betalende kunde.
Oppdater når nye tjenester legges til.

## Sakspilots dataflyt (oversikt)

```
Bruker (selvstendig næringsdrivende)
   │
   ├─→ Sakspilot.exe (lokalt, Windows) — vindustittel-logging
   │       │
   │       └─→ POST /agent/sync ─→ Sakspilot API (Render, Frankfurt)
   │                                    │
   │                                    └─→ Neon Postgres (Frankfurt, EU)
   │
   ├─→ sakspilot.no (browser, EU) ─→ Sakspilot API ─→ Neon
   │       │
   │       ├─→ AI-assistent ─→ Anthropic API (USA*)
   │       │                       *kan settes til EU-only
   │       │
   │       ├─→ Outlook-integrasjon ─→ Microsoft Graph (EU)
   │       │
   │       └─→ Umami analytics ─→ Umami Cloud (EU)
   │
   └─→ Sluttkunde (klient til SN) ─→ /delt/[token] ─→ Sakspilot API
```

## Underdataprosessorer

| Tjeneste | Hva behandles | Region | DPA tilgjengelig |
|----------|---------------|--------|------------------|
| **Neon Postgres** | All app-data (saker, klienter, tid, e-poster) | EU (Frankfurt) | https://neon.tech/legal/dpa |
| **Render** | API-host + logs | EU (Frankfurt) | https://render.com/legal/dpa |
| **Vercel** | Web frontend + statiske assets | Global (CDN) | https://vercel.com/legal/dpa |
| **Microsoft Graph** | Outlook-emner + brødtekst-utdrag | EU (når kunden har 365 EU-tenant) | Microsoft Online Services DPA |
| **Anthropic Claude** | Sak-kontekst sendt til AI | USA (default) | https://www.anthropic.com/legal/dpa |
| **Umami Cloud** | Sidevisninger + custom events | EU | https://umami.is/legal/dpa |

## ⚠️ Aksjonsliste FØR første betalende kunde

### Anthropic — viktigst
- [ ] **Aktiver Zero Data Retention** i Anthropic Console → Settings → Privacy
  - Uten dette beholder Anthropic prompts i opptil 30 dager for moderering
  - Med ZDR: prompts slettes etter respons er generert
- [ ] **Skriv DPA med Anthropic** (gratis nedlasting fra deres juridiske side)
- [ ] **Eller**: koble til Anthropic via Vertex AI / AWS Bedrock for å holde data i EU
- [ ] **Dokumenter** i personvernserklæringen at sak-data sendes til Anthropic i USA

### Microsoft Graph
- [ ] **Brukeren samtykker** ved OAuth-godkjenning (innebygd)
- [ ] **Sjekk om enterprise-tenant** — hvis EU 365-konto er data EU-only
- [ ] **Dokumenter retention** for cached e-posttema i Sakspilot (slett etter 90 dager?)

### Neon Postgres
- [x] EU-region (Frankfurt) ✅
- [x] DPA inkludert i deres terms ✅
- [ ] **Sett opp daglig backup-policy** (Neon: automatisk på Pro-plan)
- [ ] **Krypter sensitive felt** i hvile (Neon krypterer alle disker)

### Umami Cloud
- [x] EU-host ✅
- [x] Ingen cookies (samtykke-fritt) ✅
- [ ] **Sjekk** at vi ikke sender PII i custom events (vi gjør ikke det per `analytics.ts`)

### Render
- [x] EU-region ✅
- [x] Logs ikke inneholder PII (vi logger e-postadresser i auth — bør anonymiseres)
- [ ] **TODO:** Mask e-post i `[Auth] Innlogget: helene721@gmail.com` → `helene721@***`

### Vercel
- [x] DPA inkludert ✅
- [ ] **Sjekk** at miljøvariabler (DATABASE_URL osv.) er kun "Encrypted" i Vercel UI
- [ ] **Sjekk** at preview-deploys ikke leker secrets (Vercel skjuler dem default)

## Personvernserklæring (lager: TODO)

Må publiseres på sakspilot.no/personvern før første betalende kunde:
- Hvem vi er (Helene Åsheim Grønberg, ENK org-nr)
- Hva vi samler (cross-ref med personvern-desktop-agent.md)
- Hvor det lagres (EU-tabell over)
- Underdataprosessorer (denne fila)
- Brukerrettigheter (innsyn, sletting, klage)
- Kontaktinfo

## Databehandleravtale med kundeorganisasjonen

For bedriftskunder (ikke privatpersoner):
- [ ] **Tilby DPA-mal** ved registrering — egen sjekkboks "Vi er databehandler for klientdata"
- [ ] **Sub-prosessor-liste** lenkes fra avtalen
- [ ] **30-dagers varsel** ved endring av sub-prosessorer

## DPIA (Data Protection Impact Assessment)

Skal lages før vi går live med betalende kunder fordi:
- Vi behandler personopplysninger systematisk (klient-info, vindustitler)
- Vi bruker AI på klientdata
- Vi har desktop-agent som "monitorerer arbeidsplass"

**Sjekkliste i Datatilsynets DPIA-mal:**
- Beskrivelse av behandling: ✓ (denne fila + personvern-desktop-agent.md)
- Vurdering av nødvendighet
- Vurdering av risikoer
- Tiltak for å redusere risiko (ende-til-ende-krypt, samtykke, retention)

Templat: https://datatilsynet.no/personvern-pa-arbeidsplassen/dpia/

## Mailprosessor

Vi sender e-poster fra sakspilot (registrering, glemt passord, fakturapåminnelser):
- **TODO:** Velg leverandør (Brevo / Postmark / Resend) — alle har EU-region
- **TODO:** DPA med valgt leverandør
- **TODO:** SPF + DKIM på `sakspilot.no`
