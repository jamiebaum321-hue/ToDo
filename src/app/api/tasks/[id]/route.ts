import { prisma } from "@/lib/db";
import { withActor, json, notFound, badRequest, readJson } from "@/lib/api";
import { serializeTask, stringifyTags, taskInclude } from "@/lib/tasks";
import { deleteTask } from "@/lib/actions";
import { normalizeBucket } from "@/lib/buckets";
import { formatZodError, updateTaskInput } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withActor(req, async (actor) => {
    const { id } = await ctx.params;
    const task = await prisma.task.findFirst({ where: { id, userId: actor.user.id }, include: taskInclude });
    if (!task) return notFound("That task is gone.");
    return json({ task: serializeTask(task) });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withActor(req, async (actor) => {
    const { id } = await ctx.params;
    const parsed = updateTaskInput.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const existing = await prisma.task.findFirst({ where: { id, userId: actor.user.id } });
    if (!existing) return notFound("That task is gone.");

    const d = parsed.data;
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.bucket !== undefined ? { bucket: normalizeBucket(d.bucket) } : {}),
        ...(d.dueAt !== undefined ? { dueAt: d.dueAt } : {}),
        ...(d.delegateTo !== undefined ? { delegateTo: d.delegateTo } : {}),
        ...(d.estimateMinutes !== undefined ? { estimateMinutes: d.estimateMinutes } : {}),
        ...(d.tags !== undefined ? { tags: stringifyTags(d.tags) } : {}),
        ...(d.pinned !== undefined ? { pinned: d.pinned } : {}),
        ...(d.position !== undefined ? { position: d.position } : {}),
      },
      include: taskInclude,
    });
    return json({ task: serializeTask(task) });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withActor(req, async (actor) => {
    const { id } = await ctx.params;
    const removed = await deleteTask(actor.user.id, id);
    if (!removed) return notFound("That task is gone.");
    return json({ ok: true });
  });
}
