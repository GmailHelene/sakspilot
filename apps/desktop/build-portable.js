#!/usr/bin/env node
/**
 * Build Sakspilot som portable Windows-app.
 *
 * Strategi: kopier til temp-mappe UTENFOR npm workspace, kjør npm install
 * + electron-packager der. Dette unngår den vrange workspaces-hoisting-
 * bugger som har stoppet både electron-builder og @electron/packager.
 *
 * Output:
 *   release/Sakspilot-win32-x64/      — portable app, bare dobbeltklikk
 *   release/Sakspilot-X.Y.Z-win-x64.zip — distribusjons-pakke
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync, spawnSync } = require('node:child_process');

const ROOT = __dirname;
// Default = 'release'. Hvis sletting feiler (typisk: Sakspilot.exe kjørte
// tidligere og noe holder filer låst), bruker vi 'release-<timestamp>' i stedet.
let RELEASE_DIR = path.join(ROOT, 'release');
const TEMP_DIR = path.join(os.tmpdir(), 'sakspilot-build-' + Date.now());

function step(n, total, text) {
  console.log(`\n[${n}/${total}] ${text}`);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Sakspilot — portable Windows-build (isolert)');
  console.log('══════════════════════════════════════════════════════════');

  const pkg = require('./package.json');
  console.log(`Versjon:    ${pkg.version}`);
  console.log(`Temp:       ${TEMP_DIR}`);
  console.log(`Release:    ${RELEASE_DIR}`);

  // ── Steg 0: drep eventuelle Sakspilot/electron-prosesser ──
  // (forrige Sakspilot.exe låser release-mappa hvis den fortsatt kjører)
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
    console.log('   (gammel release/ er låst — gå inn manuelt og slett den senere)');
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

  // ── Steg 3.5: import packager FØR vi sletter dev-deps,
  //              ellers kan vi ikke kjøre den.
  const packager = require(path.join(TEMP_DIR, 'node_modules', '@electron', 'packager'));

  // ── Steg 3.6: MANUELT slett dev-deps fra TEMP_DIR/node_modules ──
  // npm v11 sin --omit=dev + packager sin prune:true fungerte ikke i
  // workspace-kontekst. Vi sletter dev-deps eksplisitt så app.asar
  // ikke vokser til 1 GB+.
  console.log('       Sletter dev-deps manuelt før pakking...');
  const devToRemove = [
    'electron',
    '@electron/packager',
    'electron-builder',
    'png-to-ico',
    'pngjs',
    '@develar',
    '@malept',
    '@electron/asar',
    '@electron/get',
    '@electron/notarize',
    '@electron/osx-sign',
    '@electron/universal',
    '@electron/rebuild',
    '7zip-bin',
    'app-builder-bin',
    'app-builder-lib',
    'dmg-builder',
    'dmg-license',
    'builder-util',
    'builder-util-runtime',
  ];
  for (const dep of devToRemove) {
    const depPath = path.join(TEMP_DIR, 'node_modules', dep);
    if (fs.existsSync(depPath)) {
      try {
        fs.rmSync(depPath, { recursive: true, force: true });
      } catch (err) {
        console.log(`         (kunne ikke slette ${dep}: ${err.message})`);
      }
    }
  }

  // ── Steg 4: kjør electron-packager ────────────────────────
  step(4, 6, 'Pakker Electron-app...');
  const fn = packager.packager || packager.default || packager;
  const appPaths = await fn({
    dir: TEMP_DIR,
    out: RELEASE_DIR,
    name: 'Sakspilot',
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: true,
    // prune er TRUE by default — men i workspace-monorepo + npm v11 fungerte
    // det ikke (electron + @electron/packager + transitives havnet i app.asar).
    // Kjør manuell prune før packager (gjort under), pluss ignore-mønstre
    // som backup.
    prune: true,
    appVersion: pkg.version,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} ${pkg.author?.name || 'Sakspilot'}`,
    // Windows: bruker .ico (multi-resolution) som blir embedded i .exe-binaryen.
    // Uten dette blir taskbar-ikonet Electron-default (atom-symbol).
    // Faller tilbake til .png hvis .ico mangler (Linux/Mac-builds eller første build).
    icon: fs.existsSync(path.join(TEMP_DIR, 'assets', 'icon.ico'))
      ? path.join(TEMP_DIR, 'assets', 'icon.ico')
      : path.join(TEMP_DIR, 'assets', 'icon.png'),
    win32metadata: {
      CompanyName: pkg.author?.name || 'Sakspilot',
      ProductName: 'Sakspilot',
      FileDescription: 'Workspace for selvstendig næringsdrivende',
      OriginalFilename: 'Sakspilot.exe',
    },
    ignore: [
      /^\/release($|\/)/,
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
  });

  const appDir = appPaths[0];
  const exePath = path.join(appDir, 'Sakspilot.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error(`Sakspilot.exe ikke generert (forventet: ${exePath})`);
  }
  const exeSize = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
  console.log(`      ✓ Sakspilot.exe (${exeSize} MB)`);

  // ── Steg 5: lag LES-MEG og zip ────────────────────────────
  step(5, 6, 'Lager LES-MEG + .zip...');
  fs.writeFileSync(
    path.join(appDir, 'LES-MEG-FØRST.txt'),
    `Sakspilot — portable utgave
================================

1. Dobbeltklikk Sakspilot.exe for å starte.
2. Tray-ikonet dukker opp ved klokka.
3. Logg inn med samme bruker som på sakspilot.no.

For å avinstallere: slett denne mappa.
Ingen registry-spor, ingen admin-rettigheter, ingenting installert.

Versjon:  ${pkg.version}
Bygget:   ${new Date().toISOString()}
`
  );

  const zipName = `Sakspilot-${pkg.version}-win-x64.zip`;
  const zipPath = path.join(RELEASE_DIR, zipName);
  await zipDirectory(appDir, zipPath);
  const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`      ✓ ${zipName} (${zipSize} MB)`);

  // ── Steg 6: rydd temp ─────────────────────────────────────
  step(6, 6, 'Rydder temp-mappe...');
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (e) {
    console.log(`      ⚠ Klarte ikke slette ${TEMP_DIR} — du kan slette manuelt`);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✓ Ferdig!');
  console.log(`  Mappe:  ${appDir}`);
  console.log(`  Zip:    ${zipPath}`);
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('Distribuer .zip-fila til pilotene. De pakker ut + dobbeltklikker Sakspilot.exe.\n');
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

function copyRecursive(src, dest, ignore = []) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (ignore.includes(base)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), ignore);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    // Bruk archiver fra temp-mappa (eller fra root hvis tilgjengelig)
    let archiver;
    try {
      archiver = require(path.join(TEMP_DIR, 'node_modules', 'archiver'));
    } catch {
      try {
        archiver = require('archiver');
      } catch {
        return reject(new Error('archiver ikke tilgjengelig — kan ikke zippe'));
      }
    }
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
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
