import { prisma } from "./db";
import { normalizeBucket } from "./buckets";
import { clearSuppression, recordSuppression, type SuppressionAction } from "./suppression";
import { stringifyTags, taskInclude, type TaskWithRelations } from "./tasks";

export type Actor = "user" | "agent" | "system";

interface ActionOpts {
  actor?: Actor;
  note?: string | null;
}

async function loadTask(userId: string, taskId: string): Promise<TaskWithRelations | null> {
  return prisma.task.findFirst({ where: { id: taskId, userId }, include: taskInclude });
}

/** Snapshot of the fields an undo needs to put back. */
function undoSnapshot(task: TaskWithRelations) {
  return {
    status: task.status,
    bucket: task.bucket,
    completedAt: task.completedAt?.toISOString() ?? null,
    dismissedAt: task.dismissedAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    delegateTo: task.delegateTo,
    pinned: task.pinned,
    title: task.title,
  };
}

async function writeEvent(
  userId: string,
  taskId: string | null,
  type: string,
  actor: Actor,
  payload: unknown,
) {
  await prisma.taskEvent.create({
    data: { userId, taskId, type, actor, payload: JSON.stringify(payload ?? {}) },
  });
}

/**
 * Marking something done is not just a status change — it is the message the
 * app sends back to your subscription. Without the suppression row the agent
 * would file the same task again tomorrow morning.
 */
export async function completeTask(userId: string, taskId: string, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: "completed", completedAt: new Date(), snoozedUntil: null },
    include: taskInclude,
  });

  await recordSuppression({
    userId,
    sourceKey: task.sourceKey ?? "",
    action: "completed",
    taskTitle: task.title,
    note: opts.note ?? null,
  });
  await writeEvent(userId, task.id, "completed", opts.actor ?? "user", { before });
  return updated;
}

export async function reopenTask(userId: string, taskId: string, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: "open", completedAt: null, dismissedAt: null, snoozedUntil: null },
    include: taskInclude,
  });

  // "Actually, I still need to do this" — let the agent surface it again.
  await clearSuppression(userId, task.sourceKey);
  await writeEvent(userId, task.id, "reopened", opts.actor ?? "user", { before });
  return updated;
}

export async function dismissTask(userId: string, taskId: string, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: "dismissed", dismissedAt: new Date(), snoozedUntil: null },
    include: taskInclude,
  });

  await recordSuppression({
    userId,
    sourceKey: task.sourceKey ?? "",
    action: "dismissed",
    taskTitle: task.title,
    note: opts.note ?? null,
  });
  await writeEvent(userId, task.id, "dismissed", opts.actor ?? "user", { before });
  return updated;
}

export async function snoozeTask(userId: string, taskId: string, until: Date, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: "snoozed", snoozedUntil: until, completedAt: null, dismissedAt: null },
    include: taskInclude,
  });

  // Expiring suppression: the agent is free to raise it again once the snooze
  // is up, which is exactly what a snooze means.
  await recordSuppression({
    userId,
    sourceKey: task.sourceKey ?? "",
    action: "snoozed",
    taskTitle: task.title,
    expiresAt: until,
    note: opts.note ?? null,
  });
  await writeEvent(userId, task.id, "snoozed", opts.actor ?? "user", { before, until: until.toISOString() });
  return updated;
}

export async function delegateTask(userId: string, taskId: string, to: string | null, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "delegated",
      delegateTo: to ?? task.delegateTo,
      bucket: "delegate",
      completedAt: new Date(),
    },
    include: taskInclude,
  });

  await recordSuppression({
    userId,
    sourceKey: task.sourceKey ?? "",
    action: "delegated",
    taskTitle: task.title,
    note: opts.note ?? (to ? `Handed to ${to}` : null),
  });
  await writeEvent(userId, task.id, "delegated", opts.actor ?? "user", { before, to });
  return updated;
}

/**
 * A real delete. Used by the Delete bucket, where the point is that the thing
 * goes away and never comes back — so the suppression is permanent.
 */
export async function deleteTask(userId: string, taskId: string, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;

  if (task.sourceKey) {
    await recordSuppression({
      userId,
      sourceKey: task.sourceKey,
      action: "not_relevant",
      taskTitle: task.title,
      note: opts.note ?? null,
    });
  }
  // taskId is deliberately null: the row is about to go and events cascade.
  await writeEvent(userId, null, "deleted", opts.actor ?? "user", {
    task: { id: task.id, title: task.title, bucket: task.bucket, sourceKey: task.sourceKey },
  });
  await prisma.task.delete({ where: { id: task.id } });
  return task;
}

