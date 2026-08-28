import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { ensureSettings } from "@/lib/settings";
import { badRequest, json, readJson } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders, resetRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Enter an email address and password.");

  const email = parsed.data.email.toLowerCase().trim();
  const ip = clientIp(req);

  // Counted per address and per connection: the first stops one account being
  // ground down from many IPs, the second stops one IP spraying many accounts.
  const [byEmail, byIp] = await Promise.all([rateLimit("login", email), rateLimit("login", ip)]);
  const limited = !byEmail.ok ? byEmail : !byIp.ok ? byIp : null;
  if (limited) {
    return json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same response either way, so this cannot be used to probe for accounts.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return json({ error: "That email and password do not match." }, { status: 401 });
  }

  if (!user.emailVerified) {
    return json(
      { error: "Confirm your email address first — check your inbox.", needsVerification: true, email },
      { status: 403 },
    );
  }

  await resetRateLimit("login", email);
  await ensureSettings(user.id);
  await createSession(user.id, req.headers.get("user-agent"), ip);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
