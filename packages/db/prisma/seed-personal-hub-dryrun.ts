/**
 * Tørrkjøring: validerer at hub-backupen kan parses og at mapping er fornuftig.
 * Skriver INGENTING til DB.
 *
 * Kjør:  npx tsx prisma/seed-personal-hub-dryrun.ts [path/til/backup.json]
 */
import * as fs from "node:fs";

const file = process.argv[2] || "C:\\Users\\helen\\Desktop\\portal-backup-2026-06-02.json";

if (!fs.existsSync(file)) {
  console.error(`Backup ikke funnet: ${file}`);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(file, "utf8"));

function mapLeadStatus(s?: string) {
  switch ((s || "").toLowerCase()) {
    case "ny":           return "ny";
    case "i_dialog":
    case "dialog":
    case "tilbud":       return "i_dialog";
    case "vunnet":       return "vunnet";
    case "tapt":         return "tapt";
    case "arkivert":     return "arkivert";
    default:             return "ny";
  }
}

console.log(`\n=== DRY-RUN av hub-import ===\n`);
console.log(`Backup: ${file}\n`);

console.log(`leads:    ${backup.leads?.length ?? 0}`);
for (const l of backup.leads || []) {
  console.log(`  ${mapLeadStatus(l.status).padEnd(8)} ${l.kunde || l.tittel} (kilde: ${l.kontakt || '—'})`);
}

console.log(`\ninvoices: ${backup.invoices?.length ?? 0}`);
for (const i of backup.invoices || []) {
  const total = (i.linjer || []).reduce((s: number, l: { pris: number; antall: number }) => s + l.pris * l.antall, 0);
  const status = i.betalt ? 'BETALT' : 'UBETALT';
  console.log(`  #${i.nummer || '—'} ${i.dato} ${i.kunde} ${total.toLocaleString('nb-NO')} kr [${status}]`);
}

console.log(`\nexpenses: ${backup.expenses?.length ?? 0}`);
for (const e of backup.expenses || []) {
  console.log(`  ${e.dato} ${e.beskrivelse} ${e.belop} kr`);
}

console.log(`\n=== Klar til seed. Kjør: npm run db:seed-personal-hub ===\n`);
