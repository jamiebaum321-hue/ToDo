import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, json, badRequest, readJson } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(["ios", "android"]),
  label: z.string().max(80).optional(),
});

/**
 * Register an APNs or FCM token from one of the native shells.
 *
 * Both go out through Firebase, so the transport is "fcm" either way; the
 * platform is kept only so the device list can say "iPhone" rather than
 * "device".
 */
export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("That push registration is not valid.");

    const { token, platform, label } = parsed.data;

    // Reinstalling gives a new token; the same token can also move between
    // accounts if a device is handed on. Upserting on the token keeps one row
    // per device and reassigns it rather than delivering to the wrong person.
    const device = await prisma.pushDevice.upsert({
      where: { deviceToken: token },
      create: {
        userId: actor.user.id,
        transport: "fcm",
        deviceToken: token,
        platform,
        label: label ?? null,
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      update: {
        userId: actor.user.id,
        transport: "fcm",
        platform,
        lastSeenAt: new Date(),
        failureCount: 0,
        ...(label ? { label } : {}),
      },
    });

    return json({ ok: true, deviceId: device.id });
  });
}

export async function DELETE(req: Request) {
  return withActor(req, async (actor) => {
    const body = await readJson<{ token?: string }>(req);
    await prisma.pushDevice.deleteMany({
      where: {
        userId: actor.user.id,
        transport: "fcm",
        // With no specific token, drop every native registration for this user.
        ...(body?.token ? { deviceToken: body.token } : {}),
      },
    });
    return json({ ok: true });
  });
}
