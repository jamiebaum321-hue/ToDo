import { withActor, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A stamp that changes whenever the list does, and costs almost nothing to ask
 * for — two indexed aggregates and a few dozen bytes back.
 *
 * The app polls this instead of the board so an agent sweep shows up without a
 * reload. Re-fetching the whole board on a timer would work too, but it moves
 * every task on every tick for the sake of the runs that changed something,
 * which is exactly the kind of background cost nobody agreed to.
 */
export async function GET(req: Request) {
  return withActor(req, async (actor) => {
    const [tasks, lastRun] = await Promise.all([
      prisma.task.aggregate({
        where: { userId: actor.user.id },
        _max: { updatedAt: true },
        _count: true,
      }),
      prisma.agentRun.findFirst({
        where: { userId: actor.user.id, status: "completed" },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      }),
    ]);

    // The count catches deletions, which leave no updatedAt behind.
    return json({
      version: [
        tasks._max.updatedAt?.getTime() ?? 0,
        tasks._count,
        lastRun?.startedAt.getTime() ?? 0,
      ].join("-"),
    });
  });
}
