import { prisma } from "@/lib/db";
import { json } from "@/lib/api";
import { safeEqual } from "@/lib/crypto";
import { archiveOldCompleted, wakeSnoozedTasks } from "@/lib/actions";
import { pruneExpiredSuppressions } from "@/lib/suppression";
import { pruneRateLimits } from "@/lib/rate-limit";
import { pruneVerificationTokens } from "@/lib/verification";
import { prisma as db } from "@/lib/db";
import { sendDigest, sendPushToUser } from "@/lib/push";
import { crossedLocalTime, relativeLabel } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full sync_tasks call writes a whole list; the default 15s is not enough.
export const maxDuration = 60;

/**
 * The housekeeping tick. Call it every 15 minutes — from Vercel Cron, a systemd
 * timer, GitHub Actions, or the bundled worker in `scripts/worker.ts`.
 *
 * It is deliberately idempotent and time-window based rather than "fire at
 * exactly 07:00": each user's digest goes out on the first tick after their
 * local digest time, so one schedule serves every timezone.
 */
const TICK_WINDOW_MINUTES = 20;

type AuthResult = "ok" | "unconfigured" | "denied";

function authorize(req: Request): AuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Open in development so `curl localhost:3000/api/cron/tick` just works;
    // never open in production, where an unset secret is a misconfiguration
    // rather than permission to run.
    return process.env.NODE_ENV === "production" ? "unconfigured" : "ok";
  }

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1];
  const query = new URL(req.url).searchParams.get("secret");
  const provided = bearer ?? query ?? "";
  return provided.length > 0 && safeEqual(provided, secret) ? "ok" : "denied";
}

async function runTick(req: Request) {
  const auth = authorize(req);
  if (auth === "unconfigured") {
    return json(
      {
        error: "CRON_SECRET is not set, so this endpoint is disabled.",
        fix: "Set CRON_SECRET in the environment, then call this with `Authorization: Bearer $CRON_SECRET`.",
      },
      { status: 503 },
    );
  }
  if (auth === "denied") return json({ error: "Not authorised." }, { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const now = new Date();

  const woken = await wakeSnoozedTasks();
  const pruned = await pruneExpiredSuppressions();
  // Housekeeping for the tables nothing else cleans up.
  const rateLimitsPruned = await pruneRateLimits();
  const tokensPruned = await pruneVerificationTokens();
  const sessionsPruned = (await db.session.deleteMany({ where: { expiresAt: { lt: now } } })).count;

  const users = await prisma.user.findMany({ include: { settings: true } });
  const digests: { email: string; sent: number; skipped: string | null }[] = [];
  let reminders = 0;
  let archived = 0;

  for (const user of users) {
    const settings = user.settings;
    if (!settings) continue;

    archived += await archiveOldCompleted(user.id, settings.autoArchiveDays);

    // --- daily digest ------------------------------------------------------
    if (settings.digestEnabled) {
      const due = force || crossedLocalTime(now, user.timezone, settings.digestTime, TICK_WINDOW_MINUTES);
      if (due) {
        // One digest per local day, whatever the tick cadence.
        const since = new Date(now.getTime() - 12 * 3600e3);
        const already = await prisma.notificationLog.findFirst({
          where: { userId: user.id, kind: "digest", sentAt: { gte: since } },
        });
        if (!already || force) {
          const res = await sendDigest(user.id);
          digests.push({ email: user.email, sent: res.sent, skipped: res.skipped });
        }
      }
    }

    // --- due-soon reminders ------------------------------------------------
    if (settings.remindersEnabled) {
      const soon = new Date(now.getTime() + 60 * 60e3);
      const dueSoon = await prisma.task.findMany({
        where: {
          userId: user.id,
          status: "open",
          dueAt: { gte: now, lte: soon },
          bucket: { in: ["urgent_important", "urgent_not_priority"] },
        },
        take: 5,
      });

      for (const task of dueSoon) {
        const alreadySent = await prisma.notificationLog.findFirst({
          where: { userId: user.id, kind: "reminder", taskId: task.id },
        });
        if (alreadySent) continue;

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

  return json({
    ok: true,
    at: now.toISOString(),
    snoozedWoken: woken,
    suppressionsPruned: pruned,
    rateLimitsPruned,
    verificationTokensPruned: tokensPruned,
    sessionsPruned,
    archived,
    digests,
    reminders,
  });
}

export async function GET(req: Request) {
  return runTick(req);
}

export async function POST(req: Request) {
  return runTick(req);
}
