# Sakspilot

Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering,
Outlook-integrasjon, AI-assistent og Fiken-faktura — i ett verktøy.

## Status (31. mai 2026)

✅ **Funksjonelt komplett for pilotbruk.** Web + API + desktop-agent live i prod.

Se [`docs/STATUS-2026-05-31.md`](docs/STATUS-2026-05-31.md) for fullstendig status.

- **Web:** https://sakspilot.no (Vercel)
- **API:** https://api.sakspilot.no (Render)
- **Database:** Neon Postgres (eu-central-1)
- **Desktop:** `apps/desktop/release/Sakspilot-win-x64.zip` (GitHub Releases — versjonsløs URL følger seneste)

## Hva er ferdig

| Område | Status |
|---|---|
| Auth + multi-tenant | ✅ |
| Sak-CRM med kanban | ✅ |
| Klistrelapper / kalender / Gantt | ✅ |
| Agenter (Monday/Notion-stil) | ✅ |
| Tidsregistrering (desktop-agent) | ✅ |
| **Auto-spor: ÉN bryter, alt åpnet via Sakspilot telles** | ✅ NY |
| Multi-tab snarveier (BrowserView) | ✅ |
| Outlook-integrasjon (MS Graph) | ✅ |
| AI-assistent (Claude Sonnet 4.5) | ✅ |
| Fiken faktura (PAT + OAuth-klient klar) | ✅ |
| Tripletex CSV | ✅ (direkte API venter på partner) |
| GDPR (innsyn / sletting / DPA-mal) | ✅ |
| Bransje-onboarding (9 bransjer) | ✅ |
| Tema-velger (3 fargesett, CSS-vars) | ✅ |
| Sidebar Mine sites + Mine mapper (cloud-sync) | ✅ |
| Launcher med eget ikon-opplasting | ✅ |
| Pilot-pricing (gratis ut 2026) | ✅ |
| Brevo SMTP for glemt-passord | ✅ |
| Sentry (EU-region, prod-aktiv) | ✅ |
| GitHub Releases + versjonsløs download-URL | ✅ |
| AWS Bedrock-provider | 🟡 stub klar |
| Stripe checkout | 🔴 Q1 2027 |

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

- [Status pr 31. mai 2026](docs/STATUS-2026-05-31.md) — faktisk tilstand i prod
- [Status pr 28. mai 2026](docs/STATUS-2026-05-28.md) — forrige snapshot
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
