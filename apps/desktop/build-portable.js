#!/usr/bin/env node
/**
 * Build Sakspilot som portable desktop-app (cross-platform).
 *
 * Strategi: kopier til temp-mappe UTENFOR npm workspace, kjør npm install
 * + electron-packager der. Dette unngår den vrange workspaces-hoisting-
 * bugger som har stoppet både electron-builder og @electron/packager.
 *
 * Usage:
 *   node build-portable.js                          # current platform, x64
 *   node build-portable.js --platform=darwin                # macOS Intel
 *   node build-portable.js --platform=darwin --arch=arm64   # Apple Silicon (M1/M2/M3)
 *   node build-portable.js --platform=linux                 # Linux x64 (.tar.gz)
 *
 * Output:
 *   Windows:  release/Sakspilot-win32-x64/Sakspilot.exe + .zip
 *   macOS:    release/Sakspilot-darwin-{arch}/Sakspilot.app + .zip + .dmg*
 *   Linux:    release/Sakspilot-linux-x64/Sakspilot + .tar.gz
 *
 *   * .dmg lages bare når host-OS er macOS (krever hdiutil — Apple-only).
 *     På Windows/Linux-host kan vi bygge .app + .zip cross-platform, men
 *     må kjøre GitHub Actions macos-latest for å få .dmg.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync, spawnSync } = require('node:child_process');

const ROOT = __dirname;

// ── Parse CLI args ───────────────────────────────────────────
function parseArgs() {
  const args = { platform: process.platform, arch: 'x64' };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  // Normalisering
  if (!['win32', 'darwin', 'linux'].includes(args.platform)) {
    throw new Error(`Unsupported --platform: ${args.platform} (must be win32|darwin|linux)`);
  }
  if (!['x64', 'arm64'].includes(args.arch)) {
    throw new Error(`Unsupported --arch: ${args.arch} (must be x64|arm64)`);
  }
  return args;
}

const BUILD = parseArgs();
const IS_WIN = BUILD.platform === 'win32';
const IS_MAC = BUILD.platform === 'darwin';
const IS_LINUX = BUILD.platform === 'linux';

// Plattform-spesifikke navn
const PLATFORM_LABEL = IS_WIN ? 'win' : IS_MAC ? 'mac' : 'linux';
const EXEC_NAME = IS_WIN ? 'Sakspilot.exe'
  : IS_MAC ? 'Sakspilot.app'   // .app er en mappe på macOS
  : 'Sakspilot';                // Linux binary uten extension

// Default = 'release'. Hvis sletting feiler (typisk: Sakspilot.exe kjørte
// tidligere og noe holder filer låst), bruker vi 'release-<timestamp>' i stedet.
let RELEASE_DIR = path.join(ROOT, 'release');
const TEMP_DIR = path.join(os.tmpdir(), 'sakspilot-build-' + Date.now());

function step(n, total, text) {
  console.log(`\n[${n}/${total}] ${text}`);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Sakspilot - portable build (${BUILD.platform}/${BUILD.arch})`);
  console.log('══════════════════════════════════════════════════════════');

  const pkg = require('./package.json');
  console.log(`Versjon:    ${pkg.version}`);
  console.log(`Platform:   ${BUILD.platform} (${BUILD.arch})`);
  console.log(`Host OS:    ${process.platform}`);
  console.log(`Temp:       ${TEMP_DIR}`);
  console.log(`Release:    ${RELEASE_DIR}`);

  // Advarsel ved cross-platform build (active-win er native, må compileres
  // på target-OS for å fungere — krever rebuild eller bygging på riktig OS)
  if (BUILD.platform !== process.platform) {
    console.log('\n⚠  Cross-platform-build: native modules (active-win) bygges normalt');
    console.log('   for host-OS, ikke target. Anbefales å kjøre denne builden PÅ');
    console.log(`   target-OS (${BUILD.platform}) - bruk GitHub Actions matrix-runner.`);
  }

  // ── Steg 0: drep eventuelle Sakspilot/electron-prosesser ──
  // (forrige Sakspilot.exe låser release-mappa hvis den fortsatt kjører)
  // Bare relevant på Windows der filsystem-locking er strikt.
  if (process.platform === 'win32') {
    console.log('\nStopper eventuelle kjørende Sakspilot/electron-prosesser...');
    try { execSync('taskkill /F /IM Sakspilot.exe /T 2>nul', { stdio: 'ignore' }); } catch {}
    try { execSync('taskkill /F /IM electron.exe /T 2>nul', { stdio: 'ignore' }); } catch {}
    await sleep(1500);
  }

  // ── Steg 1: rydd release/ (med retry mot EPERM) ───────────
  // Hvis sletting feiler (typisk Defender som scanner), faller vi tilbake
  // på release-<timestamp>/ så build kan fullføres.
  step(1, 6, 'Rydder release/...');
  try {
    await rmWithRetry(RELEASE_DIR);
  } catch (err) {
    const fallback = path.join(ROOT, 'release-' + Date.now());
    console.log(`\n⚠  Bruker fallback output-mappe: ${path.basename(fallback)}`);
    console.log('   (gammel release/ er låst - gå inn manuelt og slett den senere)');
    RELEASE_DIR = fallback;
  }
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // ── Steg 2: kopier kilden til temp ────────────────────────
  step(2, 6, 'Kopierer kildekode til isolert temp-mappe...');
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  copyRecursive(ROOT, TEMP_DIR, ['node_modules', 'release', 'dist']);

  // Bytt package.json til å være ikke-workspace (standalone)
  const tempPkg = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, 'package.json'), 'utf8'));
  delete tempPkg.workspaces;
  // Fjern postinstall — vi har allerede ikoner kopiert, ikke generer dem på nytt
  if (tempPkg.scripts) delete tempPkg.scripts.postinstall;
  fs.writeFileSync(
    path.join(TEMP_DIR, 'package.json'),
    JSON.stringify(tempPkg, null, 2)
  );

  // ── Steg 3: npm install i temp (uten workspace-kontekst) ──
  step(3, 6, 'Kjører npm install i isolert mappe (kan ta 2-3 min)...');
  const installRes = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: TEMP_DIR,
    stdio: 'inherit',
    shell: true,
  });
  if (installRes.status !== 0) {
    throw new Error('npm install (prod) feilet i temp-mappe');
  }

  // electron + @electron/packager må også installeres (devDeps)
  const installDevRes = spawnSync(
    'npm',
    ['install', '--save-dev', 'electron@30.5.1', '@electron/packager@18.3.6', '--no-audit', '--no-fund'],
    { cwd: TEMP_DIR, stdio: 'inherit', shell: true }
  );
  if (installDevRes.status !== 0) {
    throw new Error('npm install (dev) feilet i temp-mappe');
  }

  // ── Steg 4: kjør electron-packager ────────────────────────
  // Packager + dets dev-deps må forbli i node_modules (de trengs for å
  // KJØRE packager). Dev-deps blir filtrert ut av app.asar via 'ignore'-
  // mønstre under (se nedenfor).
  step(4, 6, 'Pakker Electron-app...');
  const packager = require(path.join(TEMP_DIR, 'node_modules', '@electron', 'packager'));
  const fn = packager.packager || packager.default || packager;

  // Plattform-spesifikk ikon-path. .ico for win, .icns for mac, .png for linux.
  // Faller tilbake til .png hvis spesifikt format mangler.
  function pickIcon() {
    const assets = path.join(TEMP_DIR, 'assets');
    const png = path.join(assets, 'icon.png');
    if (IS_WIN) {
      const ico = path.join(assets, 'icon.ico');
      return fs.existsSync(ico) ? ico : png;
    }
    if (IS_MAC) {
      const icns = path.join(assets, 'icon.icns');
      return fs.existsSync(icns) ? icns : png;
    }
    return png; // Linux
  }

  const appPaths = await fn({
    dir: TEMP_DIR,
    out: RELEASE_DIR,
    name: 'Sakspilot',
    platform: BUILD.platform,
    arch: BUILD.arch,
    overwrite: true,
    asar: true,
    // prune er TRUE by default — men i workspace-monorepo + npm v11 fungerte
    // det ikke (electron + @electron/packager + transitives havnet i app.asar).
    // Kjør manuell prune før packager (gjort under), pluss ignore-mønstre
    // som backup.
    prune: true,
    appVersion: pkg.version,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} ${pkg.author?.name || 'Sakspilot'}`,
    appBundleId: 'no.helene.sakspilot', // brukes på macOS (CFBundleIdentifier)
    appCategoryType: 'public.app-category.productivity', // macOS LSApplicationCategoryType
    icon: pickIcon(),
    // Windows-spesifikk metadata embedded i .exe
    ...(IS_WIN && {
      win32metadata: {
        CompanyName: pkg.author?.name || 'Sakspilot',
        ProductName: 'Sakspilot',
        FileDescription: 'Workspace for selvstendig næringsdrivende',
        OriginalFilename: 'Sakspilot.exe',
      },
    }),
    // macOS code-signing — krever Apple Developer ID cert (~$99/år).
    // TODO: aktiver når sertifikat er på plass via OSX_SIGN_IDENTITY env var.
    // ...(IS_MAC && process.env.OSX_SIGN_IDENTITY && {
    //   osxSign: { identity: process.env.OSX_SIGN_IDENTITY, 'hardened-runtime': true },
    //   osxNotarize: {
    //     appleId: process.env.APPLE_ID,
    //     appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    //     teamId: process.env.APPLE_TEAM_ID,
    //   },
    // }),
    ignore: [
      // Inkluder BÅDE 'release' og timestamped 'release-1780238...' (sistnevnte
      // brukes som fallback når 'release' er låst). Tidligere bug: bare /release/
      // ble fanget, så hver build pakket forrige builds release-* inn i ny asar
      // og asar vokste eksponentielt (460 MB → 1 GB → 3 GB).
      /^\/release(-\d+)?($|\/)/,
      /^\/scripts($|\/)/,
      /^\/src\/(poc-logger|diagnose)\.js$/,
      /^\/build-portable\.js$/,
      /^\/start-electron\.js$/,
      /\.md$/i,
      // Dev-deps som ikke skal med i app.asar (backup hvis manuell sletting
      // over har feilet). Belt + suspenders.
      /^\/node_modules\/electron($|\/)/,
      /^\/node_modules\/@electron($|\/)/,
      /^\/node_modules\/@develar($|\/)/,
      /^\/node_modules\/@malept($|\/)/,
      /^\/node_modules\/electron-builder($|\/)/,
      /^\/node_modules\/app-builder-(bin|lib)($|\/)/,
      /^\/node_modules\/builder-util($|\/)/,
      /^\/node_modules\/builder-util-runtime($|\/)/,
      /^\/node_modules\/dmg-(builder|license)($|\/)/,
      /^\/node_modules\/7zip-bin($|\/)/,
      /^\/node_modules\/png-to-ico($|\/)/,
      /^\/node_modules\/pngjs($|\/)/,
    ],
    // afterPrune: kjøres etter packagers egen prune-fase men FØR asar-pakking.
    // Vi sletter aggressivt kjente dev-dirs som har sneket seg med (transitive
    // avhengigheter fra @electron/packager osv som ikke ble fanget av prune).
    afterPrune: [(buildPath, _electronVersion, _platform, _arch, callback) => {
      const fs = require('node:fs');
      const path = require('node:path');
      const DEV_DIRS = [
        '@electron', '@develar', '@malept',
        'electron', 'electron-builder', 'electron-packager',
        'app-builder-bin', 'app-builder-lib',
        'builder-util', 'builder-util-runtime',
        'dmg-builder', 'dmg-license',
        '7zip-bin', 'png-to-ico', 'pngjs',
        'extract-zip', 'plist', 'xmlbuilder', 'xmlbuilder2',
        'node-abi', 'sumchecker', 'global-agent', 'global-tunnel-ng',
        'matcher', 'pe-library', 'resedit',
        '@sindresorhus', '@szmarczak',
      ];
      const nm = path.join(buildPath, 'node_modules');
      let nuked = 0, bytesFreed = 0;
      try {
        for (const d of DEV_DIRS) {
          const target = path.join(nm, d);
          if (fs.existsSync(target)) {
            try { bytesFreed += dirSize(target); } catch {}
            fs.rmSync(target, { recursive: true, force: true });
            nuked++;
          }
        }
        console.log(`      afterPrune: slettet ${nuked} dev-deps (~${(bytesFreed/1024/1024).toFixed(1)} MB)`);
      } catch (err) {
        console.warn('      afterPrune-feil (ikke fatal):', err.message);
      }
      callback();
    }],
  });

  const appDir = appPaths[0];
  // Plattform-spesifikk path til hoved-executable (eller .app bundle på mac)
  const execPath = path.join(appDir, EXEC_NAME);
  if (!fs.existsSync(execPath)) {
    throw new Error(`${EXEC_NAME} ikke generert (forventet: ${execPath})`);
  }
  // På mac er .app en mappe — vis bare at den eksisterer
  let sizeStr;
  if (IS_MAC) {
    const totalBytes = dirSize(execPath);
    sizeStr = `${(totalBytes / 1024 / 1024).toFixed(1)} MB (bundle)`;
  } else {
    sizeStr = `${(fs.statSync(execPath).size / 1024 / 1024).toFixed(1)} MB`;
  }
  console.log(`      ✓ ${EXEC_NAME} (${sizeStr})`);

  // ── Steg 5: lag LES-MEG og zip/tar ────────────────────────
  step(5, 6, 'Lager LES-MEG + arkiv...');
  const readmeContent = makeReadme(pkg.version);
  fs.writeFileSync(path.join(appDir, 'LES-MEG-FØRST.txt'), readmeContent);

  // Arkiv-navn følger plattform: .zip for Windows/Mac, .tar.gz for Linux.
  // På mac lager vi BÅDE .zip OG .dmg (sistnevnte krever Mac-host pga hdiutil).
  const archiveExt = IS_LINUX ? 'tar.gz' : 'zip';
  const archiveName = `Sakspilot-${pkg.version}-${PLATFORM_LABEL}-${BUILD.arch}.${archiveExt}`;
  const archivePath = path.join(RELEASE_DIR, archiveName);
  if (IS_LINUX) {
    // TODO: AppImage-pakking krever appimagetool (ekstra binær). Leverer
    // .tar.gz nå — bruker pakker ut og kjører ./Sakspilot direkte.
    await tarGzDirectory(appDir, archivePath);
  } else {
    await zipDirectory(appDir, archivePath);
  }
  const archiveSize = (fs.statSync(archivePath).size / 1024 / 1024).toFixed(1);
  console.log(`      ✓ ${archiveName} (${archiveSize} MB)`);

  // ── .dmg-bygging (kun macOS-host) ─────────────────────────
  // hdiutil er innebygd i macOS — finnes ikke på Windows/Linux.
  // GitHub Actions matrix kjører dette steget på macos-latest runner.
  // En .dmg gir Mac-brukere drag-to-Applications-vinduet de forventer
  // og er den de facto standarden for Mac-distribusjon.
  if (IS_MAC && process.platform === 'darwin') {
    const dmgName = `Sakspilot-${pkg.version}-${PLATFORM_LABEL}-${BUILD.arch}.dmg`;
    const dmgPath = path.join(RELEASE_DIR, dmgName);
    try {
      await buildDmg({
        appPath: execPath,         // /path/to/Sakspilot.app
        dmgPath,
        volumeName: `Sakspilot ${pkg.version}`,
      });
      const dmgSize = (fs.statSync(dmgPath).size / 1024 / 1024).toFixed(1);
      console.log(`      ✓ ${dmgName} (${dmgSize} MB)`);
    } catch (err) {
      console.warn(`      ⚠ .dmg-bygging feilet (ikke fatal): ${err.message}`);
      console.warn(`        Brukere kan fortsatt installere via .zip-en.`);
    }
  } else if (IS_MAC) {
    console.log(`      ⓘ .dmg hoppes over - krever macOS-host (hdiutil). Bygg via GitHub Actions for å få .dmg.`);
  }

  // ── Steg 6: rydd temp ─────────────────────────────────────
  step(6, 6, 'Rydder temp-mappe...');
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (e) {
    console.log(`      ⚠ Klarte ikke slette ${TEMP_DIR} - du kan slette manuelt`);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✓ Ferdig!');
  console.log(`  Mappe:   ${appDir}`);
  console.log(`  Arkiv:   ${archivePath}`);
  console.log('══════════════════════════════════════════════════════════\n');
  const howTo = IS_WIN
    ? 'pakker ut + dobbeltklikker Sakspilot.exe'
    : IS_MAC
      ? 'pakker ut + drar Sakspilot.app til Applications (høyreklikk → Åpne første gang pga Gatekeeper)'
      : 'pakker ut .tar.gz og kjører ./Sakspilot i terminal';
  console.log(`Distribuer arkivet til pilotene. De ${howTo}.\n`);
}

function makeReadme(version) {
  if (IS_WIN) {
    return `Sakspilot - portable utgave (Windows)
================================

1. Dobbeltklikk Sakspilot.exe for å starte.
2. Tray-ikonet dukker opp ved klokka.
3. Logg inn med samme bruker som på sakspilot.no.

For å avinstallere: slett denne mappa.
Ingen registry-spor, ingen admin-rettigheter, ingenting installert.

Versjon:  ${version}
Bygget:   ${new Date().toISOString()}
`;
  }
  if (IS_MAC) {
    return `Sakspilot - portable utgave (macOS)
================================

1. Dra Sakspilot.app til /Applications.
2. FØRSTE GANG: Høyreklikk Sakspilot.app → "Åpne" → "Åpne" i dialog.
   (Dette er nødvendig fordi appen ikke er notarisert hos Apple ennå.)
3. Gi appen Accessibility-tilgang når macOS spør:
   System Settings → Privacy & Security → Accessibility → huk av Sakspilot.
   (Dette er nødvendig for å lese aktivt vindu / tittel.)
4. Menubar-ikon dukker opp øverst.
5. Logg inn med samme bruker som på sakspilot.no.

For å avinstallere: dra Sakspilot.app til papirkurven.

Versjon:  ${version}
Bygget:   ${new Date().toISOString()}
`;
  }
  return `Sakspilot - portable utgave (Linux)
================================

1. Pakk ut tar.gz:   tar -xzf Sakspilot-*-linux-x64.tar.gz
2. Gå inn i mappa:   cd Sakspilot-linux-x64
3. Start:            ./Sakspilot
4. Tray-ikon dukker opp i system tray (krever StatusNotifierItem-støtte -
   GNOME trenger gnome-shell-extension-appindicator).
5. Logg inn med samme bruker som på sakspilot.no.

NB: Window-tracking (active-win) krever X11. På Wayland får du bare
app-navn, ikke window title.

For å avinstallere: slett mappa.

Versjon:  ${version}
Bygget:   ${new Date().toISOString()}
`;
}

// ── Hjelpere ───────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rmWithRetry(dir, attempts = 5) {
  if (!fs.existsSync(dir)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.error(`\n❌ Kunne ikke slette ${dir}`);
        console.error(`   Sannsynlige årsaker:`);
        console.error(`     - Sakspilot.exe kjører fortsatt (Task Manager → kill)`);
        console.error(`     - Filutforser har mappa åpen (lukk vinduet)`);
        console.error(`     - Antivirus skanner mappa (vent 30 sek og prøv igjen)`);
        throw err;
      }
      console.log(`      forsøk ${i + 1}/${attempts} feilet, venter 2s...`);
      await sleep(2000);
    }
  }
}

function dirSize(p) {
  let total = 0;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(p)) {
      total += dirSize(path.join(p, entry));
    }
  } else {
    total += stat.size;
  }
  return total;
}

function copyRecursive(src, dest, ignore = []) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const base = path.basename(src);
    // Eksakt match (node_modules, release, dist) ELLER timestamped
    // release-fallbacks (release-1780238407445 osv) — sistnevnte ble tidligere
    // kopiert med, og hver build pakket forrige builds release-* inn i ny
    // asar → eksponentiell størrelsesvekst (460 MB → 1 GB → 3 GB).
    if (ignore.includes(base)) return;
    if (/^release(-\d+)?$/.test(base)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), ignore);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function loadArchiver() {
  try {
    return require(path.join(TEMP_DIR, 'node_modules', 'archiver'));
  } catch {
    return require('archiver');
  }
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    let archiver;
    try { archiver = loadArchiver(); }
    catch { return reject(new Error('archiver ikke tilgjengelig - kan ikke zippe')); }
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, 'Sakspilot');
    archive.finalize();
  });
}

/**
 * Bygg .dmg-fil ved hjelp av hdiutil (Apple-only).
 *
 * Strategi: lag en midlertidig mappe som inneholder bare Sakspilot.app +
 * en symlink til /Applications (standard Mac drag-to-install-pattern),
 * og kjør hdiutil create på den.
 *
 * Resultat: når brukeren åpner .dmg-en får de et vindu med Sakspilot.app
 * til venstre og en "Applications"-snarvei til høyre. De drar ikonet over.
 *
 * @param {Object} opts
 * @param {string} opts.appPath    Absolutt path til Sakspilot.app
 * @param {string} opts.dmgPath    Hvor .dmg-en skal skrives
 * @param {string} opts.volumeName Vises som vindustittel når brukeren mounter
 */
