import webpush from "web-push";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { isQuietHours } from "./time";
import { fcmConfigured, sendFcm } from "./push-fcm";

let configured = false;

/** Web push, for browsers and installed PWAs. */
export function webPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Either transport being available is enough to notify somebody. */
export function pushConfigured(): boolean {
  return webPushConfigured() || fcmConfigured();
}

export function publicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null;
}

function configure() {
  if (configured || !webPushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@todo.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  /** digest | urgent | reminder | test | agent */
  kind?: string;
  taskId?: string;
  tag?: string;
  /** Buzz the phone even inside quiet hours. Reserved for genuinely urgent. */
  urgent?: boolean;
  badge?: number;
  actions?: { action: string; title: string }[];
}

export interface PushResult {
  sent: number;
  failed: number;
  skipped: "quiet_hours" | "no_devices" | "not_configured" | null;
}

/**
 * Fan a notification out to every device the user has registered — phone,
 * laptop, both. Endpoints that come back 404/410 are gone for good and get
 * pruned, which is what keeps the device list honest over time.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { respectQuietHours?: boolean } = {},
): Promise<PushResult> {
  if (!pushConfigured()) return { sent: 0, failed: 0, skipped: "not_configured" };
  configure();

  if (opts.respectQuietHours !== false && !payload.urgent) {
    const settings = await getSettings(userId);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    if (
      settings.quietHoursEnabled &&
      isQuietHours(new Date(), user?.timezone ?? "UTC", settings.quietHoursStart, settings.quietHoursEnd)
    ) {
      return { sent: 0, failed: 0, skipped: "quiet_hours" };
    }
  }

  const devices = await prisma.pushDevice.findMany({ where: { userId } });
  if (!devices.length) return { sent: 0, failed: 0, skipped: "no_devices" };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
    kind: payload.kind ?? "agent",
    taskId: payload.taskId ?? null,
    tag: payload.tag ?? payload.kind ?? "todo",
    badge: payload.badge ?? null,
    actions: payload.actions ?? [],
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  /** Endpoints and tokens the provider told us are dead. */
  const dead: string[] = [];

  await Promise.all(
    devices.map(async (device) => {
      // --- native (iOS and Android apps, both over FCM) --------------------
      if (device.transport !== "web") {
        if (!device.deviceToken) return;
        const result = await sendFcm(device.deviceToken, {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          taskId: payload.taskId ?? null,
          tag: payload.tag ?? payload.kind ?? "todo",
          badge: payload.badge ?? null,
          urgent: payload.urgent,
        });

        if (result.ok) {
          sent += 1;
          await prisma.pushDevice
            .update({ where: { id: device.id }, data: { lastSeenAt: new Date(), failureCount: 0 } })
            .catch(() => {});
        } else {
          failed += 1;
          if (result.gone) dead.push(device.id);
          else
            await prisma.pushDevice
              .update({ where: { id: device.id }, data: { failureCount: { increment: 1 } } })
              .catch(() => {});
        }
        return;
      }

      // --- web push (browsers and installed PWAs) --------------------------
      if (!device.endpoint || !device.p256dh || !device.auth) return;
      if (!webPushConfigured()) return;

      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          body,
          { TTL: payload.urgent ? 3600 : 86400, urgency: payload.urgent ? "high" : "normal" },
        );
        sent += 1;
        await prisma.pushDevice
          .update({ where: { id: device.id }, data: { lastSeenAt: new Date(), failureCount: 0 } })
          .catch(() => {});
      } catch (err: any) {
        failed += 1;
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          dead.push(device.id);
        } else {
          await prisma.pushDevice
            .update({ where: { id: device.id }, data: { failureCount: { increment: 1 } } })
            .catch(() => {});
        }
      }
    }),
  );

  if (dead.length) await prisma.pushDevice.deleteMany({ where: { id: { in: dead } } }).catch(() => {});

  await prisma.notificationLog
    .create({
      data: {
        userId,
        kind: payload.kind ?? "agent",
        title: payload.title,
        body: payload.body ?? null,
        url: payload.url ?? null,
        taskId: payload.taskId ?? null,
        delivered: sent,
      },
    })
    .catch(() => {});

  return { sent, failed, skipped: null };
}

/** The 7am "here is your day" push. */
export async function sendDigest(userId: string): Promise<PushResult & { counts: Record<string, number> }> {
  const open = await prisma.task.findMany({
    where: { userId, status: "open" },
    select: { bucket: true, dueAt: true },
  });

  const counts: Record<string, number> = {};
  for (const t of open) counts[t.bucket] = (counts[t.bucket] ?? 0) + 1;

  const urgent = counts.urgent_important ?? 0;
  const quick = counts.urgent_not_priority ?? 0;
  const delegate = counts.delegate ?? 0;

  if (open.length === 0) {
    const res = await sendPushToUser(userId, {
      title: "Inbox zero",
      body: "Nothing needs you this morning. Enjoy it.",
      kind: "digest",
      url: "/",
      tag: "digest",
    });
    return { ...res, counts };
  }

  const bits = [
    urgent ? `${urgent} urgent` : null,
    quick ? `${quick} quick` : null,
    delegate ? `${delegate} to hand off` : null,
  ].filter(Boolean);

  const res = await sendPushToUser(userId, {
    title: urgent > 0 ? `${urgent} thing${urgent === 1 ? "" : "s"} need you today` : "Your list is ready",
    body: bits.join(" · ") || `${open.length} open`,
    kind: "digest",
    url: "/",
    tag: "digest",
    badge: open.length,
    actions: [{ action: "open", title: "Open ToDo" }],
  });

  return { ...res, counts };
}
