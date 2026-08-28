import { prisma } from "@/lib/db";
import { mailConfigured, mailTransport } from "@/lib/mail";
import { pushConfigured, webPushConfigured } from "@/lib/push";
import { fcmConfigured } from "@/lib/push-fcm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one.
 *
 * Deliberately says nothing an attacker could use — no versions, no hostnames,
 * no connection strings. Just whether each dependency is configured and whether
 * the database answers.
 */
export async function GET() {
  const started = Date.now();

  let database: "ok" | "unreachable" = "unreachable";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "unreachable";
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    checks: {
      database,
      mail: mailConfigured() ? mailTransport() : "not_configured",
      webPush: webPushConfigured() ? "ok" : "not_configured",
      nativePush: fcmConfigured() ? "ok" : "not_configured",
      notifications: pushConfigured() ? "ok" : "not_configured",
      signups: process.env.ALLOW_SIGNUPS === "false" ? "closed" : "open",
    },
    latencyMs: Date.now() - started,
  };

  return new Response(JSON.stringify(body), {
    status: database === "ok" ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
