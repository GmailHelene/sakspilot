# Sakspilot

**Regnskaps- og prosjektverktøy for selvstendig næringsdrivende i Norge.**
Forespørsler → fakturaer → regnskap → MVA-rapport — i ett verktøy, med desktop-agent
for passiv tidsregistrering og varsler.

## Modenhets-status (ærlig vurdert, 3. juni 2026)

**Avansert pilot/MVP.** Bredt feature-sett som demonstrerer ende-til-ende-flyt,
men ikke produksjonsherdet på alle akser. Hva det betyr i praksis:

| Aspekt | Tilstand |
|---|---|
| Funksjonsbredde | ✅ Real — 25+ sider/features fungerer |
| Datamodell | ✅ Solid — multi-tenant, indekser, audit-log |
| Sikkerhets-fundament | ✅ Bra — tenant-filter, bcrypt, AES-256, rate-limit |
| Sikkerhets-herding | ✅ JWT i cookie, konstant-tid forgot-password, fail-closed token-revokering. Gjenstående: PDF-DoS-isolasjon, paginering. Se `docs/SECURITY-NOTES.md` |
| Testdekning | 🟡 Penger + krypto dekket — 8 testfiler, 153 tester (4 nye 3/6). DB-integrasjonstester eksisterer men krever Neon. UI/E2E mangler |
| Skalering | ⚠️ Ingen paginering — fungerer for piloter, ikke 5k+ poster |
| Hosting | ⚠️ Render Free-tier (kaldstart 30-60 sek) — må oppgraderes til Starter for betalende |
| Code-signing | 🔴 Ingen — Mac/Windows-brukere må bekrefte "ikke verifisert" |

**Egnet for:** lukkede piloter, egen bruk, demo, MVP-validering.
**Ikke egnet for:** offentlige innkjøp, regulert bransje uten ekstra herding, store team.

Se [`docs/STATUS-2026-06-03.md`](docs/STATUS-2026-06-03.md) for funksjonsoversikt og
[`docs/SECURITY-NOTES.md`](docs/SECURITY-NOTES.md) for kjente sikkerhetsgap.

- **Web:** https://sakspilot.no (Vercel)
- **API:** https://api.sakspilot.no (Render)
- **Database:** Neon Postgres (eu-central-1)
- **Desktop:** `apps/desktop/release/Sakspilot-win-x64.zip` (GitHub Releases — versjonsløs URL følger seneste)

## Hva er ferdig

| Område | Status |
|---|---|
| Auth + multi-tenant | ✅ |
| Prosjekt-CRM med kanban + tabell + Gantt | ✅ |
| Klistrelapper (m/reminder + voice notes) | ✅ |
| Agenter (Monday/Notion-stil) | ✅ |
| Tidsregistrering (desktop-agent + auto-spor) | ✅ |
| Multi-tab snarveier + native always-on-top widget | ✅ |
| Pomodoro-timer i tray | ✅ |
| AI-assistent (Claude Sonnet 4.5, chat-historie per prosjekt) | ✅ |
| AI rate-limit per org (500/mnd, pilot 5000) | ✅ |
| AI auto-triage av ukategoriserte timer | ✅ |
| Outlook-integrasjon (MS Graph) | ✅ |
| Fiken faktura (PAT + OAuth-klient klar) | ✅ |
| Faktura-PDF (pdfkit, norsk MVA-template) | ✅ |
| Rapport-PDF | ✅ |
| iCal-feed (Google/Apple/Outlook) | ✅ |
| Tripletex CSV | ✅ (direkte API venter på partner) |
| GDPR (innsyn / sletting / DPA-mal) | ✅ |
| Bransje-onboarding (9 bransjer) | ✅ |
| Tema-velger + mørk modus | ✅ |
| Tids-mål per uke/mnd m/widget | ✅ |
| Mobil-kanban (touch status-modal) | ✅ |
| Sidebar Mine sites + Mine mapper (cloud-sync) | ✅ |
| Pilot-pricing (gratis ut 2026) | ✅ |
| Pilot-feedback-form (/feedback) | ✅ |
| Brevo SMTP + onboarding-drip (dag 0/3/7/14) | ✅ |
| Sentry (EU-region) | ✅ |
| GitHub Releases + versjonsløs download-URL | ✅ |
| GitHub Actions: daglig automasjons-trigger + DB-backup | ✅ |
| Team-plan med invite-flyt | ✅ |
| Klient-portal med login (`/portal/*`) | ✅ |
| Custom domener (whitelabel) | ✅ |
| Mac + Linux desktop build-pipeline | ✅ (auto via GitHub Actions) |
| Klistrelapp-reminders (in-app + native) | ✅ |
| Voice notes på klistrelapper | ✅ |
| Demo-video på forsiden | ✅ |
| **Forespørsler (lead-pipeline, kanban + DnD + inline-rediger)** | ✅ NY (3. juni) |
| **Fakturaer (full CRUD, send-epost, purring 1/2/3-trinns)** | ✅ NY (3. juni) |
| **Regnskap (utgifter, kvittering-upload, bank-CSV-import)** | ✅ NY (3. juni) |
| **MVA-rapport (Q1-Q4 / H1-H2 / år + PDF)** | ✅ NY (3. juni) |
| **Statistikk (tverrgående KPIer)** | ✅ NY (3. juni) |
| **Klient-portal fakturaer-fane** | ✅ NY (3. juni) |
| **Søk overalt (forespørsler/fakturaer/utgifter/klienter/saker)** | ✅ NY (3. juni) |
| **Sidebar-collapse "Mer..."** | ✅ NY (3. juni) |
| **Mobil-faktura-kort under 700px** | ✅ NY (3. juni) |
| **Native Windows-toast for nye leads (m/lyd)** | ✅ NY (3. juni) |
| **Auto-badges på Launcher (Gmail "Inbox (3)" detekteres)** | ✅ NY (3. juni) |
| **Manuelle badges (høyreklikk → popover)** | ✅ NY (3. juni) |
| **Brevo HTTPS API (Render Free-tier-kompatibel)** | ✅ NY (3. juni) |
| **PDF rate-limit (30/min)** | ✅ NY (3. juni) |
| **Custom ConfirmDialog (Esc/Enter)** | ✅ NY (3. juni) |
| **Tastatursnarveier (Ctrl+K + g-prefiks)** | ✅ NY (3. juni) |
| AWS Bedrock-provider | 🟡 stub klar |
| Stripe checkout | 🔴 Q1 2027 |
| Tripletex direkte (krever partner) | 🔴 venter |
| macOS code-signing | 🟡 trenger Apple Dev cert ($99/år) |

