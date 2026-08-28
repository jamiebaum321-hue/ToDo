import { prisma } from "@/lib/db";
import { withActor, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run history: what the agent did each morning, and what it was told not to. */
export async function GET(req: Request) {
  return withActor(req, async (actor) => {
    const runs = await prisma.agentRun.findMany({
      where: { userId: actor.user.id },
      orderBy: { startedAt: "desc" },
      take: 25,
    });
    return json({
      runs: runs.map((r) => ({
        id: r.id,
        at: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        client: r.client,
        source: r.source,
        status: r.status,
        windowDays: r.windowDays,
        created: r.createdCount,
        updated: r.updatedCount,
        unchanged: r.unchangedCount,
        removed: r.removedCount,
        skipped: r.skippedCount,
        summary: r.summary,
        skippedDetail: r.skippedDetail ? JSON.parse(r.skippedDetail) : [],
      })),
    });
  });
}
