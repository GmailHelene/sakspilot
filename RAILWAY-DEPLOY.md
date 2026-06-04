# Railway-deploy steg-for-steg

Slik får du Sakspilot live på `sakspilot.no` så .exe-en kan brukes uten lokal
server.

**Estimert tid:** 90-120 minutter
**Kostnad:** Railway Hobby-plan $5/mnd (~55 kr) + Domeneshop ~99 kr/år

---

## Forberedelse (gjør dette først - 10 min)

### Bestem deg for arkitekturen

Vi deployer SOM TO SEPARATE Railway-tjenester i samme Railway-prosjekt:
- **sakspilot-api** - backend (port 8001), eksponert på `api.sakspilot.no`
- **sakspilot-web** - Next.js frontend (port 3001), eksponert på `sakspilot.no`

Databasen er allerede på Neon (gratis). Railway kobler bare til den via env-vars.

---

## Steg 1: Push koden til GitHub (~10 min)

Railway deployer fra GitHub. Hvis du ikke allerede har Sakspilot-repoet
der:

1. Gå til https://github.com/new
2. Repo-navn: `sakspilot`
3. **Privat** (anbefalt - du kan flytte til public senere)
4. Ikke initialiser med README (vi har en)
5. Klikk "Create repository"

Tilbake i terminal:

```bash
cd C:\Users\helen\Desktop\sakspilot
git remote add origin https://github.com/[brukernavn]/sakspilot.git
git branch -M main
git push -u origin main
```

Du må sannsynligvis logge inn med GitHub Personal Access Token første gang.
Hvis du ikke har en: https://github.com/settings/tokens → Generate new token
→ huk av "repo" → kopier tokenet og lim inn som passord når git spør.

---

## Steg 2: Opprett Railway-prosjekt (~5 min)

1. Gå til https://railway.com og logg inn (lag konto med GitHub om du ikke har)
2. Klikk **"New Project"** øverst til høyre
3. Velg **"Deploy from GitHub repo"**
4. Velg `sakspilot`-repoet
5. Railway prøver å bygge - det vil **feile** første gang fordi vi har monorepo. Det fikser vi i neste steg.

---

## Steg 3: Konfigurer API-tjenesten (~10 min)

Det første du opprettet ble en tjeneste som Railway prøvde å bygge fra roten.
Vi konfigurerer den til å bli **API-tjenesten**:

1. Klikk på tjenesten i prosjektet
2. Faner: **Settings**
3. **Service Name:** rename til `sakspilot-api`
4. **Root Directory:** `apps/api`
5. **Build Command:** (skal allerede leses fra railway.json):
   ```
   cd ../.. && npm install && npx prisma generate --schema=packages/db/prisma/schema.prisma && npx prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss
   ```
6. **Start Command:** (også fra railway.json):
   ```
   cd apps/api && npx tsx src/index.ts
   ```
7. **Healthcheck Path:** `/health`

---

## Steg 4: Sett miljøvariabler for API (~5 min)

I `sakspilot-api`-tjenesten → **Variables**-fanen → klikk **"+ New Variable"**
for hver av disse:

| Variabel | Verdi |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8001` |
| `DATABASE_URL` | (kopier fra apps/api/.env - pooled Neon-URL) |
| `DIRECT_URL` | (samme som DATABASE_URL - pooled også) |
| `JWT_SECRET` | (kopier fra apps/api/.env - den lange hex-strengen) |
| `JWT_EXPIRES_IN` | `8h` |
| `FRONTEND_URL` | `https://sakspilot.no,https://www.sakspilot.no` |

Lim inn forsiktig - ingen ekstra mellomrom på slutten av verdiene.

Etter siste variabel: klikk **"Deploy"** i topp-baren. Følg loggen - bygget tar
ca. 3-5 min.

Når den er grønn: under **Settings → Networking → Generate Domain** for å få
en midlertidig `*.up.railway.app`-URL. Test i nettleser:
```
https://sakspilot-api-production.up.railway.app/health
```
Skal returnere `{"ok":true,"service":"sakspilot-api",...}`.

---

## Steg 5: Opprett Web-tjenesten (~10 min)

Tilbake i Railway-prosjektet:

1. Klikk **"+ New"** → **"GitHub Repo"** → samme `sakspilot`-repo
2. Det opprettes en ny tjeneste - klikk på den
3. **Settings:**
   - **Service Name:** `sakspilot-web`
   - **Root Directory:** `apps/web`
   - **Build Command:** `cd ../.. && npm install && cd apps/web && npm run build`
   - **Start Command:** `cd apps/web && npm start`

