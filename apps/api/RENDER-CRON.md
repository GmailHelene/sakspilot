# Render Cron Jobs for Sakspilot API

Denne fila beskriver hvordan vi skedulerer bakgrunnsjobber for Sakspilot på Render.

## Daglig automasjons-trigger

**Script:** `src/jobs/dailyAutomationTrigger.ts`
**Kommando:** `npm run job:daily-automations`
**Hva den gjør:** Scanner alle organisasjoner for `milestone_due_soon`-agenter
og kjører de som matcher dagens dato. Erstatter den tidligere lazy-evalueringen
som bare kjørte hvis noen åpnet `/agenter`-siden.

### Sett opp i Render dashboard

1. Logg inn på Render: <https://dashboard.render.com>
2. **New +** → **Cron Job**
3. Koble til samme Git-repo som `api`-tjenesten (`GmailHelene/sakspilot`)
4. Fyll inn:
   - **Name:** `sakspilot-daily-automations`
   - **Region:** Frankfurt (samme som API)
   - **Branch:** `main`
   - **Root Directory:** `apps/api`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate --schema=../../packages/db/prisma/schema.prisma`
   - **Command:** `npm run job:daily-automations`
   - **Schedule:** `0 0 * * *`
     (UTC midnatt → 01:00 Oslo vinter / 02:00 Oslo sommer.
     Bytt evt. til `0 1 * * *` om du heller vil ha 02:00 vinter / 03:00 sommer.)

### Miljøvariabler

Cron-jobben trenger nøyaktig samme env-vars som hovedtjenesten `api`.
Enkleste måte: bruk **Environment Group** i Render.

Påkrevd:
- `DATABASE_URL` - Neon/Supabase Postgres connection string
- `DIRECT_URL` - direkte (non-pooler) connection for Prisma migrations
- `NODE_ENV=production`

Optional (kun hvis actions trenger det senere - i dag bruker engine kun DB):
- `SENTRY_DSN` - feilrapportering
- `SMTP_*` / `RESEND_API_KEY` - hvis vi legger til e-post-action i fremtiden

### Logger

Render viser stdout/stderr live under **Cron Job → Logs**.
Script logger:
- Start-tidspunkt (UTC + Oslo)
- Antall organisasjoner som matchet filter
- Per-org status (ok / feil)
- Total tid + summary

### Alerts

Hvis jobben krasjer hardt (`process.exit(1)`), markerer Render kjøringen
som *Failed* og sender e-post til org-admin på Render.
Per-org-feil (én org sin data er korrupt e.l.) logges men exiter 0,
slik at en enkelt råtten org ikke stopper alle andre.

## Test lokalt

Kjør jobben mot din lokale `.env`:

```bash
cd apps/api
npm run job:daily-automations
```

Forventet output:

```
[daily-automation-trigger] starter 2026-05-31T...
[daily-automation-trigger] fant N organisasjon(er) med aktive due_soon-agenter
[daily-automation-trigger] -> sjekker org "Demo AS" (uuid)
[daily-automation-trigger] ferdig på XXms - ok: N, feilet: 0
```

For å teste med ekte data: opprett en agent med trigger `milestone_due_soon`
og `daysUntil: 0`, og en milepæl med `dueDate = i dag`. Kjør jobben og sjekk
at klistrelappen dukker opp.

## Fremtidige cron-jobber

Legg dem under `src/jobs/` og dokumenter dem her. Forslag som har dukket opp:

- `subscriptionRenewalReminder.ts` - varsle 7 dager før Subscription utløper
- `trialExpiryWarning.ts` - varsle bruker når trial nærmer seg slutt
- `staleSakArchive.ts` - auto-arkivere saker uten aktivitet på 6 mnd
- `weeklyDigest.ts` - ukentlig e-post-oppsummering til hver bruker
