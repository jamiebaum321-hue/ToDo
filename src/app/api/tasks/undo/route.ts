import { withActor, json } from "@/lib/api";
import { undoLastAction } from "@/lib/actions";
import { serializeTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const task = await undoLastAction(actor.user.id);
    if (!task) return json({ ok: false, error: "Nothing left to undo." }, { status: 404 });
    return json({ ok: true, task: serializeTask(task) });
  });
}
