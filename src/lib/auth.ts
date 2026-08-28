import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { newApiToken, randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "todo_session";
const SESSION_DAYS = 60;

export interface Actor {
  user: User;
  /** How this request proved who it is. */
  via: "session" | "token";
  tokenId?: string;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Browser sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, userAgent: userAgent?.slice(0, 300) ?? null },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic cleanup; sessions are cheap but should not pile up forever.
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

// ---------------------------------------------------------------------------
// MCP bearer tokens
// ---------------------------------------------------------------------------

export interface BearerResult {
  ok: boolean;
  actor?: Actor;
  /** Set when auth failed, for a precise WWW-Authenticate response. */
  error?: "missing" | "invalid" | "expired" | "revoked";
}

export async function authenticateBearer(req: Request): Promise<BearerResult> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, error: "missing" };

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256(match[1].trim()) },
    include: { user: true },
  });
  if (!record) return { ok: false, error: "invalid" };
  if (record.revokedAt) return { ok: false, error: "revoked" };
  if (record.expiresAt && record.expiresAt < new Date()) return { ok: false, error: "expired" };

  // Throttled so a chatty client does not write on every single tool call.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return {
    ok: true,
    actor: {
      user: record.user,
      via: "token",
      tokenId: record.id,
      scopes: record.scopes.split(",").map((s) => s.trim()).filter(Boolean),
    },
  };
}

/** Session cookie first, bearer token second. Used by the REST API. */
export async function getActor(req: Request): Promise<Actor | null> {
  const user = await getSessionUser();
  if (user) return { user, via: "session", scopes: ["tasks:read", "tasks:write", "notify", "admin"] };
  const bearer = await authenticateBearer(req);
  return bearer.ok && bearer.actor ? bearer.actor : null;
}

export function hasScope(actor: Actor, scope: string): boolean {
  return actor.scopes.includes(scope) || actor.scopes.includes("admin");
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export async function issueApiToken(userId: string, name: string, expiresInDays?: number) {
  const { token, hash, prefix } = newApiToken();
  const record = await prisma.apiToken.create({
    data: {
      userId,
      name: name.slice(0, 80) || "MCP connection",
      tokenHash: hash,
      prefix,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 864e5) : null,
    },
  });
  // The only time the plaintext exists. It is never stored or logged.
  return { record, token };
}
