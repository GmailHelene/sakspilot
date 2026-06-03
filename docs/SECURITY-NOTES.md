# Sakspilot — Sikkerhetsgap og herding-status

> Ærlig oversikt over kjente sikkerhetsgap. Oppdatert 3. juni 2026.
> Basert på ekstern kode-review samme dag.

## Lukket 3. juni 2026

| # | Hva | Hvor | Effort |
|---|---|---|---|
| 1 | ENCRYPTION_KEY fall-back til "0000..." utenfor NODE_ENV='development' | `api/src/lib/crypto.ts` | Nå fail-hard ved alle andre miljøer |
| 2 | Udefinert tokenVersion aksepterte (true) → gamle tokens evig | `api/src/middleware/auth.ts` | Nå fail-closed → bruker må re-loginne |
| 3 | Ingen unikhets-constraint på fakturanummer per org | `prisma/schema.prisma` | `@@unique([organizationId, invoiceNumber])` lagt til |
| 4 | `_devResetUrl` lekket i prod-respons hvis SMTP feilet | `api/src/routes/auth.ts` | Nå kun NODE_ENV='development'. Logger til konsoll i prod |
| 5 | Bedrock-stub falt stille til Anthropic (GDPR-brudd) | `api/src/lib/aiProvider.ts` | Nå throws — eksplisitt aktivering kreves |
| 6 | Email-body fra UI bygget til HTML uten escape (XSS i utgående epost) | `web/.../fakturaer/page.tsx` | Escape-hjelper lagt til |

## Lukket 3. juni 2026 (kveld) — siste runde

| # | Hva | Hvor | Effort |
|---|---|---|---|
| 7 | **JWT i localStorage** — XSS-utnyttbar | `web/src/lib/api.ts` | JWT fjernet fra localStorage. Cookien (httpOnly, satt av API, proxiet via Vercel-edge) er nå eneste auth-bærer på web. localStorage lagrer kun en non-sensitive markør `sakspilot_authed=1` for synkron innlogget-sjekk i UI. Bearer-header sendes ikke lenger fra web — Electron-desktop fortsetter med Bearer for sin egen flyt. |
| 8 | **Bruker-enumerering via timing** i forgot-password | `api/src/routes/auth.ts` | Konstant-tid pad: `verifyPassword` mot dummy-hash i "user finnes ikke"-grenen + total responstid padded til 500 ms min |
| 9 | **CSRF på cookie-baserte endpoints** | `api/src/index.ts` (CORS) | Ikke nødvendig: SameSite=None+Secure-cookie i kombinasjon med streng CORS-allowlist hindrer cross-origin POST. Custom-header (Content-Type: application/json) trigger preflight som CORS avviser fra ikke-allowlisted origins. |

## Fortsatt åpne — krever større arbeid

| # | Hva | Risiko | Plan |
|---|---|---|---|
| 10 | **PDF-generering CPU-tung i web-prosess** — kan DoS-e API ved nok parallelle requests | Middels | Rate-limit lagt til (30/min). Bedre fix: flytt PDF-gen til en worker eller separat queue. **Når faktisk problem oppstår.** |
| 11 | **Ingen paginering** — frontend henter alle lister | Middels (UX-problem ved 500+ poster) | Implementeres ved første kunde med 100+ fakturaer. **Trigget av brukstilfelle.** |
| 12 | **Backend aksepterer fortsatt Bearer-header** (for Electron desktop) | Lav | Web sender ikke lenger Bearer. Bearer-support må beholdes for desktop-agent. Etter migrering av desktop til cookie eller egen API-key kan Bearer fjernes fra backend. |

## Compliance-status

