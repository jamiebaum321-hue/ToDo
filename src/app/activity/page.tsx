import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { activeSuppressions } from "@/lib/suppression";
import { ActivityView } from "@/components/app/ActivityView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [runs, handled] = await Promise.all([
    prisma.agentRun.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 25 }),
    activeSuppressions(user.id, { limit: 60 }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of await prisma.task.groupBy({ by: ["bucket"], where: { userId: user.id, status: "open" }, _count: true })) {
    counts[row.bucket] = row._count;
  }

  return (
    <ActivityView
      counts={counts}
      runs={runs.map((r) => ({
        id: r.id,
        at: r.startedAt.toISOString(),
        client: r.client,
        source: r.source,
        status: r.status,
        created: r.createdCount,
        updated: r.updatedCount,
        removed: r.removedCount,
        skipped: r.skippedCount,
        summary: r.summary,
        skippedDetail: safeParse(r.skippedDetail),
      }))}
      handled={handled.map((s) => ({
        sourceKey: s.sourceKey,
        title: s.taskTitle,
        action: s.action,
        at: s.updatedAt.toISOString(),
      }))}
    />
  );
}

function safeParse(value: string | null): { title: string; reason: string }[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
