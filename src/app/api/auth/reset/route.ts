import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { checkPassword, createSession, revokeAllSessions } from "@/lib/auth";
import { badRequest, json, readJson } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { consumeToken } from "@/lib/verification";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = await rateLimit("tokenCheck", ip);
  if (!limited.ok) {
    return json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitHeaders(limited) });
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("That link is not valid. Ask for a new one.");

  const result = await consumeToken(parsed.data.token, "password_reset");
  if (!result.ok) {
    const reason =
      result.reason === "expired"
        ? "That link has expired. Ask for a new one."
        : result.reason === "used"
          ? "That link has already been used."
          : "That link is not valid. Ask for a new one.";
    return json({ error: reason }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) return badRequest("That link is not valid. Ask for a new one.");

  const policy = checkPassword(parsed.data.password, user.email);
  if (!policy.ok) return badRequest(policy.reason);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      // Anyone resetting a password may be locking someone else out; retire
      // every existing session, and confirm the address while we are here,
      // since reaching this point proves they read mail sent to it.
      credentialsChangedAt: new Date(),
      emailVerified: user.emailVerified ?? new Date(),
    },
  });
  await revokeAllSessions(user.id);
  await createSession(user.id, req.headers.get("user-agent"), ip);

  return json({ ok: true });
}
