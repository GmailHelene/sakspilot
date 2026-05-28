# Sakspilot — Hva gjenstår + videre arbeid

**Snapshot:** 28. mai 2026, kveld.
**Status:** Funksjonelt komplett for pilotbruk. Hele pipeline (web → API → .exe → download) er live på sakspilot.no. Klar til å sende ut piloter.

---

## TL;DR

**Du kan poste FB-rekruttering i morgen tidlig** og sende Nicole-eposten samtidig. Alt det grunnleggende er på plass. Det som gjenstår er polering, skalering-forberedelser, og utvidelser som forsterker verdiforslaget — ingenting er blokkerende for pilotstart.

**3 viktigste neste steg:**
1. **SMTP for glemt-passord** (Resend, 30 min) — piloter får ikke reset-lenken på epost ennå, kun via _devResetUrl i dev-respons
2. **AI rate-limit per org** (1 time) — vern mot Claude-budsjett-eksplosjon ved 50+ piloter
3. **Splitt `saker/[id]/page.tsx`** (1901 linjer) — tech-debt som gjør bug-fixing tregere

---

## ✅ Hva er ferdig (referanse)

Se `docs/STATUS-2026-05-28.md` for komplett liste. Kort versjon:

- Auth (register/login/glemt passord/reset/logout-all)
- Multi-tenant org-isolering (cascade)
- Prosjekt-CRM med kanban, tabell, filter
- Klistrelapper, kalender (klikk for milepæl), Gantt-tidslinje
- Agenter/automatiseringer (Monday/Notion-stil)
- Tidsregistrering (manuell + desktop-agent matching-regler)
- Desktop-app (.exe v0.0.1) med tray, BrowserView, daily auto-reload
- Outlook-integrasjon (MS Graph)
- AI-assistent (Claude Sonnet 4.5, PII-minimisert)
- Fiken-faktura via personal access token
- Tripletex via CSV-eksport
- Bransje-onboarding (9 bransjer, bransje-spesifikke launcher-snarveier)
- Tema-velger (3 fargesett, faktisk fungerende CSS-vars)
- Sidebar med Mine sites + Mine mapper + Mine snarveier
- Launcher med drag-and-drop + tooltip + lokale .exe-snarveier
- Hjem-side med widget-toggling og Start arbeidsøkt CTA
- GDPR-endepunkter (innsyn, sletting, audit-log, DPA, personvernerklæring)
- Pilot-pricing (gratis ut 2026, deretter 199 kr/mnd / 1990 kr/år)
- /last-ned + GitHub Releases (https://github.com/GmailHelene/sakspilot-releases)
- Demo-advokat (Berg & Lindahl Advokatfirma DA) seedet for showcase
- Site-verifisering (Google Search Console + Bing Webmaster)
- Vercel + Render + Neon i EU-regioner
- 401-cleanup + onboarding-per-user
- Reset-grensesnitt-funksjon

---

## 🚀 Bør gjøres FØR du sender ut piloter (kritisk)

### 1. SMTP for glemt-passord — 30 min
**Problem:** `/glemt-passord` lager reset-token og logger lenken til server-konsoll. Brukeren får IKKE epost. I dev-modus vises lenken i response, men det er ikke acceptable for prod.

**Fix:**
- Opprett Resend-konto (free tier 3000 mails/mnd, EU-region Frankfurt)
- Verifiser domene `sakspilot.no` (TXT-records på Domeneshop)
- Sett `RESEND_API_KEY` på Render
- Oppdater `apps/api/src/routes/auth.ts` `/forgot-password` til å kalle `resend.emails.send()` i stedet for å bare console.log
- Fjern `_devResetUrl` fra response

**Hvorfor før piloter:** Nicole/andre vil glemme passord. Uten epost-funksjon må Helene manuelt videresende lenker fra server-logger.

### 2. Test demo-brukerflyt selv én gang — 15 min
**Logg inn med:**
```
demo.advokat@sakspilot.no  /  Demo!uSQrPcaXKuu7
```
Klikk gjennom: Hjem → Prosjekter → en sak → Kalender → Gantt → Rapport → Agenter → Klistrelapper. Verifiser at alt ser fint ut. Hvis noe ser rart ut, fiks før FB-post.

### 3. Sjekk at /last-ned faktisk virker — 2 min
Etter du har satt Vercel env-var: gå til `https://sakspilot.no/last-ned`, klikk **«⬇ Last ned for Windows»**. Skal starte nedlasting av 115 MB .zip fra GitHub.

---

## 🛡️ Bør gjøres FØR du har 10 piloter (1-2 uker)

### 4. AI rate-limit per org — 1 time
**Problem:** Hver Claude-kall koster $0.003-0.015. Én power-bruker som spammer AI-assistenten kan generere $50+/dag.

**Fix:** Legg til counter i `apps/api/src/routes/ai.ts`:
- Lagre `aiCallsThisMonth` på Organization
- Reset hver 1. i måneden
- Soft-limit: 100 kall/mnd gratis, hardt cap: 500 (returnerer 429)
- Eller bedre: cost-basert (sum av tokens × $/token)
- Pilot-org får 10x kvote

### 5. Send Nicole-eposten + post i FB — 30 min
**Status:** Alt materiell ferdig i `docs/pilot-epost-nicole.md` og `docs/post-fb-wp-norge.md`. Bare å sende.

**Anbefalt rekkefølge:**
- Tirsdag morgen kl 09: send Nicole-eposten (versjon A) med bruksanvisning som vedlegg
- Tirsdag morgen kl 10: post i WP Norge FB (versjon A)
- Følg opp i kommentartråden første 30 min
- Vent 5-7 dager, send oppfølger til Nicole hvis ingen respons

### 6. Sett opp Sentry på Render — 15 min
**Status:** Sentry er konfigurert i kode (`@sentry/node` installert), men DSN er ikke satt → ingen feilmeldinger sendes.

**Fix:** Lag Sentry-konto, lag prosjekt, kopier DSN, sett `SENTRY_DSN` på Render. Eventuelt også `NEXT_PUBLIC_SENTRY_DSN` på Vercel for frontend-feil.

### 7. Pilot-tilbakemelding-form — 30 min
Liten side `/feedback` (intern, krever innlogging) med:
- Hva fungerer best?
- Hva er mest frustrerende?
- Hva savner du?
- (Valgfritt) Vil du delta i 20-min videocall?

POSTes til `/feedback`-endpoint som lagrer i ny `Feedback`-tabell. Helene leser via Prisma Studio eller liten admin-side.

### 8. Onboarding-emails (drip-kampanje) — 1 time
Når noen registrerer seg:
- **Dag 0:** Velkomst + lenke til /last-ned + lenke til bruksanvisning
- **Dag 3:** «Har du installert Windows-appen? Den gir 80% av verdien»
- **Dag 7:** «Hvordan går det? Svar med ett ord: bra/dårlig/blandet»
- **Dag 14:** «Vil du ha 20-min videocall så jeg kan se hva du sliter med?»

Bruker Resend (samme som glemt-passord). Trigger via `User.createdAt + N days` check i daglig cron-job.

---

## 📈 Bør gjøres FØR du har 50 piloter (1 måned)

### 9. Splitt `apps/web/src/app/saker/[id]/page.tsx` — 2 timer
1901 linjer, blir tregere å bug-fixe. Splitt i:
- `_sections/MilestonesSection.tsx`
- `_sections/TimeEntriesSection.tsx`
- `_sections/AiAssistantSection.tsx`
- `_sections/MatchingRulesSection.tsx`
- `_sections/FikenInvoiceButton.tsx`
- `_sections/ShareButton.tsx`

Hovedfilen blir <300 linjer.

### 10. Cron-jobb for daglige automatisations-trigger — 1 time
`milestone_due_soon` og `sak_status_changed` triggrer per request nå. Bør bli en cron-jobb (Render scheduled task, hver natt 02:00 Oslo-tid) som:
- Sjekker alle milepæler med `dueDate - N dager < i dag`
- Trigger relevante agenter
- Logger til `AutomationRun`

### 11. Database-backups + restore-test — 30 min
**Problem:** Neon free tier har 7-dagers point-in-time recovery, men ingen manuelle backups. Lag månedlig dump til S3/R2:
- Cron-jobb: `pg_dump | gzip | aws s3 cp ...`
- Test restore én gang i et staging-DB for å verifisere

### 12. Splash-side / landing — 2 timer
Forsiden (`/`) er OK men ganske «standard SaaS». Vurder:
- Konkret demo-video (90 sek, screen-recording av demo-advokat-flyt)
- Sosial bevis (sitater fra piloter — etter du har dem)
- Sammenligningstabell med Tripletex/Fiken/Tidsbanken (positivering: «vi kompletterer dem»)
- FAQ-seksjon

### 13. Mobil-optimalisering av kanban — 2-3 timer
Drag-and-drop på kanban fungerer dårlig på mobil. Enten:
- Bytt til simple click→velg→klikk-status
- Eller installer `dnd-kit` for touch-støtte
- Mobile-first redesign av sak-detalj

---

## 💼 Forretningsmessig / før kommersiell lansering (Q1 2027)

### 14. Stripe-integrasjon — 1-2 dager
**Status:** `Subscription`-modell + `/billing/status`-endepunkt finnes (commit `e1be6db`), Stripe-felter er nullable.

**Gjenstår:**
- Stripe-konto + verifisering norsk MVA
- Checkout-session endpoint
- Webhook-handler for subscription events
- Customer portal for endring av plan / kort
- Faktura-PDFer fra Stripe (eller alternativ: manuell faktura via Fiken)
- Vipps som alternativ (norsk-vennlig)

### 15. Tripletex partner-godkjenning — venter på dem
**Status:** Søknad sendt (se `docs/tripletex-fiken-soknad.md`). Krever 3-5 dagers godkjenning og OAuth-impl etter det.

### 16. Code-signing .exe — Krever EV cert (~500 USD/år)
**Status:** v0.0.1 utløser Windows SmartScreen-advarsel. Profesjonelt fix:
- Kjøp EV code-signing-sertifikat fra DigiCert/Sectigo
- Sett opp signing i CI (electron-builder støtter dette)
- Reduserer friksjon for piloter betraktelig
- **Anbefaling:** Vent til du har 10+ betalende kunder, så er kostnaden berettiget

### 17. Engelsk språkversjon — 2-3 dager
For internasjonale frilansere. Krever:
- Sett opp `next-intl` eller `next-i18next`
- Oversett alle UI-strenger til engelsk
- Locale-switcher i header

---

## 🌟 Mulige utvidelser (post-MVP)

Sortert etter «verdi vs innsats»:

### Høy verdi, lav innsats (gjør først hvis tid)
- **Push-notifikasjoner for klistrelapper** med påminnelses-tid (web push API)
- **Pomodoro-timer i tray-meny** — start 25/5-økt direkte
- **Faktura-PDF generering** (Sakspilot-side, ikke avhengig av Fiken) — for de som ikke har Fiken/Tripletex
- **Eksport av rapport som PDF** (Rapport-siden — i dag bare CSV)
- **Tids-mål per uke/mnd** med varsel ved over/under («Du har logget 38/40 timer denne uka»)
- **AI chat-historie per sak** (i dag er hver prompt isolert)
- **Auto-kategorisering av timer** — AI foreslår sak basert på window-tittel hvis ingen regel matcher

### Høy verdi, høy innsats
- **Mac- og Linux-desktop-versjon** — `get-windows` finnes ikke der, må bytte til `active-win`
- **Klient-portal med login** (i stedet for delelenke) — klienter ser sine egne saker og laster ned faktura
- **Team-plan** — flere brukere per org, deling av saker, roller (admin/member)
- **Tripletex direkte API** (avhenger av partner-status)
- **Integrasjon med Google/Apple Cal** (iCal-feed eller two-way sync av frister)
- **iOS/Android-app** (native React Native eller bare PWA-polering)

### Lav verdi, lav innsats (kjekke å ha)
- **Voice notes** i klistrelapper (Web Audio API)
- **Mørk modus** (CSS-vars finnes allerede, bare manglende toggle)
- **Keyboard-shortcuts** for power-users (Cmd+K command palette)
- **Eksport hele kontoen som ZIP** (vi har JSON-eksport, men en menneskeleselig HTML-versjon kunne vært fin)
- **Multi-monitor support** for desktop agent
- **Custom domener for klient-deling** (whitelabel)

### Spekulativt / lengre sikt
- **Apple Watch-integrasjon** — registrer arbeidstid med tap
- **Fitness-tracker-data** — koble pauser til fitness-data
- **AI som leser opp e-poster** (TTS)
- **Marketplace for agent-templates** (brukere deler oppskrifter)
- **API for tredjeparter** (Zapier, Make.com integrasjoner)
- **Smarthus-integrasjon** (Hue-lampene blir rød når en kritisk frist nærmer seg)

---

## 💰 Kostnad ved skala (2027-budsjett-estimat)

Antagelser: 50 betalende kunder à 199 kr/mnd = 9950 kr/mnd inntekt.

| Tjeneste | Pris | Når må jeg oppgradere |
|---|---|---|
| Vercel | Free → Pro $20/mnd | Når 100+ GB bandwidth/mnd |
| Render API | Free → Starter $7/mnd | Når trafikk + DB-tilkoblinger øker |
| Neon DB | Free → Launch $19/mnd | Når > 0.5 GB data (= ~50 piloter) |
| Anthropic Claude | $50-200/mnd | Avhenger sterkt av AI-bruk per bruker |
| Resend (mail) | Free 3000/mnd → $20/mnd | Når > 100 brukere som mottar onboarding |
| GitHub | Free | Aldri (vi er liten org) |
| Sentry | Free 5k events → $26/mnd | Ved 100+ aktive brukere |
| **Total infra** | **~$130/mnd** | Ved 50 betalende (= ~$15/kunde/mnd kostnad) |

**Bruttomargin:** ~85% før Helene-lønn. Bra. Hovedrisiko = Anthropic-bruk skal monitoreres tett.

---

## 📋 Foreslått sprint-plan (neste 2 uker)

### Uke 1 (29. mai – 4. juni)
- **Mandag:** Sett Vercel env-var, redeploy, test /last-ned. Send Nicole-eposten kl 09. Post i WP Norge FB kl 10.
- **Tirsdag-onsdag:** Sett opp Resend + SMTP for glemt-passord. Verifiser domene.
- **Torsdag:** Sett Sentry-DSN. Sjekk at feilmeldinger kommer inn.
- **Fredag:** AI rate-limit per org (commit + test). Følg opp tidlig-piloter.

### Uke 2 (5.–11. juni)
- **Mandag-tirsdag:** Splitt `saker/[id]/page.tsx`. Refactor uten å endre adferd.
- **Onsdag:** Pilot-feedback-form (`/feedback`). Send link til alle aktive piloter.
- **Torsdag:** Cron-jobb for daglige automasjons-trigger.
- **Fredag:** Database-backup-script + restore-test. Skriv «Status-2026-06-11.md».

### Etter uke 2: les piloter, prioritér basert på faktisk feedback
Det er stor sjanse for at piloter forteller om noe du ikke har forutsett. Vær åpen for å droppe planen og lytte.

---

## 🚨 Risikoer å være obs på

1. **Anthropic API kan dø** — AI-assistenten er ikke kritisk, men hvis Claude er nede ser produktet halt ut. **Mitigering:** Bedrock-stub er klar, kan aktiveres på dager.
2. **Neon stenger free tier-prosjekt etter 7 dagers inaktivitet** — sjekk ukentlig at sakspilot.no fungerer ved cold-start.
3. **GitHub Releases kan ta unna trafikken** — gratis CDN, men hvis en post går viralt og 1000+ laster ned samtidig kan det bli rate-limit. **Mitigering:** Flytt til Cloudflare R2 ved bekymring.
4. **Pilot-feedback kan avsløre at vi har bygd feil produkt** — mest sannsynlige risiko. Mitigation = lytt, ikke forsvar.
5. **Nicole/første pilot sliter** — manuell support er kritisk de første 2 ukene. Bli kjent med deres workflow.
6. **GDPR-klage fra én pilot** — vi har personvernerklæring + DPA + audit-log, men sjekk at faktisk sletting fungerer ende-til-ende.

---

## 🎯 Konkrete suksess-metrikker for piloten

For å vite om det fungerer:

| Metrikk | Mål uke 2 | Mål uke 8 |
|---|---|---|
| Registreringer | 5 | 25 |
| Aktive brukere (logget inn 7 siste dager) | 3 | 15 |
| Brukere med ≥ 1 prosjekt | 3 | 15 |
| Desktop-app installert | 2 | 10 |
| Time-entries logget i sum | 50 | 1000 |
| Faktura sendt via Fiken | 0 | 2 |
| Negative tilbakemeldinger | OK med 50% | Bør være < 20% |
| «Vil du fortsette etter pilotperioden»-ja | — | 60% |

Hvis sluttall i uke 8 er < 50% av mål: produktet treffer ikke, rethink positionering eller målgruppe.

---

## 📝 Konklusjon

Du er klar til å sende piloter. Hovedjobben fremover er **lytte + iterere**, ikke bygge mer. Holdningen «bygg ferdig før vi viser noen» er den vanligste startup-fellen. Sakspilot er mer enn ferdig nok — nå handler det om å validere produktmarkedstilpasning.

**Top 3 ting denne uka:**
1. Sett Vercel env-var → test /last-ned virker
2. Sett opp Resend så glemt-passord virker
3. Send Nicole-epost + FB-post på samme dag

Resten kan komme etterhvert. 🚀
