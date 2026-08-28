import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { checkPassword, createSession } from "@/lib/auth";
import { ensureSettings } from "@/lib/settings";
import { isValidTimeZone } from "@/lib/time";
import { badRequest, json, readJson } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/verification";
import { mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1),
  name: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(64).optional(),
});

/**
 * Sign-up.
 *
 * Open by default; set ALLOW_SIGNUPS=false to close it after the first account
 * for a private instance. Either way the address has to be confirmed before the
 * account can be used, so nobody can occupy an email that is not theirs.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = await rateLimit("register", ip);
  if (!limited.ok) {
    return json(
      { error: "Too many accounts from this connection. Try again later." },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("Check the form and try again.");

  const email = parsed.data.email.toLowerCase().trim();

  // Closed-instance mode: the first account claims it, nobody else can.
  if (process.env.ALLOW_SIGNUPS === "false" && (await prisma.user.count()) > 0) {
    return json({ error: "This ToDo is private. Ask its owner for an account." }, { status: 403 });
  }

  const policy = checkPassword(parsed.data.password, email);
  if (!policy.ok) return badRequest(policy.reason);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Telling a stranger which addresses are registered is a gift to anyone
    // building a target list, so the response is the same either way and the
    // real account holder gets an email instead.
    if (!existing.emailVerified) await sendVerificationEmail(existing).catch(() => {});
    return json({ ok: true, pending: true });
  }

  const timezone =
    parsed.data.timezone && isValidTimeZone(parsed.data.timezone) ? parsed.data.timezone : "America/New_York";

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name || null,
      passwordHash: await hashPassword(parsed.data.password),
      timezone,
      settings: { create: {} },
    },
  });

  // Without a mail transport nobody could ever confirm, so the first account on
  // a self-hosted instance is trusted and signed straight in.
  if (!mailConfigured()) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    await ensureSettings(user.id);
    await createSession(user.id, req.headers.get("user-agent"), ip);
    return json({ ok: true, pending: false, mailUnconfigured: true });
  }

  await sendVerificationEmail(user).catch((err) => console.error("[register] verification email failed:", err));
  return json({ ok: true, pending: true });
}