4. **Variables:**
   | Variabel | Verdi |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` |
   | `NEXT_PUBLIC_API_URL` | `https://api.sakspilot.no` |

5. **Deploy**. Tar 5-8 min for Next.js prod-bygg.

Når grønn: generer domene + test:
```
https://sakspilot-web-production.up.railway.app
```
Du skal se Sakspilot-landingssiden.

---

## Steg 6: Koble custom domain `sakspilot.no` (~30 min)

### Registrer domenet
1. Gå til https://domeneshop.no → registrer `sakspilot.no` (~149 kr/år)

### Konfigurer DNS i Domeneshop
1. Logg inn på domeneshop.no
2. Velg sakspilot.no → **DNS-innstillinger**
3. Slett eventuelle eksisterende A- og CNAME-records for `@` og `www`
4. Legg til disse:

| Type | Navn | Verdi | Kommentar |
|------|------|-------|-----------|
| CNAME | `@` | (fyll inn etter neste steg) | Hovedomene → web |
| CNAME | `www` | (samme som @) | www-redirect → web |
| CNAME | `api` | (fyll inn etter neste steg) | API-subdomene |

### Hent CNAME-verdiene fra Railway
1. I Railway, `sakspilot-web` → **Settings** → **Networking** → **+ Custom Domain**
2. Skriv `sakspilot.no` → Railway viser en CNAME-verdi (`xxx.up.railway.app`)
3. Kopier den og lim inn i Domeneshop som verdi for `@`
4. Gjør det samme for `www` med samme verdi
5. Tilbake i Railway: legg til `www.sakspilot.no` også (samme tjeneste)

6. Nå `sakspilot-api` → **Settings** → **Networking** → **+ Custom Domain**
7. Skriv `api.sakspilot.no` → kopier CNAME-verdien
8. Lim inn i Domeneshop som verdi for `api`

### Vent på DNS-propagasjon (5-30 min)
Test med:
```bash
nslookup sakspilot.no
nslookup api.sakspilot.no
```
Når de svarer, åpne https://sakspilot.no i nettleser. Railway gir gratis
Let's Encrypt SSL automatisk (kan ta 1-2 min etter første treff).

---

## Steg 7: Pek .exe-en mot prod (~5 min)

```bash
cd C:\Users\helen\Desktop\sakspilot
```

Rediger `apps/desktop/src/settings.js`:
```js
defaults: {
  apiUrl: 'https://api.sakspilot.no',  // bytt fra http://localhost:8001
  // ... resten uendret
}
```

Bygg ny .exe:
```bash
cd apps/desktop
npm run build:exe
```

Den nye `release\Sakspilot-0.0.1-win-x64.zip` peker nå mot prod. Send til
pilotene - de trenger ikke kjøre noe lokalt.

---

## Steg 8: Test fra ny PC (~10 min)

For å bekrefte at det fungerer som det skal for sluttbrukere:

1. Send .zip-fila til deg selv på en annen e-post
2. Last ned på en annen PC (jobb-PC, gammel laptop, hva som helst)
3. Pakk ut + dobbeltklikk Sakspilot.exe
4. Logg inn med kontoen din
5. Dashbord skal vise dine ekte data fra Neon

Hvis det funker: du er klar for Nicole.

---

## Vanlige problemer

| Symptom | Sannsynlig årsak | Fiks |
|---|---|---|
| API-bygg feiler med "prisma generate" | Schema-sti feil | Sjekk at railway.json buildCommand stemmer |
| Web-bygg feiler med "out of memory" | Next.js trenger mer RAM | Settings → upgrade til 2GB RAM ($5 ekstra/mnd) |
| `sakspilot.no` viser Railway-feil | DNS ikke propagert ennå | Vent 30 min, sjekk med nslookup |
| Login feiler "CORS error" | FRONTEND_URL stemmer ikke | Sjekk env-var, må inkludere både `https://sakspilot.no` og www-versjonen |
| Kan ikke koble til database | DATABASE_URL feil kopiert | Sjekk at det er pooled-URL'en (med `-pooler` i hostname) |

---

## Etter deploy - du har:

✅ Sakspilot live på https://sakspilot.no  
✅ API live på https://api.sakspilot.no  
✅ SSL/HTTPS automatisk  
✅ Auto-deploy ved hver `git push` til main  
✅ Klar til pilotene - bare last ned .exe og dobbeltklikk  

**Kostnad totalt:** Railway $5/mnd + domeneshop $99/år = ~605 kr/år
