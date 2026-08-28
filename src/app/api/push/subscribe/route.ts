import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, json, badRequest, readJson } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  platform: z.string().max(20).optional(),
  label: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("That push subscription is not valid.");
    const { endpoint, keys, platform, label } = parsed.data;

    // Re-subscribing on the same device must not create a second row, or every
    // notification arrives twice.
    const device = await prisma.pushDevice.upsert({
      where: { endpoint },
      create: {
        userId: actor.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        platform: platform ?? null,
        label: label ?? null,
      },
      update: {
        userId: actor.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        lastSeenAt: new Date(),
        failureCount: 0,
        ...(platform ? { platform } : {}),
        ...(label ? { label } : {}),
      },
    });
    return json({ ok: true, deviceId: device.id });
  });
}

export async function DELETE(req: Request) {
  return withActor(req, async (actor) => {
    const body = await readJson<{ endpoint?: string }>(req);
    if (!body?.endpoint) return badRequest("Which device?");
    await prisma.pushDevice.deleteMany({ where: { userId: actor.user.id, endpoint: body.endpoint } });
    return json({ ok: true });
  });
}
