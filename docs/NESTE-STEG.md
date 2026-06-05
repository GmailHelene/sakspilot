# Sakspilot: Hva gjenstår + videre arbeid

**Snapshot:** 5. juni 2026.
**Status:** Funksjonelt komplett for pilotbruk. Solid sikkerhetsfundament etter ekstern review. Desktop på v0.0.15. CI grønn med 84 tester. Pilot-admin-verktøy (`/admin/pilot-stats`, `/admin/inbox`) live.

Detaljer på dagens leveranser: [`STATUS-2026-06-05.md`](STATUS-2026-06-05.md).

---

## TL;DR

Sakspilot er klar for å aktivt rekruttere flere pilot-brukere. Tre eksterne piloter har registrert seg (Kevin Nguyen, Jarle Ødegaard, Astrid Berg-Lindahl) - to har ikke logget inn ennå, og automatisk drip-mail kommer i morgen.

**Tre viktigste neste steg:**

1. **Følg opp Astrid Berg-Lindahl manuelt** - hun er den eneste eksterne pilot som faktisk har logget inn, og forsvant etter første gang. Spør om hva hun savnet.
2. **Komprimer `demo-advokat.mp4` (67 MB → 5-10 MB)** eller flytt til Cloudflare Stream. Største ytelses-blokker akkurat nå.
3. **Sett opp UptimeRobot** på `sakspilot.no` + `api.sakspilot.no` + Render-API. 5 min jobb. Bør gjøres før neste runde med pilot-rekruttering.

---

## Klart for pilot-utrulling (alt klart, bare gjør)

- **Send pilot-invitasjon til Nicole** ([`docs/pilot-epost-nicole.md`](pilot-epost-nicole.md))
- **Post på LinkedIn** ([`docs/linkedin-post.md`](linkedin-post.md))
- **Post på WP Norge FB-gruppe** (egen tekst)
- **Følg opp Kevin og Jarle** - sjekk om dag-3-drip-mail funket i morgen tidlig
- **Følg opp Astrid** - ekte advokat-pilot som forsvant etter første login

---

## Tech-arbeid (i prioritert rekkefølge)

### Akutt (denne uka)

| Effort | Hva | Hvorfor |
|---|---|---|
| 30 min | Komprimer `demo-advokat.mp4` til 5-10 MB eller flytt til Cloudflare Stream | Reviewen pekte ut dette som største LCP-blokker. Koster Vercel-bandwidth også. |
| 5 min | Sett opp UptimeRobot for `sakspilot.no`, `api.sakspilot.no`, evt. desktop-release-URL | Vit om appen er nede før kunden gjør |
| 30 min | Bytt passord på `helene721@gmail.com` (delt i AI-chat 4. juni) | Rotering av tokens som har vært i chat-historikken |
| 30 min | Test backup-restore én gang mot ci-test-branch | Verifiser at `monthly-db-backup.yml`-jobben faktisk gjør en gjenopprettelig backup |

### Snart (før første betalende kunde)

| Effort | Hva | Hvorfor |
|---|---|---|
| 2-3 timer | Migrer JWT til httpOnly cookie på all backend (fjern Bearer-fallback) | Web er allerede migrert. Backend godtar fortsatt Bearer for desktop. Når desktop migreres er Bearer redundant. |
| 1 time | Konstant-tid forgot-password timing (oppgrader til alltid bcrypt-compare) | Lukker bruker-enumerering helt. Allerede 500 ms pad nå. |
| 30 min | Oppgrader Render til Starter ($7/mnd) | Fjerner kaldstart 30-60 sek. Betalende vil ikke vente. |
| 1-2 timer | Sett opp staging-deployment (Vercel preview + Render staging service + Neon-branch) | Sleep walk fra utvikling til prod er risikabelt med ekte kunder. |
| 2-4 timer | Paginering på fakturaer, utgifter, time-entries | Frontend henter alle nå. Brytes ved 500+ poster. |

### Senere (når triggert av brukstilfelle)

- **Apple Developer Cert** (~$99/år) for Mac code-signing - når Mac-bruker-base når kritisk masse
- **PDF-DoS-isolasjon** - flytt PDF-generering til egen worker når det blir et faktisk problem
- **CSP nonce isf 'unsafe-inline'** - krever Next.js middleware-arbeid, risk for å brekke hydration
- **Inline-CSS-migrasjon** (65 sider) - gjøres gradvis ved nye sider, ikke en stor sprint
- **Branding-overhaul** - logo + landingsside-hero som binder sammen "sakspilot"-metaforen. Tas opp etter Modum-pilot er bekreftet (notert i `feedback_branding_pilot_visual.md` i memory).

---

## Hva er ferdig (referanse)

Se [`STATUS-2026-06-05.md`](STATUS-2026-06-05.md) for komplett liste.

---

## Pilot-status pr 5. juni (fra `/admin/pilot-stats`)

| Pilot | Org | Status | Neste handling |
|---|---|---|---|
| Astrid Berg-Lindahl | Berg & Lindahl Advokatfirma DA | Registrert 28/5, logget inn 1 gang, forsvant | **Manuell oppfølging - personlig epost** |
| Kevin Nguyen | Netty | Registrert 4/6 (i går), ikke logget inn | Dag-3-drip kommer 7/6 |
| Jarle André Ødegaard | Digitalhjelp AS | Registrert 2/6, ikke logget inn | Dag-3-drip kom 5/6 om morgenen |
| Helene Åsheim Grønberg (deg) | Grønberg Tech Solutions | Aktiv | - |

Totalt 11 registrerte brukere (resten er test-kontoer fra demo-runder).

Desktop-nedlastinger: 7 reelle eksterne (Win + Mac, ekskludert Helene's egen testing).
