/**
 * Standalone scheduler for self-hosted deployments.
 *
 *   npm run worker
 *
 * Vercel and friends have their own cron, and can just hit /api/cron/tick. On a
 * VPS or in Docker there is often nothing scheduling anything, so this process
 * does the same work in-process on a fixed interval: wake snoozed tasks, send
 * each user their digest at their own local time, fire due-soon reminders, and
 * tidy up.
 */
import { loadEnv } from "./load-env";

loadEnv();

import { prisma } from "../src/lib/db";
import { archiveOldCompleted, wakeSnoozedTasks } from "../src/lib/actions";
import { pruneExpiredSuppressions } from "../src/lib/suppression";
import { sendDigest, sendPushToUser, pushConfigured } from "../src/lib/push";
import { crossedLocalTime, relativeLabel } from "../src/lib/time";

const INTERVAL_MINUTES = Number(process.env.WORKER_INTERVAL_MINUTES ?? 5);
/** Slightly wider than the interval, so a slow tick never skips a digest. */
const WINDOW_MINUTES = INTERVAL_MINUTES * 4;

let running = false;

async function tick() {
  if (running) return; // a slow tick must not overlap itself
  running = true;
  const started = Date.now();

  try {
    const woken = await wakeSnoozedTasks();
    const pruned = await pruneExpiredSuppressions();
    const users = await prisma.user.findMany({ include: { settings: true } });

    let digests = 0;
    let reminders = 0;
    let archived = 0;

    for (const user of users) {
      const settings = user.settings;
      if (!settings) continue;

      archived += await archiveOldCompleted(user.id, settings.autoArchiveDays);

      if (settings.digestEnabled && crossedLocalTime(new Date(), user.timezone, settings.digestTime, WINDOW_MINUTES)) {
        const recent = await prisma.notificationLog.findFirst({
          where: { userId: user.id, kind: "digest", sentAt: { gte: new Date(Date.now() - 12 * 3600e3) } },
        });
        if (!recent) {
          const res = await sendDigest(user.id);
          if (res.sent > 0) digests += 1;
        }
      }

      if (settings.remindersEnabled) {
        const now = new Date();
        const dueSoon = await prisma.task.findMany({
          where: {
            userId: user.id,
            status: "open",
            dueAt: { gte: now, lte: new Date(now.getTime() + 3600e3) },
            bucket: { in: ["urgent_important", "urgent_not_priority"] },
          },
          take: 5,
        });

        for (const task of dueSoon) {
          const already = await prisma.notificationLog.findFirst({
            where: { userId: user.id, kind: "reminder", taskId: task.id },
          });
          if (already) continue;

          const res = await sendPushToUser(user.id, {
            title: task.title,
            body: task.dueAt ? `Due ${relativeLabel(task.dueAt, now)}` : "Due soon",
            kind: "reminder",
            taskId: task.id,
            url: `/?task=${task.id}`,
            tag: `reminder-${task.id}`,
            urgent: task.bucket === "urgent_important",
          });
          if (res.sent > 0) reminders += 1;
        }
      }
    }

    const ms = Date.now() - started;
    if (woken || pruned || digests || reminders || archived) {
      console.log(
        `[worker] ${new Date().toISOString()} — ${woken} woken, ${digests} digests, ${reminders} reminders, ${archived} archived, ${pruned} pruned (${ms}ms)`,
      );
    }
  } catch (err) {
    console.error("[worker] tick failed:", err);
  } finally {
    running = false;
  }
}

console.log(
  `[worker] started — every ${INTERVAL_MINUTES} min. Push is ${pushConfigured() ? "configured" : "NOT configured (set VAPID keys)"}.`,
);

void tick();
const timer = setInterval(tick, INTERVAL_MINUTES * 60_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log("[worker] stopping");
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
