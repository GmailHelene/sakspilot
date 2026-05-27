#!/usr/bin/env node
/**
 * Cross-resolve electron-binæret uansett om det er hoisted til
 * root node_modules (workspaces) eller ligger lokalt.
 *
 * Erstatter "electron ." i package.json fordi npm-workspaces ikke
 * alltid legger hoisted .bin i PATH før scripts kjører.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

// require.resolve finner pakken uansett hvor i node_modules-treet den ligger
let electronPath;
try {
  // electron eksporterer stien til binæret som default-export
  electronPath = require('electron');
} catch (err) {
  console.error('\n❌ Kunne ikke finne electron-pakken.');
  console.error('   Kjør "npm install" i prosjektets rot-mappe (Sakspilot).');
  console.error('   Detalj:', err.message);
  process.exit(1);
}

const args = [path.join(__dirname), ...process.argv.slice(2)];
const child = spawn(electronPath, args, {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Electron-start feilet:', err.message);
  process.exit(1);
});
