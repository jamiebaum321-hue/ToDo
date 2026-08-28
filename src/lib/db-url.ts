/**
 * Work out which connection strings to use.
 *
 * Every Postgres host injects its own variable names, and none of them are the
 * ones Prisma's schema asks for. Neon's Vercel integration sets DATABASE_URL
 * and DATABASE_URL_UNPOOLED; Vercel Postgres sets POSTGRES_PRISMA_URL and
 * POSTGRES_URL_NON_POOLING; Supabase sets neither. Rather than make whoever
 * deploys this hand-copy a variable into a second name and get it wrong, look
 * for all of them.
 */

/** Just the shape these functions read, so tests can pass a bare object. */
export type EnvLike = Record<string, string | undefined>;

/** Pooled connection, used by the running app. */
const RUNTIME_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

/** Unpooled connection, used only by `prisma migrate`. */
const DIRECT_KEYS = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

function firstSet(env: EnvLike, keys: readonly string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim().length > 0) return { key, value: value.trim() };
  }
  return null;
}

/**
 * PgBouncer in transaction mode cannot hold the prepared statements Prisma
 * creates by default. Neon's pooled endpoint is exactly that, so the flag is
 * not optional — without it queries fail once connections start being reused.
 */
export function withPgBouncerFlag(url: string): string {
  const pooled = /-pooler\./.test(url) || /pgbouncer/i.test(url);
  if (!pooled || /[?&]pgbouncer=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

export function resolveRuntimeUrl(env: EnvLike = process.env): string | undefined {
  const hit = firstSet(env, RUNTIME_KEYS);
  return hit ? withPgBouncerFlag(hit.value) : undefined;
}

export function resolveDirectUrl(env: EnvLike = process.env): string | undefined {
  const hit = firstSet(env, DIRECT_KEYS);
  // The direct URL must never carry the pooling flag; migrations run against
  // the unpooled endpoint precisely because they need a real session.
  return hit?.value;
}

/** Which variable each one came from, for the build log. */
export function describeResolution(env: EnvLike = process.env) {
  return {
    runtime: firstSet(env, RUNTIME_KEYS)?.key ?? null,
    direct: firstSet(env, DIRECT_KEYS)?.key ?? null,
  };
}
