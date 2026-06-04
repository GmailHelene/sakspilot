/**
 * Importér portal-hub-backupen til Sakspilot DB:
 *   - hub.leads    → Foresporsel
 *   - hub.invoices → Invoice (med line items i JSON-felt)
 *   - hub.expenses → Utgift
 *
 * KUN for Helene (helene721@gmail.com). hub.projects importeres IKKE her , 
 * de overlapper med seed-personal-projects.ts (prosjekt-oversikt.html).
 *
 * Kjør:
 *   cd C:\Users\helen\Desktop\sakspilot
 *   npm run db:seed-personal-hub
 *
 * Re-kjørbart: upsert basert på (organizationId, eksternal_id) hvor mulig.
 * For leads/invoices/expenses uten naturlig ekstern nøkkel matches på
 * (organizationId + tittel/beskrivelse + dato) for å unngå duplikater.
 *
 * Standard backup-sti: C:\Users\helen\Desktop\portal-backup-2026-06-02.json
 * Overstyr med --file=path/til/backup.json
 */
import { PrismaClient, ForesporselStatus, InvoiceStatus } from "@prisma/client";
import * as fs from "node:fs";

const PERSONAL_USER_EMAIL = "helene721@gmail.com";
const DEFAULT_BACKUP = "C:\\Users\\helen\\Desktop\\portal-backup-2026-06-02.json";

interface HubBackup {
  settings?: {
    firmanavn?: string;
    orgnr?: string;
    adresse?: string;
    kontonummer?: string;
    timepris?: number;
    nesteFakturanr?: number;
  };
  projects?: Array<{
    id: string;
    tittel: string;
    kunde: string;
    status: string;
  }>;
  leads?: Array<{
    id: string;
    tittel?: string;
    kunde?: string;
    hva?: string;
    notat?: string;
    status?: string;
    kontakt?: string;
    estimat?: string;
    frist?: string;
    opprettet?: string;
    kommunikasjon?: Array<{ dato: string; fra: string; tekst: string }>;
  }>;
  invoices?: Array<{
    id: string;
    nummer?: string;
    dato?: string;
    forfall?: string;
    kunde?: string;
    kundeadr?: string;
    betalt?: boolean;
    betaltDato?: string;
    projectId?: string;
    linjer?: Array<{ pris: number; antall: number; beskrivelse: string }>;
  }>;
  expenses?: Array<{
    id?: string;
    dato?: string;
    beskrivelse?: string;
    belop?: number;
    mva?: number;
    kategori?: string;
    leverandor?: string;
  }>;
}

// Hub-status → ForesporselStatus
function mapLeadStatus(s?: string): ForesporselStatus {
  switch ((s || "").toLowerCase()) {
    case "ny":           return "ny";
    case "i_dialog":
    case "dialog":
    case "tilbud":       return "i_dialog";   // tilbud sendt = pågående dialog
    case "vunnet":       return "vunnet";
    case "tapt":         return "tapt";
    case "arkivert":     return "arkivert";
    default:             return "ny";
  }
}

