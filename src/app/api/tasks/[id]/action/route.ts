import { z } from "zod";
import { withActor, json, badRequest, notFound, readJson } from "@/lib/api";
import { serializeTask } from "@/lib/tasks";
import {
  completeTask,
  delegateTask,
  dismissTask,
  reopenTask,
  setBucket,
  snoozeTask,
  togglePin,
} from "@/lib/actions";
import { isoDate } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["complete", "reopen", "dismiss", "snooze", "delegate", "pin", "move"]),
  until: isoDate.optional(),
  to: z.string().trim().max(160).optional(),
  bucket: z.string().optional(),
  pinned: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * One endpoint for every swipe and tap on a card. Each of these writes a
 * suppression row too, which is how the agent finds out you dealt with it.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withActor(req, async (actor) => {
    const { id } = await ctx.params;
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("Unknown action.");

    const { action } = parsed.data;
    const userId = actor.user.id;
    let task;

    switch (action) {
      case "complete":
        task = await completeTask(userId, id, { note: parsed.data.note });
        break;
      case "reopen":
        task = await reopenTask(userId, id);
        break;
      case "dismiss":
        task = await dismissTask(userId, id, { note: parsed.data.note });
        break;
      case "snooze": {
        // Default snooze is tomorrow morning, which is what people mean by "later".
        const until = parsed.data.until ?? new Date(Date.now() + 864e5);
        task = await snoozeTask(userId, id, until);
        break;
      }
      case "delegate":
        task = await delegateTask(userId, id, parsed.data.to ?? null, { note: parsed.data.note });
        break;
      case "pin":
        task = await togglePin(userId, id, parsed.data.pinned);
        break;
      case "move":
        if (!parsed.data.bucket) return badRequest("Say which bucket to move it to.");
        task = await setBucket(userId, id, parsed.data.bucket);
        break;
    }

    if (!task) return notFound("That task is gone.");
    return json({ task: serializeTask(task), undoable: action !== "pin" });
  });
}
