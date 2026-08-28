import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser, revokeAllSessions } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { cookies } from "next/headers";
import { badRequest, json, readJson, unauthorized } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** Where you are signed in, so a lost laptop can be dealt with. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const here = await currentTokenHash();
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      current: s.tokenHash === here,
      lastSeenAt: s.lastSeenAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

const schema = z.object({ id: z.string().min(1).optional(), all: z.boolean().optional() });

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = schema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return badRequest("Say which session to end.");

  if (parsed.data.all) {
    // Everything except the device asking.
    await revokeAllSessions(user.id, (await currentTokenHash()) ?? undefined);
    return json({ ok: true });
  }

  if (!parsed.data.id) return badRequest("Say which session to end.");
  await prisma.session.deleteMany({ where: { id: parsed.data.id, userId: user.id } });
  return json({ ok: true });
}
