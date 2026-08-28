import { z } from "zod";
import { withActor, json, badRequest, readJson } from "@/lib/api";
import { loadBoard } from "@/lib/board";
import { serializeTask } from "@/lib/tasks";
import { createUserTask } from "@/lib/actions";
import { normalizeBucket } from "@/lib/buckets";
import { isoDate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The whole board in one request — the app loads once and filters client-side. */
export async function GET(req: Request) {
  return withActor(req, async (actor) => {
    const status = new URL(req.url).searchParams.get("status") === "open" ? "open" : "all";
    return json(await loadBoard(actor.user, status));
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  bucket: z.string().optional(),
  dueAt: isoDate.nullish(),
  tags: z.array(z.string()).max(12).optional(),
  delegateTo: z.string().trim().max(160).optional(),
  estimateMinutes: z.number().int().min(1).max(6000).optional(),
});

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("Give the task a title.");

    const task = await createUserTask(actor.user.id, {
      ...parsed.data,
      bucket: normalizeBucket(parsed.data.bucket, "urgent_important"),
      dueAt: parsed.data.dueAt ?? null,
    });
    return json({ task: serializeTask(task) }, { status: 201 });
  });
}
