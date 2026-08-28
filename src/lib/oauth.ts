import { createHmac, createHash, timingSafeEqual, randomBytes } from "crypto";

/**
 * A deliberately stateless OAuth 2.1 layer over the existing ApiToken system.
 *
 * Client registrations and authorization codes are HMAC-signed blobs rather
 * than database rows. The token endpoint ultimately mints a normal ApiToken,
 * so everything a user can see and revoke stays in one place: Settings.
 * Codes live ten minutes; a replayed code can only mint another token for
 * the same user and client, and that token is visible and revocable like
 * any other.
 */

const SECRET = process.env.OAUTH_SECRET || process.env.CRON_SECRET || "";

export function oauthConfigured(): boolean {
  return SECRET.length > 0;
}

export function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

function b64uJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function unb64uJson<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function sign(payload: object): string {
  const body = b64uJson(payload);
  return body + "." + hmac(body);
}

export function verify<T>(blob: string): T | null {
  if (!SECRET || typeof blob !== "string") return null;
  const dot = blob.lastIndexOf(".");
  if (dot < 0) return null;
  const body = blob.slice(0, dot);
  const sig = Buffer.from(blob.slice(dot + 1));
  const expect = Buffer.from(hmac(body));
  if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return null;
  return unb64uJson<T>(body);
}

export interface OAuthClient {
  t: "client";
  name: string;
  redirectUris: string[];
  iat: number;
}

export interface AuthCode {
  t: "code";
  uid: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  scope: string;
  exp: number;
  jti: string;
}

export function makeClientId(name: string, redirectUris: string[]): string {
  const client: OAuthClient = { t: "client", name, redirectUris, iat: Date.now() };
  return sign(client);
}

export function readClient(clientId: string): OAuthClient | null {
  const c = verify<OAuthClient>(clientId);
  if (!c || c.t !== "client" || !Array.isArray(c.redirectUris)) return null;
  return c;
}

export function makeCode(
  uid: string,
  clientId: string,
  redirectUri: string,
  challenge: string,
  scope: string,
): string {
  const code: AuthCode = {
    t: "code",
    uid,
    clientId,
    redirectUri,
    challenge,
    scope,
    exp: Date.now() + 10 * 60 * 1000,
    jti: randomBytes(8).toString("base64url"),
  };
  return sign(code);
}

export function readCode(code: string): AuthCode | null {
  const c = verify<AuthCode>(code);
  if (!c || c.t !== "code" || c.exp < Date.now()) return null;
  return c;
}

/** RFC 7636 S256: base64url(sha256(verifier)) must equal the stored challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  const digest = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expect = Buffer.from(challenge);
  return digest.length === expect.length && timingSafeEqual(digest, expect);
}

/** Exact match against what the client registered; https only, except localhost. */
export function redirectUriAllowed(uri: string, client: OAuthClient): boolean {
  if (!client.redirectUris.includes(uri)) return false;
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export interface Grant {
  t: "grant";
  uid: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  challenge: string;
  scope: string;
  state: string;
  exp: number;
}

/** The consent form round-trips one of these, so approval cannot be forged or replayed later. */
export function makeGrant(g: Omit<Grant, "t" | "exp">): string {
  const grant: Grant = { ...g, t: "grant", exp: Date.now() + 15 * 60 * 1000 };
  return sign(grant);
}

export function readGrant(blob: string): Grant | null {
  const g = verify<Grant>(blob);
  if (!g || g.t !== "grant" || g.exp < Date.now()) return null;
  return g;
}
