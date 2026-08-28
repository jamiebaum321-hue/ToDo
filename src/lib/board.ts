import type { User } from "@prisma/client";
import { prisma } from "./db";
import { BUCKETS } from "./buckets";
import { getSettings } from "./settings";
import { listTeam } from "./team";
import { compareTasks, serializeTask, taskInclude } from "./tasks";
import type { BoardPayload } from "./client/types";

/**
 * The single payload the app renders from. Built here so the server component
 * and the REST route can never drift apart.
 */
export async function loadBoard(user: User, status: "open" | "all" = "all"): Promise<BoardPayload> {
  const settings = await getSettings(user.id);

  const tasks = await prisma.task.findMany({
    where: {
      userId: user.id,
      ...(status === "open" ? { status: { in: ["open", "snoozed"] } } : {}),
    },
    include: taskInclude,
    take: 500,
  });

  const dtos = tasks.sort(compareTasks).map((t) => serializeTask(t, { includeDrafts: settings.showDrafts }));

  const counts: Record<string, number> = {};
  for (const t of dtos) if (t.status === "open") counts[t.bucket] = (counts[t.bucket] ?? 0) + 1;

  const lastRun = await prisma.agentRun.findFirst({
    where: { userId: user.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  // "Has it ever run" is not the same question as "is anything connected".
  // An assistant that has just been approved has no runs yet, and telling
  // someone to go and connect one at that point is simply wrong.
  const connections = await prisma.apiToken.count({
    where: {
      userId: user.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  const team = await listTeam(user.id);

  return {
    tasks: dtos,
    team,
    counts,
    buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label, short: b.short, blurb: b.blurb, accent: b.accent })),
    settings: {
      linkPreference: settings.linkPreference as "auto" | "app" | "web",
      showDrafts: settings.showDrafts,
      showReasons: settings.showReasons,
      defaultView: settings.defaultView as "focus" | "board" | "list",
      theme: settings.theme as "system" | "light" | "dark",
    },
    user: { name: user.name, email: user.email, timezone: user.timezone },
    connections,
    lastRun: lastRun
      ? {
          at: lastRun.startedAt.toISOString(),
          client: lastRun.client,
          created: lastRun.createdCount,
          removed: lastRun.removedCount,
          skipped: lastRun.skippedCount,
          summary: lastRun.summary,
        }
      : null,
  };
}
