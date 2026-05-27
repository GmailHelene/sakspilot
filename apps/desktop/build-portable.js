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
const RELEASE_DIR = path.join(ROOT, 'release');
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

  // ── Steg 1: rydd release/ ─────────────────────────────────
  step(1, 6, 'Rydder release/...');
  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
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
  step(4, 6, 'Pakker Electron-app...');
  const packager = require(path.join(TEMP_DIR, 'node_modules', '@electron', 'packager'));
  const fn = packager.packager || packager.default || packager;
  const appPaths = await fn({
    dir: TEMP_DIR,
    out: RELEASE_DIR,
    name: 'Sakspilot',
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: true,
    appVersion: pkg.version,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} ${pkg.author?.name || 'Sakspilot'}`,
    icon: path.join(TEMP_DIR, 'assets', 'icon.png'),
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
