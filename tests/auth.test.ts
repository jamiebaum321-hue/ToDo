import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { checkPassword } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { consumeToken, issueToken, pruneVerificationTokens } from "@/lib/verification";
import { RATE_LIMITS, clientIp, rateLimit, rateLimitHeaders, resetRateLimit, pruneRateLimits } from "@/lib/rate-limit";

let userId: string;

beforeEach(async () => {
  await prisma.user.deleteMany({});
  await prisma.rateLimit.deleteMany({});
  const user = await prisma.user.create({
    data: {
      email: `a${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      passwordHash: await hashPassword("correct horse battery"),
      settings: { create: {} },
    },
  });
  userId = user.id;
});

describe("password policy", () => {
  it("wants length before punctuation", () => {
    expect(checkPassword("Sh0rt!")).toEqual({ ok: false, reason: expect.stringContaining("10 characters") });
    expect(checkPassword("correct horse battery staple")).toEqual({ ok: true });
  });

  it("rejects the passwords every breach list opens with", () => {
    for (const bad of ["password123", "qwertyuiop", "todo1234", "changeme"]) {
      expect(checkPassword(bad).ok).toBe(false);
    }
  });

  it("rejects one character repeated, however long", () => {
    expect(checkPassword("aaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
  });

  it("will not let you use your own email address", () => {
    expect(checkPassword("jamiebaum-is-here", "jamiebaum@example.com").ok).toBe(false);
    // Too short to be a meaningful signal, so it must not trip the check.
    expect(checkPassword("a-long-enough-password", "ab@example.com").ok).toBe(true);
  });

  it("refuses something absurdly long rather than hashing it", () => {
    expect(checkPassword("x".repeat(500)).ok).toBe(false);
  });
});

describe("password hashing", () => {
  it("round-trips, and rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password twice");
    const b = await hashPassword("same password twice");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password twice", b)).toBe(true);
  });

  it("does not throw on a malformed stored hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$zz$zz")).toBe(false);
  });
});

describe("one-time email links", () => {
  it("is redeemable exactly once", async () => {
    const token = await issueToken(userId, "verify_email");

    expect(await consumeToken(token, "verify_email")).toMatchObject({ ok: true, userId });
    expect(await consumeToken(token, "verify_email")).toEqual({ ok: false, reason: "used" });
  });

  it("refuses a token issued for a different purpose", async () => {
    const token = await issueToken(userId, "password_reset");
    expect(await consumeToken(token, "verify_email")).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses an expired token", async () => {
    const token = await issueToken(userId, "verify_email");
    await prisma.verificationToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeToken(token, "verify_email")).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a token that was never issued", async () => {
    expect(await consumeToken("made-up-token-value", "verify_email")).toEqual({ ok: false, reason: "invalid" });
  });

  it("retires the previous link when a new one is sent", async () => {
    const first = await issueToken(userId, "verify_email");
    const second = await issueToken(userId, "verify_email");

    // Whichever email arrived last is the one that works.
    expect(await consumeToken(first, "verify_email")).toEqual({ ok: false, reason: "used" });
    expect((await consumeToken(second, "verify_email")).ok).toBe(true);
  });

  it("stores only a hash, never the token itself", async () => {
    const token = await issueToken(userId, "verify_email");
    const row = await prisma.verificationToken.findFirstOrThrow({ where: { userId } });
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it("carries a payload, which is how an email change knows its new address", async () => {
    const token = await issueToken(userId, "change_email", "new@example.com");
    expect(await consumeToken(token, "change_email")).toMatchObject({ ok: true, payload: "new@example.com" });
  });

  it("prunes long-dead tokens", async () => {
    await issueToken(userId, "verify_email");
    await prisma.verificationToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 30 * 864e5) },
    });
    expect(await pruneVerificationTokens()).toBe(1);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit and refuses past it", async () => {
    const rule = RATE_LIMITS.login;
    let last = await rateLimit("login", "someone@example.com");

    for (let i = 1; i < rule.limit; i += 1) last = await rateLimit("login", "someone@example.com");
    expect(last.ok).toBe(true);
    expect(last.remaining).toBe(0);

    const over = await rateLimit("login", "someone@example.com");
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < RATE_LIMITS.login.limit + 2; i += 1) await rateLimit("login", "noisy@example.com");
    expect((await rateLimit("login", "quiet@example.com")).ok).toBe(true);
  });

  it("keeps limits for different actions apart", async () => {
    for (let i = 0; i < RATE_LIMITS.register.limit + 2; i += 1) await rateLimit("register", "1.2.3.4");
    expect((await rateLimit("login", "1.2.3.4")).ok).toBe(true);
  });

  it("forgives the count after a successful sign-in", async () => {
    for (let i = 0; i < RATE_LIMITS.login.limit; i += 1) await rateLimit("login", "typo@example.com");
    expect((await rateLimit("login", "typo@example.com")).ok).toBe(false);

    await resetRateLimit("login", "typo@example.com");
    expect((await rateLimit("login", "typo@example.com")).ok).toBe(true);
  });

  it("starts clean once the window has passed", async () => {
    for (let i = 0; i < RATE_LIMITS.login.limit + 1; i += 1) await rateLimit("login", "waiter@example.com");
    expect((await rateLimit("login", "waiter@example.com")).ok).toBe(false);

    await prisma.rateLimit.updateMany({
      where: { key: "login:waiter@example.com" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await rateLimit("login", "waiter@example.com")).ok).toBe(true);
  });

  it("reports itself in standard headers", async () => {
    const result = await rateLimit("login", "headers@example.com");
    const headers = rateLimitHeaders(result);
    expect(headers["ratelimit-limit"]).toBe(String(RATE_LIMITS.login.limit));
    expect(headers["retry-after"]).toBeUndefined();

    for (let i = 0; i < RATE_LIMITS.login.limit + 1; i += 1) await rateLimit("login", "headers@example.com");
    expect(rateLimitHeaders(await rateLimit("login", "headers@example.com"))["retry-after"]).toBeDefined();
  });

  it("prunes expired counters", async () => {
    await rateLimit("login", "old@example.com");
    await prisma.rateLimit.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await pruneRateLimits()).toBeGreaterThan(0);
  });
});

describe("clientIp", () => {
  it("takes the leftmost entry of x-forwarded-for — the real client", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to a placeholder", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.7" } }))).toBe("198.51.100.7");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
