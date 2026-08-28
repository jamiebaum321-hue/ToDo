import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { checkPassword, createSession, getSessionUser, revokeAllSessions } from "@/lib/auth";
import { badRequest, json, readJson, unauthorized } from "@/lib/api";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ current: z.string().min(1), next: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("Enter your current and new password.");

  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return json({ error: "That is not your current password." }, { status: 401 });
  }

  const policy = checkPassword(parsed.data.next, user.email);
  if (!policy.ok) return badRequest(policy.reason);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next), credentialsChangedAt: new Date() },
  });

  // Every other session goes; this one is reissued so the person changing the
  // password is not signed out of the device they are standing at.
  await revokeAllSessions(user.id);
  await createSession(user.id, req.headers.get("user-agent"), clientIp(req));

  return json({ ok: true });
}
