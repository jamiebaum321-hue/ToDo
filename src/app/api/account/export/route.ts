import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import { taskInclude } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything held about the signed-in account, as one JSON file.
 *
 * Secrets are deliberately absent: password hashes and token hashes are not
 * the user's data to take with them, and putting them in a file that lands in
 * a downloads folder would be a liability rather than a feature.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const [tasks, suppressions, runs, devices, tokens, events, settings, notifications] = await Promise.all([
    prisma.task.findMany({ where: { userId: user.id }, include: taskInclude }),
    prisma.suppression.findMany({ where: { userId: user.id } }),
    prisma.agentRun.findMany({ where: { userId: user.id } }),
    prisma.pushDevice.findMany({ where: { userId: user.id } }),
    prisma.apiToken.findMany({ where: { userId: user.id } }),
    prisma.taskEvent.findMany({ where: { userId: user.id }, take: 5000, orderBy: { createdAt: "desc" } }),
    prisma.settings.findUnique({ where: { userId: user.id } }),
    prisma.notificationLog.findMany({ where: { userId: user.id }, take: 2000, orderBy: { sentAt: "desc" } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
    settings,
    tasks,
    suppressions,
    agentRuns: runs,
    taskEvents: events,
    notifications,
    // Names and usage only — never the token itself, not even hashed.
    connections: tokens.map((t) => ({
      name: t.name,
      prefix: t.prefix,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
    })),
    devices: devices.map((d) => ({
      transport: d.transport,
      platform: d.platform,
      label: d.label,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
    })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="todo-export-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
