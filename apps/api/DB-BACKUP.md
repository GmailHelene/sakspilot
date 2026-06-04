# Sakspilot DB-backup

Månedlig backup av Neon Postgres (eu-central-1 / Frankfurt) til Cloudflare R2.

Neon gratis-tier har 7-dagers PITR (point-in-time recovery) innebygd, men vi
kontrollerer ikke det arkivet og det forsvinner hvis vi mister tilgang til
Neon. Denne jobben gir oss vårt eget månedlige arkiv på et uavhengig sted.

## Hva jobben gjør

`apps/api/src/jobs/dbBackup.ts` (kjøres med `npm run job:db-backup`):

1. Kjører `pg_dump --no-owner --no-acl` mot `DIRECT_URL` (Neon direct,
   ikke pooler - pooler støtter ikke pg_dump sin streaming-stil).
2. Gzip-er output til `apps/api/backups/sakspilot-backup-YYYY-MM-DD.sql.gz`.
3. Hvis R2-env-vars er satt → laster opp til Cloudflare R2, og roterer
   (beholder siste 12 månedlige).
4. Hvis ikke → lar fila ligge lokalt og logger en advarsel.

## Sette opp Cloudflare R2

1. Lag konto på https://cloudflare.com (gratis).
2. I dashboardet → **R2 Object Storage** → **Create bucket**.
   - Navn: `sakspilot-backups`
   - Location hint: `EEUR` (Eastern Europe, nærmest Oslo og Neon Frankfurt)
3. **R2** → **Manage R2 API Tokens** → **Create API Token**.
   - Permissions: **Object Read & Write**
   - Scope: kun `sakspilot-backups`-bucketen
   - TTL: ingen / "Forever"
4. Noter ned:
   - **Account ID** (vises øverst i R2-dashboardet)
   - **Access Key ID** og **Secret Access Key** (vises kun én gang ved oppretting)
5. Installer AWS SDK i `apps/api`:
   ```bash
   cd apps/api
   npm install @aws-sdk/client-s3
   ```
   (SDK-en er ~10 MB og er kun lastet inn av backup-jobben hvis R2-env-vars er
   satt - derfor lastes den dynamisk og er ikke i baseline-dependencies.)

## Env-vars som må settes på Render

På Render-dashbordet for API-tjenesten → **Environment**:

| Var                    | Verdi                                  |
| ---------------------- | -------------------------------------- |
| `DIRECT_URL`           | Allerede satt (Neon direct connection) |
| `R2_ACCOUNT_ID`        | Cloudflare account ID                  |
| `R2_ACCESS_KEY_ID`     | R2 API token access key                |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret                    |
| `R2_BUCKET_NAME`       | `sakspilot-backups`                    |

Sjekk også at `pg_dump` finnes i Render-containeren. Render sine standard
Node-images har `postgresql-client` installert; hvis ikke må Dockerfilen
legge til:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
```

**Viktig:** `pg_dump`-versjonen bør matche eller være nyere enn server-versjonen.
Neon kjører Postgres 16; bruk `postgresql-client-16` hvis du må være eksplisitt.

## Sette opp Render cron job

Render-dashbord → **New +** → **Cron Job**:

- **Name:** `sakspilot-db-backup`
- **Environment:** Node
- **Repo:** samme som API-tjenesten
- **Build command:** `npm install` (eller hva API-tjenesten din bruker)
- **Schedule:** `0 3 1 * *`
  - = 1. dag i hver måned, kl. 03:00 UTC
  - = kl. 04:00 Oslo om vinteren (CET), kl. 05:00 om sommeren (CEST)
- **Command:** `cd apps/api && npm run job:db-backup`
- **Environment variables:** kopier de samme som API-tjenesten (inkl. R2_*)

### Test først (engangskjøring)

Render lar deg trigge cron-jobben manuelt fra dashbordet. Gjør det én gang
etter oppsett for å verifisere at:

- `pg_dump` finnes og kobler til
- Fila skrives og gzip-es
- R2-upload går gjennom

Etterpå: sjekk i R2-dashbordet at `sakspilot-backup-YYYY-MM-DD.sql.gz` ligger der.

## Restore fra backup

Last ned `.sql.gz` fra R2-dashbordet (eller via `aws s3 cp` med R2-endpoint), så:

```bash
gunzip < sakspilot-backup-2026-05-01.sql.gz | psql "$DIRECT_URL"
```

`DIRECT_URL` her bør peke til **mål-databasen** (f.eks. en staging-DB eller en
ny tom Neon-branch - ikke produksjon med mindre du faktisk vil overskrive den).

Hvis du restorer til en helt tom DB, kjør først `prisma migrate deploy` _ikke_
trengs siden dumpen inneholder hele skjemaet.

## Lokal testing

For å teste mot en staging-DB (anbefales - ikke kjør pg_dump mot prod fra
laptop med mindre du må):

```bash
cd apps/api

# Bare lokal lagring (R2-env ikke satt):
DIRECT_URL="postgres://...staging..." npm run job:db-backup
# → fil i apps/api/backups/sakspilot-backup-YYYY-MM-DD.sql.gz

# Med R2-upload:
DIRECT_URL="postgres://...staging..." \
R2_ACCOUNT_ID="..." \
R2_ACCESS_KEY_ID="..." \
R2_SECRET_ACCESS_KEY="..." \
R2_BUCKET_NAME="sakspilot-backups-test" \
  npm run job:db-backup
```

Bruk en separat test-bucket lokalt så du ikke roper på produksjons-rotasjonen.

## Rotasjon

Jobben beholder de 12 nyeste filene med prefix `sakspilot-backup-` og endelse
`.sql.gz` i bucketen, og sletter resten. Med månedlig schedule = 12 måneders
historikk.

Hvis du vil endre antall: se `const KEEP = 12` i `dbBackup.ts`.

## Fallback hvis R2 ikke er satt opp ennå

Hvis du ikke har rukket å sette opp R2 og bare vil ha backup _et eller annet sted_:

- Kjør jobben uten R2-env. Den lager fila lokalt i `apps/api/backups/`.
- På Render: laster ikke det opp noe sted, og containerens disk er ephemeral
  - fila forsvinner ved neste deploy/restart.
- **Midlertidig løsning:** kjør jobben fra laptopen din månedlig og last opp
  manuelt til Drive/Dropbox til R2 er på plass.
