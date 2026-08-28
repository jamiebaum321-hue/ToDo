import { prisma } from "@/lib/db";
import { withActor, json, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  return withActor(req, async (actor) => {
    const { id } = await ctx.params;
    const token = await prisma.apiToken.findFirst({ where: { id, userId: actor.user.id } });
    if (!token) return notFound("No such connection.");
    await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return json({ ok: true });
  });
}