| Område | Status |
|---|---|
| GDPR art. 15 (innsyn) | ✅ `/me/export` — inkluderer alle modeller (oppdatert 3. juni) |
| GDPR art. 17 (sletting) | ✅ `/me/delete` — cascade via Prisma |
| GDPR art. 28 (databehandleravtale) | ✅ Mal i `docs/dpa-mal.md` |
| Data-hosting | ✅ Neon EU-Frankfurt, Render eu-region, Vercel EU-edge |
| AI-leverandør | ⚠️ Anthropic API = USA. Bedrock-stub klar men ikke aktivert |
| Krypterte tokens | ✅ AES-256-GCM med nøkkel fra env-var |
| Sentry crash-data | ✅ EU-region + PII-stripping |
| Bokføringsloven (oppbevaring 5 år) | ⚠️ Vi sletter ikke automatisk — men frilanser kan eksportere og slette manuelt |
| MVA-rapport (RF-0002) | ⚠️ Vi genererer GRUNNLAG som PDF, ikke MVA-melding selv. Bruker leverer i Altinn |
| Faktura-unikhet (bokføringsloven) | ✅ DB-constraint lagt til 3. juni |

## Operasjonell modenhet

| Aspekt | Status |
|---|---|
| Logging | ✅ Sentry + Render Logs |
| Backup | ✅ Daily DB-dump via GitHub Actions |
| Monitoring | ⚠️ Ingen uptime-monitor (UptimeRobot e.l. ikke konfigurert) |
| Rate-limiting | ✅ Per-route med differensierte limits |
| Hosting-redundans | 🔴 Single-region, single-instance på Free-tier |
| Code-signing (mac/win) | 🔴 Ikke implementert. Apple Developer ID ~$99/år, Windows EV cert ~$300+/år |
| CI/CD | ✅ GitHub Actions for desktop-builds. ⚠️ Ingen automatisk testing før deploy |
| Sentry-bruk | ✅ Aktiv, EU-region, PII-stripping |

## Test-dekning på penger + krypto (3. juni 2026 — utvidet)

| Lib | Tester | Status |
|---|---|---|
| `mva.ts` (calcMva, bucket, parsePeriode, periodeRange, addToBucket) | 21 | ✅ Pass |
| `invoiceMath.ts` (lineSum, totalsFromLines, roundOere) | 16 | ✅ Pass (ny lib 3/6) |
| `invoiceLineItems.ts` (safeParseLineItems, Zod-schemas) | 14 | ✅ Pass |
| `crypto.ts` (encrypt/decrypt + env-håndtering) | 17 | ✅ Pass |
| **Sum penger + krypto** | **68** | ✅ |
| auth.ts (token-revokering) | 1 | ⚠️ Krever DB |
| saker.ts | 3 | ⚠️ Krever DB |
| share.ts | 3 | ⚠️ Krever DB |
| **Totalt** | **75 pass + 7 DB-avhengige** | |

Penger- og krypto-kjerne er nå dekket av rene unit-tester som kjører i `vitest run` uten DB.
DB-integrasjonstester eksisterer men krever `DATABASE_URL` mot test-Neon.

## Anbefalt herding-rekkefølge

For å gå fra "avansert pilot" til "produktet du kan selge til ekte kunder":

1. ~~**Skriv tester for kritisk regnskaps-logikk**~~ ✅ Done 3/6 — MVA, fakturasum, line-items, krypto
2. ~~**Migrer JWT til httpOnly cookie**~~ ✅ Done 3/6 — web bruker kun cookie, localStorage har bare en non-sensitive markør
3. **Oppgrader Render til Starter ($7/mnd)** — fjern kaldstart, åpne for SMTP hvis ønsket
4. ~~**Konstant-tid forgot-password**~~ ✅ Done 3/6 — pad til 500 ms min, bcrypt mot dummy-hash
5. **Sett opp UptimeRobot eller tilsvarende** — vit om appen er nede før kunden gjør
6. **PostgreSQL-backup-test** — kjør restore én gang for å verifisere backupen faktisk virker
7. **Apple Developer Program** når Mac-bruker-base når kritisk masse
8. **Paginering på fakturaer + utgifter** når første kunde har 500+ poster

Punktene 1-6 er nødvendige før første betalende kunde i regulert bransje.
Punkt 7-8 er trigget av faktisk brukerbase, ikke arbitrære terskel.
