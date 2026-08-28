import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { destroySession, getSessionUser } from "@/lib/auth";
import { badRequest, json, readJson, unauthorized } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const [tasks, tokens, devices, sessions] = await Promise.all([
    prisma.task.count({ where: { userId: user.id } }),
    prisma.apiToken.count({ where: { userId: user.id, revokedAt: null } }),
    prisma.pushDevice.count({ where: { userId: user.id } }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);

  return json({
    user: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerified?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    counts: { tasks, tokens, devices, sessions },
  });
}

const deleteSchema = z.object({
  password: z.string().min(1),
  /** Typed by hand, so this cannot happen on a mis-tap. */
  confirm: z.literal("DELETE"),
});

/**
 * Delete the account and everything in it.
 *
 * Reachable from inside the app on purpose: the App Store requires an account
 * created in an app to be deletable from that app, not only by emailing
 * support. Every related row cascades from the User row, so this is genuinely
 * complete rather than a flag that hides things.
 */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = deleteSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest('Type DELETE and your password to confirm.');

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return json({ error: "That password is not right." }, { status: 401 });
  }

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  return json({ ok: true });
}
