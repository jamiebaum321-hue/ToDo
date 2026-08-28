import { z } from "zod";
import { withActor, json, badRequest, readJson } from "@/lib/api";
import { clearBucket } from "@/lib/actions";

export const runtime = "nodejs";

const schema = z.object({
  bucket: z.string(),
  action: z.enum(["delete", "complete"]).default("delete"),
});

/** "Clear all" on the Delete column — the satisfying one. */
export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("Say which bucket to clear.");
    const count = await clearBucket(
      actor.user.id,
      parsed.data.bucket,
      parsed.data.action === "complete" ? "completed" : "not_relevant",
    );
    return json({ ok: true, cleared: count });
  });
}
