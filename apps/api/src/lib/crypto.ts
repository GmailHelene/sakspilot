/**
 * Token-kryptering — AES-256-GCM.
 *
 * Brukes for sensitive token-felter i DB (refresh-tokens for OAuth-providere).
 * Nøkkelen MÅ være satt som ENCRYPTION_KEY (64 hex tegn = 32 bytes) på prod.
 * Genereres med: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format på output: <iv-hex>:<authTag-hex>:<ciphertext-hex>
 *   - IV: 12 bytes (GCM-anbefalt)
 *   - AuthTag: 16 bytes
 *   - Ciphertext: variabel
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // Fail-hard utenfor lokal dev. Tidligere falt vi tilbake til "0000..." for
    // alt som ikke var NODE_ENV='production' — men feilkonfigurerte staging-/CI-
    // miljøer kunne dermed lese krypterte tokens som om de var i klartekst.
    // Nå: bare NODE_ENV='development' tillates fallback, alt annet throws ved
    // første kallforsøk så feilen oppdages med en gang.
    if (process.env.NODE_ENV !== "development") {
      throw new Error(
        `[crypto] ENCRYPTION_KEY mangler eller har feil lengde (skal være 64 hex-tegn). ` +
        `NODE_ENV='${process.env.NODE_ENV ?? "undefined"}'. ` +
        `Generer: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    console.warn(
      "[crypto] ADVARSEL: ENCRYPTION_KEY ikke satt, bruker dev-default (alle nuller). " +
      "MÅ settes som env-var før test/prod-deploy."
    );
    return Buffer.from("0".repeat(64), "hex");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !encHex) {
    throw new Error("Ugyldig kryptert format");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
