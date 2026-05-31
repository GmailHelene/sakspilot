# Sakspilot — Setup-guide (første gang)

Følg denne stegvise guiden for å få **API + web + desktop-agent** opp å kjøre
lokalt. Tar ca. **15 minutter** totalt.

## Forutsetninger

- ✅ Node.js 20+ installert (`node --version` i terminal — du har 24)
- ✅ Git installert
- ✅ Browser (Chrome anbefalt — du har det)

---

## Steg 1: Opprett Neon-database (5 min)

Vi bruker Neon istedenfor Supabase fordi gratisnivået er sjenerøst og databasen
ikke pauser etter 7 dager.

1. Gå til **https://neon.tech** og klikk **Sign up**
2. Logg inn med **Google** eller **GitHub** (raskest)
3. På "Create your first project":
   - **Project name:** `sakspilot`
   - **Postgres version:** 16 (default)
   - **Region:** `EU Central (Frankfurt)` ⚠ *VIKTIG — ikke US*
   - Klikk **Create project**
4. Du havner på dashbordet. I høyre kolonne ser du **Connection Details**:
   - Det er to faner: **Pooled connection** (default) og **Direct connection**
   - Trykk **Show password**
   - Kopier strengen fra **Pooled connection** — den ser sånn ut:
     ```
     postgresql://sakspilot_owner:abc123XYZ@ep-xxx-pooler.eu-central-1.aws.neon.tech/sakspilot?sslmode=require
     ```
   - Bytt fane til **Direct connection** og kopier den også (skiller seg fra
     pooled ved at den IKKE har "-pooler" i hostname-en)

Behold begge to — vi bruker dem i neste steg.

---

## Steg 2: Opprett `.env`-filer (2 min)

I terminal:

```bash
cd C:\Users\helen\Desktop\sakspilot
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

Generer en sterk JWT-hemmelig:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Den printer en lang hex-streng. Kopier den.

Åpne `apps\api\.env` i VS Code/Notepad og fyll inn:

```bash
PORT=8001
NODE_ENV=development

DATABASE_URL="<pooled connection-strengen fra Neon>"
DIRECT_URL="<direct connection-strengen fra Neon>"

JWT_SECRET="<hex-strengen du genererte>"
JWT_EXPIRES_IN=8h

FRONTEND_URL="http://localhost:3001"
```

`apps\web\.env.local` er allerede satt opp riktig fra .env.example — du
trenger ikke endre noe der.

---

## Steg 3: Migrer databasen (1 min)

For utvikling bruker vi `db push` istedenfor `migrate dev` — det pusher schema
direkte uten å lage migrasjonsfiler (perfekt for solo-arbeid før første pilot).

```bash
cd C:\Users\helen\Desktop\sakspilot
npm run db:push
```

Du skal se:

```
Your database is now in sync with your Prisma schema. Done in 5.47s
```

**Viktig om Neon-tilkobling:** Hvis du får `Can't reach database server`-feil
mot port 5432, har Neon free-tier ofte problemer med direct connection.
Workaround: sett `DIRECT_URL` til **samme pooled-URL** som `DATABASE_URL`
i `apps/api/.env` (begge skal ha `-pooler` i hostname). Pooled fungerer for
både runtime og schema-pushing.

---

## Steg 4: Start API + web samtidig (åpner i bakgrunn)

```bash
cd C:\Users\helen\Desktop\sakspilot
npm run dev
```

Du skal se to tjenester starte:

```
[1] 🚀 Sakspilot API kjører på http://localhost:8001
[0]   ▲ Next.js 14.2.5  - Local: http://localhost:3001
```

La denne terminalen kjøre — IKKE lukk den.

---

## Steg 5: Registrer din første bruker

Åpne nettleser på **http://localhost:3001**

1. Klikk **Kom i gang gratis** øverst til høyre
2. Fyll inn:
   - Navn: `Helene Åsheim Grønberg`
   - E-post: `helene@helene.cloud` (eller din ekte e-post)
   - Passord: minst 8 tegn
   - Firmanavn: `Tech Solutions` (valgfritt)
3. Klikk **Opprett konto** — du blir logget inn automatisk og sendt til
   `/saker` (tom kanban-visning)

---

## Steg 6: Lag en klient og en sak

På `/saker`:

1. Klikk **+ Ny sak** (eller gå via Klienter først)
2. **Anbefalt:** Gå til **Klienter → Ny klient** først:
   - Navn: `Nicole Torgersen AS` (en test-klient)
   - Standard timesats: 1200
   - Klikk **Opprett klient**