async function buildDmg({ appPath, dmgPath, volumeName }) {
  const stagingDir = path.join(os.tmpdir(), 'sakspilot-dmg-staging-' + Date.now());
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    // Kopier (rsync bevarer symlinks + permissions i .app-bundlet)
    execSync(`cp -R "${appPath}" "${stagingDir}/"`, { stdio: 'inherit' });

    // Symlink til /Applications så brukeren bare drar over
    fs.symlinkSync('/Applications', path.join(stagingDir, 'Applications'));

    // Slett gammel .dmg om den finnes (hdiutil feiler ellers)
    if (fs.existsSync(dmgPath)) fs.unlinkSync(dmgPath);

    // -format UDZO = komprimert (zlib). UDRW = read/write (større, ikke nødvendig).
    // -volname blir vindustittelen i Finder.
    // Hvis vi senere vil ha bakgrunnsbilde + ikon-posisjoner: legg til
    // create-dmg eller appdmg som dep. Foreløpig: minimalistisk drag-vindu.
    execSync(
      `hdiutil create -volname "${volumeName}" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`,
      { stdio: 'inherit' }
    );
  } finally {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  }
}

function tarGzDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    let archiver;
    try { archiver = loadArchiver(); }
    catch { return reject(new Error('archiver ikke tilgjengelig - kan ikke tar.gz')); }
    const output = fs.createWriteStream(outPath);
    // gzip-komprimert tar — standard på Linux. Bevarer exec-bit på Sakspilot-binaryen.
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, 'Sakspilot');
    archive.finalize();
  });
}

main().catch((err) => {
  console.error('\n❌ Build feilet:', err.message);
  if (err.stack) console.error(err.stack);
  // Forsøk å rydde temp
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch {}
  process.exit(1);
});