## Struktur

```
sakspilot/
├── apps/
│   ├── api/          Express + Prisma backend (TypeScript)
│   ├── web/          Next.js 14 web-app
│   └── desktop/      Electron-agent for vinduslogging
└── packages/
    └── db/           Prisma-skjema (delt mellom api og desktop)
```

## Kom i gang (lokalt)

### 1. Installer

```bash
npm install
```

### 2. Sett opp `apps/api/.env`

Kopier `apps/api/.env.example` til `apps/api/.env` og fyll inn:
- `DATABASE_URL` + `DIRECT_URL` (Neon Postgres)
- `JWT_SECRET` (random 64-tegn streng)
- `ENCRYPTION_KEY` (64 hex tegn — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ANTHROPIC_API_KEY` (valgfritt for lokal dev)

### 3. Sett opp DB

```bash
cd apps/api
npx prisma db push --schema=../../packages/db/prisma/schema.prisma
npx prisma generate --schema=../../packages/db/prisma/schema.prisma
```

### 4. Kjør

```bash
# API (port 8001)
cd apps/api && npm run dev

# Web (port 3000)
cd apps/web && npm run dev

# Desktop (i tray)
cd apps/desktop && npm start
```

### 5. Bygg desktop-app

```bash
cd apps/desktop && npm run build:exe
# Output: apps/desktop/release/Sakspilot-0.0.1-win-x64.zip
```

## Dokumenter

- **[Status pr 3. juni 2026](docs/STATUS-2026-06-03.md)** — siste snapshot (27 nye fixes på én dag, fullt feature-sett dokumentert)
- [Status pr 1. juni 2026](docs/STATUS-2026-06-01.md) — forrige snapshot
- [Status pr 31. mai 2026](docs/STATUS-2026-05-31.md) — eldre snapshot
- [Status pr 28. mai 2026](docs/STATUS-2026-05-28.md) — eldre snapshot
- [Neste steg + roadmap](docs/NESTE-STEG.md) — hva som gjenstår og prioritering
- [Pilot-invitasjon til Nicole](docs/pilot-epost-nicole.md) — 3 versjoner
- [Bruksanvisning for ansvarlig søker](docs/nicole-bruksanvisning-byggesak.md) — vedlegg til Nicole
- [LinkedIn-post (3 versjoner)](docs/linkedin-post.md) — lansering
- [FB-post WordPress Norge](docs/post-fb-wp-norge.md) — rekruttering av testbrukere
- [GDPR / DPA-sjekkliste](docs/dpa-sjekkliste.md)
- [DPA-mal (databehandleravtale)](docs/dpa-mal.md)
- [Personvern desktop-agent](docs/personvern-desktop-agent.md) — inkl. auto-spor
- [Tripletex/Fiken partner-søknad](docs/tripletex-fiken-soknad.md)
- [Test-programmet](TEST-PROGRAMMET.md) — 15-min ende-til-ende sjekkliste
- [Setup-guide (første gang)](SETUP-GUIDE.md) — lokal dev fra null

## Lisens

Privat / proprietær. © Helene Åsheim Grønberg / helene.cloud 2026.
