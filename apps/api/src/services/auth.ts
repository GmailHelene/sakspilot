/**
 * Auth-tjeneste — JWT + bcrypt.
 *
 * Mønster portet fra ByggPilot:
 *   - bcrypt 12 rounds for passwordHash
 *   - JWT med 8t levetid (justérbar via JWT_EXPIRES_IN)
 *   - Konstant tidsbruk ved feilet innlogging (mot timing-angrep)
 */
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn(
    "[Auth] ADVARSEL: JWT_SECRET er ikke satt eller for kort (< 32 tegn). " +
    "Sett en sterk hemmelig fra crypto.randomBytes(64). Bruker default — IKKE BRUK I PROD."
  );
}

const EFFECTIVE_SECRET =
  JWT_SECRET && JWT_SECRET.length >= 32
    ? JWT_SECRET
    : "dev-only-default-secret-do-not-use-in-production-replace-immediately";

export interface SakspilotSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: "owner" | "member" | "admin";
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function createSessionToken(session: SakspilotSession): string {
  // jsonwebtoken@9 + nyere @types krever StringValue/number for expiresIn —
  // vi caster fordi vi vet JWT_EXPIRES_IN er en gyldig streng som "8h"
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(session, EFFECTIVE_SECRET, options);
}

export function verifySessionToken(token: string): SakspilotSession | null {
  try {
    const decoded = jwt.verify(token, EFFECTIVE_SECRET) as SakspilotSession;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Konstant-tids "venting" for å motvirke at innloggings-API
 * røper om en e-post er registrert basert på responstid.
 */
export async function constantTimeDelay(): Promise<void> {
  const ms = 200 + Math.random() * 100;
  return new Promise((r) => setTimeout(r, ms));
}
