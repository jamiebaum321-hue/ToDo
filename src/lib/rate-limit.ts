import { prisma } from "./db";

/**
 * Fixed-window rate limiting, counted in the database.
 *
 * In-process counters are worse than useless on serverless: every instance
 * keeps its own tally and a cold start resets it, so an attacker gets the full
 * allowance per instance. One shared row per key is slower but is an actual
 * limit.
 */

export interface RateLimitRule {
  /** How many requests are allowed in a window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Password guessing. Tight, and counted per address as well as per IP. */
  login: { limit: 10, windowSeconds: 900 },
  /** Account farming. */
  register: { limit: 5, windowSeconds: 3600 },
  /** Mail amplification — each of these sends an email to a third party. */
  emailSend: { limit: 4, windowSeconds: 3600 },
  /** Token guessing on verify and reset links. */
  tokenCheck: { limit: 20, windowSeconds: 900 },
  /** A busy agent run is chatty; this is high enough not to bite, low enough
   *  to stop a runaway loop hammering the database. */
  mcp: { limit: 240, windowSeconds: 60 },
  /** Everything else on the authenticated API. */
  api: { limit: 600, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/**
 * Count one hit against `key`. The window is anchored to the first hit, so a
 * caller that stops for a full window starts clean.
 */
export async function rateLimit(name: RateLimitName, key: string): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const now = new Date();
  const fullKey = `${name}:${key}`.slice(0, 200);
  const expiresAt = new Date(now.getTime() + rule.windowSeconds * 1000);

  try {
    // Two statements in one transaction: clear the window if it has passed,
    // then count. Doing it in SQL keeps the increment atomic under concurrency.
    const rows = await prisma.$transaction([
      prisma.rateLimit.deleteMany({ where: { key: fullKey, expiresAt: { lte: now } } }),
      prisma.rateLimit.upsert({
        where: { key: fullKey },
        create: { key: fullKey, count: 1, expiresAt },
        update: { count: { increment: 1 } },
      }),
    ]);

    const record = rows[1];
    const remaining = Math.max(0, rule.limit - record.count);
    const retryAfter = Math.max(1, Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000));

    return { ok: record.count <= rule.limit, limit: rule.limit, remaining, retryAfter };
  } catch {
    // A limiter that fails closed would take the whole app down with the
    // database. Log-and-allow is the safer trade for this kind of app.
    return { ok: true, limit: rule.limit, remaining: rule.limit, retryAfter: 0 };
  }
}

/** Clear a key early — used after a successful sign-in, so one typo is forgiven. */
export async function resetRateLimit(name: RateLimitName, key: string) {
  await prisma.rateLimit.deleteMany({ where: { key: `${name}:${key}`.slice(0, 200) } }).catch(() => {});
}

/** Housekeeping, called by the cron. */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}

/**
 * The caller's IP.
 *
 * Behind Vercel, x-forwarded-for is set by the platform and its leftmost entry
 * is the real client. Do not trust it when there is no proxy in front, but
 * there always is here.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard headers, so a well-behaved client can back off on its own. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "ratelimit-limit": String(result.limit),
    "ratelimit-remaining": String(result.remaining),
    "ratelimit-reset": String(result.retryAfter),
    ...(result.ok ? {} : { "retry-after": String(result.retryAfter) }),
  };
}
