# Sakspilot

Workspace for selvstendig næringsdrivende. Sak-CRM, passiv tidsregistrering,
Outlook-integrasjon og faktura — i ett verktøy.

## Status

Fase 1 — MVP-kjerne (uke 3–8). Backend-skjelett under bygging.

Se `../byggpilot-node/Sakspilot-Konsept-Arkitektur-Fremdriftsplan-v1.docx`
for fullstendig plan.

## Struktur

```
sakspilot/
├── apps/
│   ├── api/          Express + Prisma backend (TypeScript)
│   ├── web/          Next.js 14 web-app (kommer i uke 4)
│   └── desktop/      Electron-agent for vinduslogging (kommer i uke 5)
└── packages/
    └── db/           Prisma-skjema (delt mellom api og desktop)
```

## Kom i gang (når du er klar)

### 1. Installer avhengigheter

```bash
cd C:\Users\helen\Desktop\sakspilot
npm install
```

### 2. Sett opp Postgres-database

**Anbefalt: Neon (gratis 0.5GB, EU Frankfurt, ingen pause-straff)**

1. Opprett prosjekt på https://neon.tech (region: EU Central / Frankfurt)
2. `Connection Details` → kopier **Pooled connection** som `DATABASE_URL`
3. Kopier **Direct connection** som `DIRECT_URL`
4. Lag `apps/api/.env` (kopier fra `.env.example`), lim inn begge URL-er
5. Generer JWT_SECRET:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

**Alternativ: Railway Postgres** — bruk hvis du allerede er på Railway Hobby.
Sett `DATABASE_URL = DIRECT_URL =` samme connection-string fra Railway.

### 3. Migrer databasen

```bash
npm run db:generate
npm run db:migrate
```

### 4. Start API

```bash
npm run dev:api
```

API kjører på http://localhost:8001 (port 8001 for å ikke kollidere med
ByggPilot på 8000).

### 5. Test

```bash
# Helse
curl http://localhost:8001/health

# Register
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"helene@helene.cloud","password":"Test12345!","name":"Helene"}'

# Login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"helene@helene.cloud","password":"Test12345!"}'
```

## Tech stack

- **Backend:** Node.js 20+, Express 4, TypeScript 5, Prisma 5
- **Database:** PostgreSQL via Supabase (EU/Irland)
- **Auth:** JWT + bcrypt
- **Frontend:** Next.js 14 + React 18 + TypeScript (kommer)
- **Desktop-agent:** Electron 30 + active-win + better-sqlite3 (kommer)
- **Integrasjoner:** Microsoft Graph (Outlook), Tripletex, Fiken (kommer)
- **Hosting:** Railway (web+API), Supabase (DB)
- **Feillogging:** Sentry 7.x

## Fremdriftsplan (kort)

| Fase | Uke | Innhold | Status |
|------|-----|---------|--------|
| 0 | 1–2 | Validering — 6–8 intervjuer | I gang |
| 1 | 3–8 | MVP-kjerne (timer + sak) | Backend skjelett startet |
| 2 | 9–12 | Outlook + faktura + polish | — |
| 3 | 13–16 | Pilot med 5 betalende brukere | — |
| 4 | 17–20 | Soft launch | — |

## Lisens

Privat / proprietær — Helene Åsheim Grønberg / Tech Solutions.
