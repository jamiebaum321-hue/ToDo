import { withActor, json } from "@/lib/api";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const res = await sendPushToUser(
      actor.user.id,
      {
        title: "ToDo is connected",
        body: "Notifications will reach you here.",
        kind: "test",
        url: "/",
        tag: "test",
        // A test that quiet hours swallow is a test that tells you nothing.
        urgent: true,
      },
      { respectQuietHours: false },
    );
    if (res.skipped === "not_configured") {
      return json({ error: "Push is not set up on this server yet — no VAPID keys." }, { status: 400 });
    }
    if (res.skipped === "no_devices") {
      return json({ error: "Turn on notifications for this device first." }, { status: 400 });
    }
    return json({ ok: true, ...res });
  });
}
