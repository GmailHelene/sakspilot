/**
 * Singleton Prisma-klient.
 *
 * I dev (tsx watch) restartes serveren ofte — uten singleton ville vi
 * lekket connections til Supabase. global-trikset løser det.
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __sakspilot_prisma: PrismaClient | undefined;
}

const prisma =
  global.__sakspilot_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__sakspilot_prisma = prisma;
}

export default prisma;
