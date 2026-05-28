# Sakspilot

Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering,
Outlook-integrasjon, AI-assistent og Fiken-faktura — i ett verktøy.

## Status (28. mai 2026)

✅ **Funksjonelt komplett for pilotbruk.** Web + API + desktop-agent live i prod.

Se [`docs/STATUS-2026-05-28.md`](docs/STATUS-2026-05-28.md) for fullstendig status.

- **Web:** https://sakspilot.no (Vercel)
- **API:** https://api.sakspilot.no (Render)
- **Database:** Neon Postgres (eu-central-1)
- **Desktop:** `apps/desktop/release/Sakspilot-0.0.1-win-x64.zip`

## Hva er ferdig

| Område | Status |
|---|---|
| Auth + multi-tenant | ✅ |
| Sak-CRM med kanban | ✅ |
| Klistrelapper / kalender / Gantt | ✅ |
| Agenter (Monday/Notion-stil) | ✅ |
| Tidsregistrering (desktop-agent) | ✅ |
| Outlook-integrasjon (MS Graph) | ✅ |
| AI-assistent (Claude Sonnet 4.5) | ✅ |
| Fiken faktura (PAT-basert) | ✅ |
| Tripletex CSV | ✅ (direkte API venter på partner) |
| GDPR (innsyn / sletting / DPA) | ✅ |
| Bransje-onboarding (9 bransjer) | ✅ |
| Tema-velger (3 fargesett) | ✅ |
| Sidebar Mine sites | ✅ |
| Pilot-pricing (gratis ut 2026) | ✅ |
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

- [Status pr 28. mai 2026](docs/STATUS-2026-05-28.md) — faktisk tilstand i prod
- [Pilot-invitasjon til Nicole](docs/pilot-epost-nicole.md) — 3 versjoner
- [Bruksanvisning for ansvarlig søker](docs/nicole-bruksanvisning-byggesak.md) — vedlegg til Nicole
- [FB-post WordPress Norge](docs/post-fb-wp-norge.md) — rekruttering av testbrukere
- [GDPR / DPA-sjekkliste](docs/dpa-sjekkliste.md)
- [Personvern desktop-agent](docs/personvern-desktop-agent.md)
- [Tripletex/Fiken partner-søknad](docs/tripletex-fiken-soknad.md)

## Lisens

Privat / proprietær. © Helene Åsheim Grønberg / helene.cloud 2026.
