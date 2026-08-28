import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/** scrypt with a per-password salt, stored as `scrypt$<saltHex>$<hashHex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let saltHex: string, hashHex: string;
  try {
    saltHex = parts[1];
    hashHex = parts[2];
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== KEYLEN) return false;
    const derived = await scrypt(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), KEYLEN);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** MCP bearer tokens. The `todo_` prefix makes them greppable in secret scans. */
export function newApiToken(): { token: string; hash: string; prefix: string } {
  const token = `todo_${randomToken(32)}`;
  return { token, hash: sha256(token), prefix: token.slice(0, 11) };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
