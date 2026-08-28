import { prisma } from "@/lib/db";
import { withActor, json, badRequest, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { formatZodError, settingsInput } from "@/lib/validation";
import { isValidTimeZone } from "@/lib/time";
import { publicVapidKey, pushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withActor(req, async (actor) => {
    const settings = await getSettings(actor.user.id);
    const devices = await prisma.pushDevice.findMany({
      where: { userId: actor.user.id },
      select: { id: true, platform: true, label: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    return json({
      settings,
      user: { name: actor.user.name, email: actor.user.email, timezone: actor.user.timezone },
      push: { configured: pushConfigured(), publicKey: publicVapidKey(), devices },
    });
  });
}

export async function PATCH(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = settingsInput.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const { timezone, ...rest } = parsed.data;
    if (timezone) {
      if (!isValidTimeZone(timezone)) return badRequest("That is not a timezone I recognise.");
      await prisma.user.update({ where: { id: actor.user.id }, data: { timezone } });
    }

    const settings = await prisma.settings.upsert({
      where: { userId: actor.user.id },
      create: { userId: actor.user.id, ...rest },
      update: rest,
    });
    return json({ settings, timezone: timezone ?? actor.user.timezone });
  });
}