3. Tilbake til **Saker → + Ny sak**:
   - Sakstittel: `Bygdoy 12 — rammetillatelse`
   - Klient: velg Nicole AS
   - Frist: ca. 3 uker frem
   - Sats: 1200
   - Klikk **Opprett sak**
4. Klikk på den nye saken i kanban-en
5. I detaljvisningen — under **Matching-regler** — klikk **+ Legg til regel**:
   - Type: **Vindustittel**
   - Mønster: `bygd[øo]y[\s\-_]*12`
   - Klikk **Lagre regel**

Nå har du en sak med matching-regel klar for desktop-agenten.

---

## Steg 7: Start desktop-agenten (Electron-app)

I en NY terminal (la den andre stå og kjøre dev-serveren):

```bash
cd C:\Users\helen\Desktop\sakspilot\apps\desktop
npm start
```

En liten **innstillinger-vindu** dukker opp — og et **navy-gull pilot-ikon** vises
i system-trayen din (nederst til høyre på skjermen, ved klokken).

I innstillinger-vinduet:
- API-URL: `http://localhost:8001` (default — la den stå)
- E-post: samme som du registrerte i steg 5
- Passord: samme passord
- Klikk **Logg inn**

Vinduet bytter til **Status**-visning. Lukk vinduet — agenten kjører fortsatt
i bakgrunnen (sjekk system-trayen, den er der).

---

## Steg 8: Test at det fungerer

1. **Høyreklikk på Sakspilot-ikonet i trayen** — du skal se en meny med:
   - 📍 Helene Åsheim Grønberg
   - ⏸ Ingen aktivitet (eller "🎯 Logger: ..." hvis du jobber i en matchet sak)
   - 0 sessions · 0 ikke synket
   - Pause / Synk / Åpne web / Innstillinger / Logg ut

2. **Lag en testfil**: `C:\Users\helen\Desktop\sakspilot\Test\Bygdoy-12.docx`
3. **Åpne den i Word**, jobb i 30 sekunder
4. **Høyreklikk på tray-ikonet igjen** — du skal se:
   - `🎯 Logger: Bygdoy 12 — rammetillatelse`
   - `1 sessions`

5. Tilbake i nettleseren — åpne sak-detaljvisningen for Bygdoy 12 og se
   tidssammendraget oppdatere seg neste gang du bytter vindu (sync skjer hvert
   5. min, eller med "Synk nå" i tray-menyen).

✅ **Synk fungerer:** `/agent/sync`-endepunktet er live på `api.sakspilot.no`. Sessions sendes automatisk hvert 5. minutt eller manuelt via tray-meny → "🔄 Synk til backend".

---

## Steg 9 (valgfritt — anbefalt): Slå på Auto-spor

I tray-menyen er det øverst en bryter **🎯 Auto-spor AV** — klikk den for å slå PÅ. Da:

- Arbeidsøkt starter automatisk
- Alt du åpner via Sakspilot (Launcher-snarvei, Mine sites, Mine mapper, lokal .exe) logges som session
- Sessions attribueres til "aktiv sak" — den siste saken du har åpnet `/saker/[id]` i web

Du slipper å sette opp matching-regler. De fungerer fortsatt og overstyrer auto-spor hvis de matcher, men de er ikke lenger en forutsetning.

Når du navigerer til en sak (`/saker/[id]`) i web-vinduet, viser tray-menyen og widgeten "↳ tilordnes: [saksnavn]" så du ser hva som registreres.

---

## Vanlige feil og løsninger

| Feil | Løsning |
|---|---|
| `Can't reach database server` ved migrate | Sjekk at DATABASE_URL er riktig kopiert — uten linjeskift |
| `Port 8001 already in use` | En annen prosess bruker porten — restart maskinen eller bytt PORT i .env |
| Tray-ikon vises ikke | Sjekk at `apps\desktop\assets\tray-icon.png` finnes — hvis ikke kjør `npm install` i apps/desktop på nytt |
| Innlogging i desktop-agent feiler | Sjekk at API kjører (åpne http://localhost:8001/health i nettleser — skal returnere JSON) |
| `npm run dev` viser bare ett av to | Sjekk at både apps/api og apps/web har sin egen `.env`/.env.local |

## Avslutt for dagen

For å stoppe alt:
- Trykk **Ctrl+C** i `npm run dev`-terminalen
- Høyreklikk Sakspilot-tray-ikonet og velg **❌ Avslutt**
