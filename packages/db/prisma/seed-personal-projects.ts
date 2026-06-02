/**
 * Importér prosjektene fra Helenes lokale prosjekt-oversikt.html inn i
 * Sakspilot DB som ekte Sak-records under én klient "Egne prosjekter".
 *
 * KUN for Helene (helene721@gmail.com). Andre kan ignorere dette script.
 *
 * Kjør:
 *   cd C:\Users\helen\Desktop\sakspilot
 *   npm run db:seed-personal
 *
 * Re-kjør så ofte du vil — eksisterende prosjekter oppdateres (basert på
 * tittel + organizationId), ingen duplikater. Sletter ikke prosjekter
 * som finnes i DB men ikke i HTML — du må slette dem manuelt.
 *
 * Mapping HTML status → SakStatus:
 *   focus    → pagaaende
 *   active   → pagaaende
 *   live     → pagaaende
 *   waiting  → venter_kunde
 *   paused   → arkivert
 *   done     → ferdig
 *   archived → arkivert
 */
import { PrismaClient, SakStatus } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const PERSONAL_USER_EMAIL = "helene721@gmail.com";
const HTML_FILE = "C:\\Users\\helen\\Desktop\\prosjekt-oversikt.html";
const CLIENT_NAME = "Egne prosjekter";

interface RawProject {
  id: string;
  name: string;
  category?: string;
  status?: string;
  priority?: string;
  tagline?: string;
  stack?: string;
  location?: string;
  deadline?: string;
  links?: Array<{ l: string; u: string }>;
  done?: string[];
  next?: string[];
  notes?: string;
}

function statusMap(status?: string): SakStatus {
  switch (status) {
    case "focus":
    case "active":
    case "live":
      return SakStatus.pagaaende;
    case "waiting":
      return SakStatus.venter_kunde;
    case "done":
      return SakStatus.ferdig;
    case "paused":
    case "archived":
      return SakStatus.arkivert;
    default:
      return SakStatus.ikke_pabegynt;
  }
}

function buildDescription(p: RawProject): string {
  const parts: string[] = [];
  if (p.tagline) parts.push(p.tagline);
  if (p.stack) parts.push(`\n**Stack:** ${p.stack}`);
  if (p.location) parts.push(`\n**Sted:** ${p.location}`);
  if (p.links && p.links.length > 0) {
    parts.push("\n**Lenker:**");
    for (const link of p.links) parts.push(`- ${link.l}: ${link.u}`);
  }
  if (p.done && p.done.length > 0) {
    parts.push("\n**Ferdig:**");
    for (const item of p.done) parts.push(`- ${item}`);
  }
  if (p.notes) parts.push(`\n**Notater:** ${p.notes}`);
  return parts.join("\n");
}

function extractProjects(): RawProject[] {
  const html = fs.readFileSync(HTML_FILE, "utf8");
  // Plukk ut hele "const PROJECTS = [...];"-blokken
  const match = html.match(/const PROJECTS\s*=\s*(\[[\s\S]*?\n\s*\]);/);
  if (!match) throw new Error("Fant ikke PROJECTS-array i HTML-fila");
  // Bygg en isolert kontekst og evaluer JS-uttrykket
  const context = { value: null as unknown as RawProject[] };
  vm.createContext(context);
  vm.runInContext(`value = ${match[1]};`, context);
  return context.value;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log(`[seed] Henter ${PERSONAL_USER_EMAIL} fra DB...`);
    const user = await prisma.user.findUnique({
      where: { email: PERSONAL_USER_EMAIL },
      select: { id: true, organizationId: true, name: true },
    });
    if (!user) {
      throw new Error(
        `Fant ikke bruker ${PERSONAL_USER_EMAIL} i DB. Logg inn på sakspilot.no først.`
      );
    }
    const organizationId = user.organizationId;
    console.log(`[seed] Bruker: ${user.name}, org: ${organizationId}`);

    // Find/create client
    console.log(`[seed] Sikrer klient "${CLIENT_NAME}"...`);
    let client = await prisma.client.findFirst({
      where: { organizationId, name: CLIENT_NAME },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          organizationId,
          name: CLIENT_NAME,
          notes: "Egne prosjekter — importert fra prosjekt-oversikt.html",
        },
      });
      console.log(`[seed]   ✓ opprettet klient ${client.id}`);
    } else {
      console.log(`[seed]   ✓ fant eksisterende klient ${client.id}`);
    }

    // Read + import projects
    console.log(`[seed] Leser HTML-fila...`);
    const projects = extractProjects();
    console.log(`[seed] Fant ${projects.length} prosjekter\n`);

    let created = 0;
    let updated = 0;
    let milestonesAdded = 0;

    for (const p of projects) {
      const title = p.name;
      const description = buildDescription(p);
      const status = statusMap(p.status);
      const deadline = p.deadline ? new Date(p.deadline) : null;

      // Upsert by (organizationId, title)
      const existing = await prisma.sak.findFirst({
        where: { organizationId, title },
        select: { id: true },
      });

      let sakId: string;
      if (existing) {
        await prisma.sak.update({
          where: { id: existing.id },
          data: {
            description,
            status,
            deadline,
            clientId: client.id,
          },
        });
        sakId = existing.id;
        updated++;
        console.log(`  ↻  ${p.name} (oppdatert)`);
      } else {
        const sak = await prisma.sak.create({
          data: {
            organizationId,
            clientId: client.id,
            title,
            description,
            status,
            deadline,
          },
          select: { id: true },
        });
        sakId = sak.id;
        created++;
        console.log(`  +  ${p.name} (opprettet)`);
      }

      // Milestones from "next" — only add ones that don't exist yet (by title)
      if (p.next && p.next.length > 0) {
        const existingMilestones = await prisma.milestone.findMany({
          where: { sakId },
          select: { title: true },
        });
        const existingTitles = new Set(existingMilestones.map((m) => m.title));
        for (const next of p.next) {
          const milestoneTitle = next.slice(0, 200);
          if (existingTitles.has(milestoneTitle)) continue;
          // Default due date: 30 days out (kan endres i UI)
          const due = new Date();
          due.setDate(due.getDate() + 30);
          await prisma.milestone.create({
            data: {
              sakId,
              title: milestoneTitle,
              dueDate: due,
            },
          });
          milestonesAdded++;
        }
      }
    }

    console.log(`\n[seed] FERDIG:`);
    console.log(`  ${created} nye prosjekter opprettet`);
    console.log(`  ${updated} prosjekter oppdatert`);
    console.log(`  ${milestonesAdded} nye milepæler lagt til`);
    console.log(`\nGå til https://sakspilot.no/saker eller /klienter for å se dem.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] FEIL:", err);
  process.exit(1);
});
