/**
 * Sakspilot, månedlig DB-backup av Neon Postgres.
 *
 * Hva den gjør:
 *   1. Kjører pg_dump mot DIRECT_URL (Neon direct, ikke pooler, pooler
 *      støtter ikke streaming-replication-stil pg_dump bruker)
 *   2. Gzip-er output til ./backups/sakspilot-backup-YYYY-MM-DD.sql.gz
 *   3. Hvis R2-env er satt OG @aws-sdk/client-s3 er installert →
 *      laster opp til Cloudflare R2 og roterer (beholder siste 12 månedlige)
 *   4. Hvis ikke → lar fila ligge lokalt og logger at bruker må kopiere
 *      den et sted trygt selv
 *
 * Hvorfor split path:
 *   AWS SDK v3 er ~10 MB med deps. Vi vil ikke tvinge den på alle som
 *   bare kjører API-en. Den lastes dynamisk *kun* hvis R2-env er satt.
 *   For å aktivere R2: kjør `npm install @aws-sdk/client-s3` i apps/api.
 *
 * Nødvendige env-vars:
 *   DIRECT_URL             , Neon direct connection (ikke pooler)
 *
 * Valgfrie (alle eller ingen, ellers faller den tilbake til lokal lagring):
 *   R2_ACCOUNT_ID          , Cloudflare account ID
 *   R2_ACCESS_KEY_ID       , R2 API token access key
 *   R2_SECRET_ACCESS_KEY   , R2 API token secret
 *   R2_BUCKET_NAME         , bucket-navn (anbefalt: sakspilot-backups)
 *
 * Render cron-oppskrift:
 *   Schedule: 0 3 1 * *   (1. i måneden, 03:00 UTC = 04:00/05:00 Oslo)
 *   Command:  npm run job:db-backup
 *
 * Restore:
 *   gunzip < sakspilot-backup-2026-05-01.sql.gz | psql "$DIRECT_URL"
 *
 * Se også: apps/api/DB-BACKUP.md
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

// ---------- helpers ----------

function log(step: string, msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const extraStr = extra ? " " + JSON.stringify(extra) : "";
  // eslint-disable-next-line no-console
  console.log(`[db-backup] ${ts} [${step}] ${msg}${extraStr}`);
}

function todayStamp(): string {
  // YYYY-MM-DD i UTC for konsistens uavhengig av kjørested
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Mangler påkrevd env-var: ${name}`);
  }
  return v;
}

// ---------- pg_dump → gzip ----------

async function dumpAndCompress(directUrl: string, outPath: string): Promise<void> {
  log("dump", "starter pg_dump", { outPath });

  // --no-owner / --no-acl: gjør dumpen portabel mellom databaser/roller.
  // -Fp (plain SQL) er default, eksplisitt her for tydelighet, gir
  // tekst som lett restoreables med `psql`.
  const args = [
    "--no-owner",
    "--no-acl",
    "-Fp",
    "--dbname=" + directUrl,
  ];

  const proc = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const gzip = createGzip({ level: 9 });
  const out = createWriteStream(outPath);

  // pg_dump stdout → gzip → fil
  const pipelinePromise = pipeline(proc.stdout, gzip, out);

  const exitPromise = new Promise<void>((res, rej) => {
    proc.on("error", rej);
    proc.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`pg_dump exit ${code}: ${stderr.slice(0, 500)}`));
    });
  });

  await Promise.all([pipelinePromise, exitPromise]);

  const size = statSync(outPath).size;
  log("dump", "ferdig", { bytes: size, mb: (size / 1024 / 1024).toFixed(2) });
}

// ---------- R2 upload + rotation ----------

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function readR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

// Type-aliaser brukt under, `any` fordi @aws-sdk/client-s3 ikke er i
// dependencies (lastes dynamisk). Når du har kjørt
// `npm install @aws-sdk/client-s3`, kan du valgfritt bytte til
// `typeof import("@aws-sdk/client-s3")` for å få fulle typer her.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R2Object = { Key?: string; [k: string]: any };

async function uploadToR2(cfg: R2Config, localPath: string, key: string): Promise<void> {
  // Dynamisk import, så modulen ikke krasjer på require-tid hvis SDK
  // ikke er installert. Bruker bare R2-pathen hvis env-vars er satt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let S3Mod: any;
  try {
    // Variabelt importspec hindrer tsc fra å statisk forsøke å løse modulen.
    const mod = "@aws-sdk/client-s3";
    S3Mod = await import(/* @vite-ignore */ mod);
  } catch {
    throw new Error(
      "@aws-sdk/client-s3 ikke installert. " +
        "Kjør `npm install @aws-sdk/client-s3` i apps/api for å aktivere R2-upload, " +
        "eller fjern R2_*-env-vars for å bruke lokal lagring."
    );
  }

  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = S3Mod;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  log("upload", "starter R2 upload", { bucket: cfg.bucket, key });
  const body = await readFile(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: "application/gzip",
    })
  );
  log("upload", "ferdig", { key });

  // Rotasjon: behold siste 12, slett resten
  log("rotate", "lister eksisterende backups");
  const list = await client.send(
    new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: "sakspilot-backup-",
    })
  );
  const items: R2Object[] = (list.Contents ?? [])
    .filter((o: R2Object) => o.Key && o.Key.endsWith(".sql.gz"))
    .sort((a: R2Object, b: R2Object) => (a.Key! < b.Key! ? 1 : -1)); // nyest først (filnavn er ISO-dato)

  const KEEP = 12;
  const toDelete = items.slice(KEEP);
  log("rotate", "vurderer sletting", { totalt: items.length, behold: KEEP, sletter: toDelete.length });

  for (const obj of toDelete) {
    if (!obj.Key) continue;
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: obj.Key }));
    log("rotate", "slettet", { key: obj.Key });
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  const directUrl = requireEnv("DIRECT_URL");
  const stamp = todayStamp();
  const filename = `sakspilot-backup-${stamp}.sql.gz`;

  const backupsDir = resolve(process.cwd(), "backups");
  mkdirSync(backupsDir, { recursive: true });
  const localPath = resolve(backupsDir, filename);

  log("start", "Sakspilot DB-backup", { filename, localPath });

  await dumpAndCompress(directUrl, localPath);

  const r2 = readR2Config();
  if (r2) {
    try {
      await uploadToR2(r2, localPath, filename);
      log("done", "ferdig (R2)", { remote: `r2://${r2.bucket}/${filename}` });
    } catch (err) {
      log("error", "R2 upload feilet - fila ligger fortsatt lokalt", {
        message: (err as Error).message,
        localPath,
      });
      throw err;
    }
  } else {
    log(
      "done",
      "ferdig (lokal lagring) - R2_*-env ikke satt. " +
        "Kopier fila til et trygt sted manuelt, ellers forsvinner den når kontaineren resetter.",
      { localPath }
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[db-backup] FATAL", err);
  process.exit(1);
});