export async function setBucket(userId: string, taskId: string, bucket: string, opts: ActionOpts = {}) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;
  const before = undoSnapshot(task);
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { bucket: normalizeBucket(bucket, "urgent_not_priority") },
    include: taskInclude,
  });
  await writeEvent(userId, task.id, "moved", opts.actor ?? "user", { before, bucket: updated.bucket });
  return updated;
}

export async function togglePin(userId: string, taskId: string, pinned?: boolean) {
  const task = await loadTask(userId, taskId);
  if (!task) return null;
  return prisma.task.update({
    where: { id: task.id },
    data: { pinned: pinned ?? !task.pinned },
    include: taskInclude,
  });
}

/** Clear a whole bucket at once — what the Delete column is really for. */
export async function clearBucket(userId: string, bucket: string, action: SuppressionAction = "not_relevant") {
  const tasks = await prisma.task.findMany({
    where: { userId, bucket: normalizeBucket(bucket), status: "open" },
    include: taskInclude,
  });
  for (const task of tasks) {
    if (action === "completed") await completeTask(userId, task.id);
    else await deleteTask(userId, task.id);
  }
  return tasks.length;
}

/**
 * Undo the most recent reversible action. Backs the toast in the UI, so a
 * mis-tap on a task never costs anything.
 */
export async function undoLastAction(userId: string) {
  const event = await prisma.taskEvent.findFirst({
    where: {
      userId,
      actor: "user",
      type: { in: ["completed", "dismissed", "snoozed", "delegated", "moved"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!event?.taskId) return null;

  let before: ReturnType<typeof undoSnapshot> | undefined;
  try {
    before = JSON.parse(event.payload ?? "{}").before;
  } catch {
    return null;
  }
  if (!before) return null;

  const task = await loadTask(userId, event.taskId);
  if (!task) return null;

  const restored = await prisma.task.update({
    where: { id: task.id },
    data: {
      status: before.status,
      bucket: before.bucket,
      completedAt: before.completedAt ? new Date(before.completedAt) : null,
      dismissedAt: before.dismissedAt ? new Date(before.dismissedAt) : null,
      snoozedUntil: before.snoozedUntil ? new Date(before.snoozedUntil) : null,
      delegateTo: before.delegateTo,
      pinned: before.pinned,
    },
    include: taskInclude,
  });

  if (before.status === "open") await clearSuppression(userId, task.sourceKey);
  await prisma.taskEvent.delete({ where: { id: event.id } }).catch(() => {});
  await writeEvent(userId, task.id, "undone", "user", { restoredFrom: event.type });
  return restored;
}

/** Create a task by hand from the "+" button. */
export async function createUserTask(
  userId: string,
  input: { title: string; description?: string | null; bucket?: string; dueAt?: Date | null; tags?: string[]; delegateTo?: string | null; estimateMinutes?: number | null },
) {
  return prisma.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      bucket: normalizeBucket(input.bucket, "urgent_important"),
      origin: "user",
      status: "open",
      sourceProvider: "manual",
      sourceKey: `manual:${crypto.randomUUID()}`,
      tags: stringifyTags(input.tags ?? []),
      dueAt: input.dueAt ?? null,
      delegateTo: input.delegateTo ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      confidence: null,
    },
    include: taskInclude,
  });
}

/** Snoozed tasks whose time has come, flipped back to open. Run by the cron. */
export async function wakeSnoozedTasks(userId?: string) {
  const now = new Date();
  const due = await prisma.task.findMany({
    where: { ...(userId ? { userId } : {}), status: "snoozed", snoozedUntil: { lte: now } },
    select: { id: true, userId: true, sourceKey: true },
  });
  if (!due.length) return 0;

  await prisma.task.updateMany({
    where: { id: { in: due.map((t) => t.id) } },
    data: { status: "open", snoozedUntil: null },
  });
  for (const t of due) await clearSuppression(t.userId, t.sourceKey);
  return due.length;
}

/** Tidy completed tasks after the user's retention window. */
export async function archiveOldCompleted(userId: string, days: number) {
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 864e5);
  const { count } = await prisma.task.deleteMany({
    where: {
      userId,
      status: { in: ["completed", "dismissed", "delegated"] },
      OR: [{ completedAt: { lt: cutoff } }, { dismissedAt: { lt: cutoff } }],
    },
  });
  return count;
}