function parseDateOrNull(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  // CLI args
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const file = fileArg ? fileArg.split("=")[1] : DEFAULT_BACKUP;

  if (!fs.existsSync(file)) {
    throw new Error(`Backup-fil ikke funnet: ${file}`);
  }

  console.log(`[hub-seed] Leser ${file}...`);
  const backup: HubBackup = JSON.parse(fs.readFileSync(file, "utf8"));

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: PERSONAL_USER_EMAIL },
      select: { id: true, organizationId: true, name: true },
    });
    if (!user) {
      throw new Error(`Bruker ${PERSONAL_USER_EMAIL} ikke funnet. Logg inn på sakspilot.no først.`);
    }
    const organizationId = user.organizationId;
    console.log(`[hub-seed] Bruker: ${user.name} (org: ${organizationId})`);

    // ── Leads → Foresporsel ─────────────────────────────────
    // Idempotent via externalId (lead.id fra hub-backupen).
    // Hvis raden allerede finnes (externalId match), HOPPER VI OVER
    //, bevarer brukerens manuelle redigeringer i web. Kun nye importeres.
    let leadsCreated = 0, leadsSkipped = 0;
    for (const lead of backup.leads || []) {
      const name = lead.kunde || lead.tittel || "(uten navn)";
      // Bygg messagefeltet med både hovedtekst og kommunikasjons-tråd
      const messageParts: string[] = [];
      if (lead.tittel) messageParts.push(`**${lead.tittel}**`);
      if (lead.hva) messageParts.push(lead.hva);
      if (lead.estimat) messageParts.push(`\nEstimat: ${lead.estimat}`);
      if (lead.kommunikasjon && lead.kommunikasjon.length > 0) {
        messageParts.push(`\n\n--- Kommunikasjonslogg ---`);
        for (const k of lead.kommunikasjon) {
          messageParts.push(`\n[${k.dato}] ${k.fra === 'meg' ? 'Jeg' : 'Kunde'}: ${k.tekst}`);
        }
      }
      const message = messageParts.join("\n");

      // Match på (organizationId, externalId), Prisma @@unique
      const existing = await prisma.foresporsel.findUnique({
        where: { organizationId_externalId: { organizationId, externalId: lead.id } },
        select: { id: true },
      });

      if (existing) {
        leadsSkipped++;
        continue;
      }

      const created = await prisma.foresporsel.create({
        data: {
          organizationId,
          externalId: lead.id,
          name,
          message: message || undefined,
          notes: lead.notat || undefined,
          source: lead.kontakt || undefined,
          status: mapLeadStatus(lead.status),
          expectedCloseDate: parseDateOrNull(lead.frist),
        },
      });
      // Overskriv createdAt etter create (Prisma støtter ikke override i create-input)
      const opprettet = parseDateOrNull(lead.opprettet);
      if (opprettet) {
        await prisma.foresporsel.update({
          where: { id: created.id },
          data: { createdAt: opprettet },
        });
      }
      leadsCreated++;
    }
    console.log(`[hub-seed] Leads: ${leadsCreated} opprettet, ${leadsSkipped} hoppet over (allerede importert)`);

    // ── Invoices → Invoice ──────────────────────────────────
    // Idempotent via externalId. Hopp over hvis allerede importert.
    let invoicesCreated = 0, invoicesSkipped = 0;
    for (const hubInv of backup.invoices || []) {
      const totalAmount = (hubInv.linjer || []).reduce((s, l) => s + l.pris * l.antall, 0);
      const totalHours = (hubInv.linjer || []).reduce((s, l) => s + l.antall, 0);

      const existing = await prisma.invoice.findUnique({
        where: { organizationId_externalId: { organizationId, externalId: hubInv.id } },
        select: { id: true },
      });

      if (existing) {
        invoicesSkipped++;
        continue;
      }

      const dato = parseDateOrNull(hubInv.dato) || new Date();
      await prisma.invoice.create({
        data: {
          organizationId,
          externalId: hubInv.id,
          sakId: null,                              // hub.projectId mappes ikke direkte til Sak.id
          invoiceNumber: hubInv.nummer || null,
          periodStart: dato,
          periodEnd: dato,
          dueDate: parseDateOrNull(hubInv.forfall),
          paidAt: hubInv.betalt ? (parseDateOrNull(hubInv.betaltDato) || dato) : null,
          totalHours,
          totalAmount,
          currency: "NOK",
          status: "exported" as InvoiceStatus,     // alle hub-fakturaer er ferdige
          customerName: hubInv.kunde || null,
          customerAddress: hubInv.kundeadr || null,
          lineItems: hubInv.linjer
            ? hubInv.linjer.map((l) => ({
                description: l.beskrivelse,
                quantity: l.antall,
                unitPrice: l.pris,
                sum: l.pris * l.antall,
              }))
            : undefined,
        },
      });
      invoicesCreated++;
    }
    console.log(`[hub-seed] Invoices: ${invoicesCreated} opprettet, ${invoicesSkipped} hoppet over (allerede importert)`);

    // ── Expenses → Utgift ───────────────────────────────────
    let utgCreated = 0, utgSkipped = 0;
    for (const exp of backup.expenses || []) {
      if (!exp.dato || !exp.beskrivelse || exp.belop == null) {
        console.log(`[hub-seed]   ⚠ hopper over utgift uten dato/beskrivelse/belop`);
        continue;
      }
      const externalId = exp.id || `${exp.dato}-${exp.beskrivelse.slice(0, 20)}`;

      const existing = await prisma.utgift.findUnique({
        where: { organizationId_externalId: { organizationId, externalId } },
        select: { id: true },
      });

      if (existing) {
        utgSkipped++;
        continue;
      }

      await prisma.utgift.create({
        data: {
          organizationId,
          externalId,
          dato: new Date(exp.dato),
          beskrivelse: exp.beskrivelse,
          belopInkMva: exp.belop,
          mvaSats: exp.mva ?? null,
          kategori: exp.kategori || null,
          leverandor: exp.leverandor || null,
        },
      });
      utgCreated++;
    }
    console.log(`[hub-seed] Expenses: ${utgCreated} opprettet, ${utgSkipped} hoppet over (allerede importert)`);

    console.log(`\n[hub-seed] FERDIG.`);
    console.log(`Gå til /foresporsler, /fakturaer og /regnskap i Sakspilot for å se importerte data.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[hub-seed] FEIL:", err);
  process.exit(1);
});
