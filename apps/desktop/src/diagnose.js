#!/usr/bin/env node
/**
 * Sakspilot Desktop Agent — diagnose-verktøy
 *
 * Tar et "snapshot" av aktivt vindu hver gang du trykker Enter.
 * Bruk dette til å teste hva get-windows returnerer for spesifikke apper
 * som du mistenker ikke detekteres riktig (Chrome, AutoCAD, Holte, osv.)
 *
 * Kjør:
 *   node src/diagnose.js
 *
 * Slik bruker du den:
 *   1. Start scriptet
 *   2. Klikk på vinduet du vil teste (Chrome, Word, hva som helst)
 *   3. Bytt fokus tilbake til terminalen og trykk Enter
 *   4. Se full info om vinduet
 *   5. Gjenta for andre apper
 *   6. Trykk Ctrl+C for å avslutte
 */

const readline = require('node:readline');

(async () => {
  let activeWindow;
  try {
    // active-win er cross-platform (win + mac + linux). Default-export er fn.
    const mod = await import('active-win');
    activeWindow = mod.default;
  } catch (err) {
    console.error('Kunne ikke laste active-win:', err.message);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║      Sakspilot — diagnose: snapshot av aktivt vindu             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('Slik bruker du:');
  console.log('  1. Klikk på vinduet du vil teste (Chrome, Word, AutoCAD, Holte, ...)');
  console.log('  2. Bytt tilbake til terminalen (Alt+Tab eller klikk)');
  console.log('  3. Trykk Enter — får snapshot fra 3 sekunder etter du trykker');
  console.log('     (3s ventetid så du rekker å klikke tilbake til appen)');
  console.log('  4. Ctrl+C for å avslutte\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let snapshotNum = 0;
  const prompt = () => {
    rl.question('▶ Trykk Enter for snapshot (eller bytt til app FØRST, så Enter)... ', async () => {
      snapshotNum++;
      console.log(`\n⏱  Venter 3 sekunder — bytt til appen du vil måle nå...`);

      // Countdown
      for (let i = 3; i > 0; i--) {
        process.stdout.write(`   ${i}... `);
        await new Promise((r) => setTimeout(r, 1000));
      }
      console.log('SNAPSHOT!\n');

      try {
        const win = await activeWindow();
        if (!win) {
          console.log('   ⚠ Ingen aktivt vindu (skjermlås? minimert?)\n');
        } else {
          console.log(`📸 Snapshot #${snapshotNum}:`);
          console.log('   ─────────────────────────────────────');
          console.log(`   tittel:         ${JSON.stringify(win.title)}`);
          console.log(`   plattform:      ${win.platform}`);
          console.log(`   id (vindu):     ${win.id}`);
          if (win.owner) {
            console.log(`   app-navn:       ${JSON.stringify(win.owner.name)}`);
            console.log(`   prosess-id:     ${win.owner.processId}`);
            console.log(`   exe-sti:        ${JSON.stringify(win.owner.path)}`);
            if (win.owner.bundleId) {
              console.log(`   bundle-id:      ${win.owner.bundleId}`);
            }
          }
          if (win.url) {
            console.log(`   URL (browser):  ${JSON.stringify(win.url)}`);
          }
          if (win.bounds) {
            console.log(`   bounds:         ${win.bounds.width}x${win.bounds.height} @ (${win.bounds.x},${win.bounds.y})`);
          }
          if (win.memoryUsage) {
            console.log(`   minnebruk:      ${(win.memoryUsage / 1024 / 1024).toFixed(1)} MB`);
          }
          console.log('   ─────────────────────────────────────\n');

          // Diagnostikk: er denne brukbar for sak-matching?
          const hasGoodTitle = win.title && win.title.length > 3 && win.title !== win.owner?.name;
          const hasPath = !!win.owner?.path;
          const hasUrl = !!win.url;

          if (hasGoodTitle) {
            console.log(`   ✅ God tittel — kan matches med regex (f.eks. /bygd[øo]y/i)`);
          } else {
            console.log(`   ⚠ Tittel er tom eller lik app-navn — vanskeligere å matche`);
          }
          if (hasUrl) {
            console.log(`   ✅ URL tilgjengelig — kan matche på nettside (Holte, Tripletex osv.)`);
          }
          if (hasPath) {
            console.log(`   ✅ Filsti tilgjengelig — kan matche på prosjektmappe`);
          }
          console.log('');
        }
      } catch (err) {
        console.log(`   ❌ FEIL: ${err.message}\n`);
      }

      prompt();
    });
  };
  prompt();
})();
