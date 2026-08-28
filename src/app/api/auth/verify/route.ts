import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { ensureSettings } from "@/lib/settings";
import { badRequest, json, readJson } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { consumeToken } from "@/lib/verification";
import { sendMail, welcomeEmail } from "@/lib/mail";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10).max(200) });

const REASONS: Record<string, string> = {
  invalid: "That link is not valid. Ask for a new one.",
  expired: "That link has expired. Ask for a new one.",
  used: "That link has already been used. Try signing in.",
};

/** Confirms the address and signs them in, so there is no second step. */
export async function POST(req: Request) {
  const limited = await rateLimit("tokenCheck", clientIp(req));
  if (!limited.ok) {
    return json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitHeaders(limited) });
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(REASONS.invalid);

  const result = await consumeToken(parsed.data.token, "verify_email");
  if (!result.ok) return json({ error: REASONS[result.reason] }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) return json({ error: REASONS.invalid }, { status: 400 });

  const alreadyVerified = Boolean(user.emailVerified);
  if (!alreadyVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    sendMail({ ...welcomeEmail(user.name), to: user.email }).catch(() => {});
  }

  await ensureSettings(user.id);
  await createSession(user.id, req.headers.get("user-agent"), clientIp(req));
  return json({ ok: true, alreadyVerified });
}
