import { describe, expect, it } from "vitest";
import { describeResolution, resolveDirectUrl, resolveRuntimeUrl, withPgBouncerFlag } from "@/lib/db-url";

const NEON_POOLED = "postgresql://u:p@ep-cool-name-123456-pooler.us-east-1.aws.neon.tech/todo?sslmode=require";
const NEON_DIRECT = "postgresql://u:p@ep-cool-name-123456.us-east-1.aws.neon.tech/todo?sslmode=require";

describe("withPgBouncerFlag", () => {
  it("flags a pooled Neon endpoint — PgBouncer cannot hold Prisma's prepared statements", () => {
    expect(withPgBouncerFlag(NEON_POOLED)).toBe(`${NEON_POOLED}&pgbouncer=true`);
  });

  it("leaves a direct endpoint alone", () => {
    expect(withPgBouncerFlag(NEON_DIRECT)).toBe(NEON_DIRECT);
  });

  it("does not add the flag twice", () => {
    const already = `${NEON_POOLED}&pgbouncer=true`;
    expect(withPgBouncerFlag(already)).toBe(already);
  });

  it("uses ? when the URL has no query string yet", () => {
    expect(withPgBouncerFlag("postgresql://u:p@host-pooler.neon.tech/db")).toBe(
      "postgresql://u:p@host-pooler.neon.tech/db?pgbouncer=true",
    );
  });
});

describe("resolving connection strings", () => {
  it("takes DATABASE_URL and DIRECT_URL when both are set", () => {
    const env = { DATABASE_URL: NEON_POOLED, DIRECT_URL: NEON_DIRECT };
    expect(resolveRuntimeUrl(env)).toContain("pgbouncer=true");
    expect(resolveDirectUrl(env)).toBe(NEON_DIRECT);
  });

  it("falls back to DATABASE_URL_UNPOOLED — Neon's integration never sets DIRECT_URL", () => {
    const env = { DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT };
    expect(resolveDirectUrl(env)).toBe(NEON_DIRECT);
    expect(describeResolution(env)).toEqual({ runtime: "DATABASE_URL", direct: "DATABASE_URL_UNPOOLED" });
  });

  it("understands Vercel Postgres' own names", () => {
    const env = { POSTGRES_PRISMA_URL: NEON_POOLED, POSTGRES_URL_NON_POOLING: NEON_DIRECT };
    expect(resolveRuntimeUrl(env)).toContain("pgbouncer=true");
    expect(resolveDirectUrl(env)).toBe(NEON_DIRECT);
    expect(describeResolution(env)).toEqual({
      runtime: "POSTGRES_PRISMA_URL",
      direct: "POSTGRES_URL_NON_POOLING",
    });
  });

  it("never puts the pooling flag on the direct URL", () => {
    const env = { DATABASE_URL: NEON_POOLED };
    expect(resolveDirectUrl(env)).toBe(NEON_POOLED);
    expect(resolveDirectUrl(env)).not.toContain("pgbouncer");
  });

  it("ignores blank values rather than treating them as set", () => {
    const env = { DATABASE_URL: "   ", POSTGRES_URL: NEON_DIRECT };
    expect(resolveRuntimeUrl(env)).toBe(NEON_DIRECT);
  });

  it("returns nothing when the host injected nothing", () => {
    expect(resolveRuntimeUrl({})).toBeUndefined();
    expect(resolveDirectUrl({})).toBeUndefined();
    expect(describeResolution({})).toEqual({ runtime: null, direct: null });
  });
});
