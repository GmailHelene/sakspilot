/**
 * Tørrkjøring av seed-personal-projects.ts: leser HTML, parser PROJECTS,
 * skriver ut hvor mange prosjekter som ble funnet og hvilke statuser de har.
 * Skriver ingenting til DB.
 *
 * Kjør:  npx tsx prisma/seed-personal-dryrun.ts
 */
import * as fs from "node:fs";
import * as vm from "node:vm";

const HTML_FILE = "C:\\Users\\helen\\Desktop\\prosjekt-oversikt.html";

const html = fs.readFileSync(HTML_FILE, "utf8");
const match = html.match(/const PROJECTS\s*=\s*(\[[\s\S]*?\n\s*\]);/);
if (!match) {
  console.error("Fant ikke PROJECTS-array");
  process.exit(1);
}
const ctx: { value: any } = { value: null };
vm.createContext(ctx);
vm.runInContext(`value = ${match[1]};`, ctx);
const projects = ctx.value as Array<any>;

console.log(`Fant ${projects.length} prosjekter\n`);
const byStatus = new Map<string, string[]>();
for (const p of projects) {
  const s = p.status || "(ingen status)";
  if (!byStatus.has(s)) byStatus.set(s, []);
  byStatus.get(s)!.push(p.name);
}
for (const [status, names] of [...byStatus.entries()].sort()) {
  console.log(`  ${status} (${names.length}):`);
  for (const n of names) console.log(`    - ${n}`);
}
