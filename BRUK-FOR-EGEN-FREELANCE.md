# Bruke Sakspilot for egen freelance

Du har et helt fungerende verktøy for ditt eget bruk akkurat nå.
Sakspilot er bevisst generisk - det er ikke kun for byggebransjen.
Du har **akkurat samme profil** som målgruppen: flere klienter,
forskjellige programmer, fakturerer per time.

## Sette opp dine egne klienter (15 minutter, gjøres én gang)

Åpne **http://localhost:3001** (eller den deployede sakspilot.no
når den er klar) og opprett kontoen din med din egne e-post.

### Klienter du burde opprette først

Basert på din portefølje (fra MEMORY.md):

| Klient | Forslag timesats |
|---|---|
| Luxushair (BrandStudio) | 800-1200 kr/t |
| Patience Sportswear | 800 kr/t |
| Sjakktrening.no (Kristoffer Gressli) | 800 kr/t |
| Toraderklubben | 900 kr/t (hack-cleanup ofte høyere) |
| Fotovegg.no (Steinar Jokstad) | 800 kr/t |
| ConsentPilot (eget produkt, intern) | – |
| aioptimalisering (eget produkt) | – |

### Saker - én per oppdrag/feature

For hver klient, opprett saker du jobber med. Eksempler:

| Sak | Klient | Matching-mønster |
|---|---|---|
| Patience: Pre-launch fiks | Patience Sportswear | `patience` |
| Sjakktrening: ytelsesoptimalisering | Sjakktrening | `sjakktrening` |
| Toraderklubben: redegjørelse + cleanup | Toraderklubben | `toradeklubben` |
| Fotovegg: WooCommerce-oppsett | Fotovegg | `fotovegg` |
| Luxushair: BrandStudio | Luxushair | `luxushair|brandstudio` |
| aioptimalisering: utvikling | (intern, ikke fakturerbart) | `aioptimalisering` |

## Matching-regler som funker for DEG (utvikler)

På hver sak, klikk **⚡ Velg mal**. Du har nå disse nye utvikler-malene:

- 💻 **VS Code / Cursor (auto fra sakens navn)** - editor-vinduer
- 🐙 **GitHub-repo** - Chrome-tab på sakens repo
- 🌐 **WordPress-admin for klient** - wp-admin på klientens side
- 🎨 **Figma med sakens navn** - designarbeid
- ⌨️ **Terminal i sak-mappa** - PowerShell/cmd med mappenavn
- 🤖 **Claude Code (i sak-mappa)** - denne typen samtaler!
- 📞 **Teams-møte med klient** - møtevinduer
- 🌐 **Browser på klient-domene** - patiencesportswear.no, sjakktrening.no osv.

Pluss de generelle (Outlook, alle .docx/.xlsx/.pdf, Holte, Tripletex...).

### Eksempel: sett opp "Patience: Pre-launch fiks"

1. Opprett klient `Patience Sportswear` (sats 800 kr/t)
2. Opprett sak `Patience pre-launch` knyttet til klienten
3. Sett **folderPath** = `C:\Users\helen\Desktop\patience` (din lokale mappe)
4. Klikk **⚡ Velg mal** → legg til:
   - **VS Code / Cursor (auto fra sakens navn)** - fanger editor-vinduer med "patience" i tittel
   - **WordPress-admin for klient** - fanger Chrome-tab `patiencesportswear.no/wp-admin`
   - **Browser på klient-domene** - alle Chrome-tabs på `.patiencesportswear`
   - **Terminal i sak-mappa** - PowerShell med `patience` i tittel
   - **Claude Code (i sak-mappa)** - denne samtalen!

Nå fanger Sakspilot ALT du gjør for Patience uansett hvilket program, automatisk.

## Auto-spor - alternativ til matching-regler (anbefalt)

Hvis du synes matching-regler er for mye styr, er det nå en enklere vei:

1. Åpne Sakspilot
2. Tray → klikk **🎯 Auto-spor AV** (eller widget-pillen) → slå PÅ
3. Naviger til saken du jobber med (`/saker/[id]` i web)
4. Åpne alt du trenger via Sakspilot - Launcher-snarvei, Mine sites, Mine mapper, lokal .exe
5. Alt logges automatisk som sessions på den aktive saken

Bytter du sak (navigerer til en annen `/saker/[id]`) tilordnes nye åpne-handlinger til den nye saken. Matching-regler funker fortsatt og overstyrer auto-spor - så du kan kombinere.

## Daglig flyt (klassisk - med matching-regler)

**Morgen:**
1. Dobbeltklikk `Sakspilot.exe` (eller `Start - Sakspilot desktop.bat`)
2. Tray-ikon dukker opp
3. Høyreklikk → **▶ Start arbeidsøkt**
4. Jobb som vanlig

**Underveis:**
- Bytt mellom kunder, det er greit - agenten bytter sak automatisk
- Vil du pause for lunsj? Høyreklikk → **⏸ Pause**

**Slutt av dag:**
1. Høyreklikk → **■ Stopp + rapport**
2. Velg hvor Excel-fila lagres
3. Du har komplett fakturagrunnlag per kunde

**Send til kunde:**
- Åpne Excel-fila
- "Per sak"-arket viser timer × sats = beløp per kunde
- Lim inn i din Tripletex/Fiken eller send Excel-fila som vedlegg

## Dogfooding = beste salgsargument

Du blir din egen første betalende kunde. Når du skal selge til Nicole:

> "Jeg har brukt Sakspilot for min egen freelance i 4 uker - fanget
> 23 timer mer enn jeg ville fakturert manuelt. Det er 18 400 kr ekstra
> i måneden bare ved å bruke det selv. Vil du prøve?"

Det er en uovervinnelig pitch.

## Konkrete saker du kan opprette NÅ

Kopier disse i Sakspilot, en og en:

```
Klient: Patience Sportswear (sats 800)
Sak:    Pre-launch oppfølging
        folderPath: [din mappe]
        Maler: VS Code, WP-admin, Browser-domene, Claude Code

Klient: Sjakktrening (sats 800)
Sak:    Ytelsesoptimalisering
        Maler: WP-admin, Browser-domene, Claude Code

Klient: Tech Solutions / Helene (intern, sats 0)
Sak:    Sakspilot-utvikling
        folderPath: C:\Users\helen\Desktop\sakspilot
        Maler: VS Code, GitHub, Terminal, Claude Code

Klient: Tech Solutions / Helene (intern, sats 0)
Sak:    ByggPilot-vedlikehold
        folderPath: C:\Users\helen\Desktop\byggpilot-node
        Maler: VS Code, GitHub, Terminal
```

Etter 1 uke har du faktisk data på hvor mye tid hvert prosjekt
faktisk tar. Innsikt verdt mye mer enn tiden det tok å sette opp.
