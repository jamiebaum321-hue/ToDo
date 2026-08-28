import { prisma } from "./db";

/**
 * The memory that stops the agent repeating itself.
 *
 * The agent looks at a rolling window, so yesterday's un-replied email is still
 * sitting there this morning. Without this table it would file "get back to Bob"
 * again every single day until Bob is answered *in a way the agent can see*.
 * Clearing the task in the app writes a row here keyed by the message's stable
 * id, and the next run reads these rows before it writes anything.
 */

export const SUPPRESSION_ACTIONS = [
  "completed",
  "dismissed",
  "delegated",
  "snoozed",
  "not_relevant",
] as const;
export type SuppressionAction = (typeof SUPPRESSION_ACTIONS)[number];

export const isSuppressionAction = (v: unknown): v is SuppressionAction =>
  typeof v === "string" && (SUPPRESSION_ACTIONS as readonly string[]).includes(v);

/** Human wording for the agent, so the skip reason reads like an explanation. */
export const SUPPRESSION_REASON: Record<SuppressionAction, string> = {
  completed: "already marked done in the ToDo app",
  dismissed: "dismissed in the ToDo app",
  delegated: "handed off to someone else in the ToDo app",
  snoozed: "snoozed in the ToDo app",
  not_relevant: "marked not relevant in the ToDo app",
};

export interface RecordSuppressionInput {
  userId: string;
  sourceKey: string;
  action: SuppressionAction;
  taskTitle?: string | null;
  note?: string | null;
  /** Snoozes come back; completions do not unless the caller says so. */
  expiresAt?: Date | null;
}

export async function recordSuppression(input: RecordSuppressionInput) {
  const { userId, sourceKey, action } = input;
  if (!sourceKey) return null;

  return prisma.suppression.upsert({
    where: { userId_sourceKey: { userId, sourceKey } },
    create: {
      userId,
      sourceKey,
      action,
      taskTitle: input.taskTitle?.slice(0, 300) ?? null,
      note: input.note?.slice(0, 500) ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    update: {
      action,
      taskTitle: input.taskTitle?.slice(0, 300) ?? undefined,
      note: input.note?.slice(0, 500) ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

/** Re-opening a task means "actually, I do still need to do this". */
export async function clearSuppression(userId: string, sourceKey: string | null | undefined) {
  if (!sourceKey) return;
  await prisma.suppression.deleteMany({ where: { userId, sourceKey } });
}

export async function activeSuppressions(userId: string, opts?: { since?: Date; limit?: number }) {
  const now = new Date();
  return prisma.suppression.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(opts?.since ? { updatedAt: { gte: opts.since } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 500,
  });
}

/** Fast lookup for the sync path. */
export async function suppressionMap(userId: string): Promise<Map<string, { action: SuppressionAction; at: Date; title: string | null }>> {
  const rows = await activeSuppressions(userId, { limit: 5000 });
  const map = new Map<string, { action: SuppressionAction; at: Date; title: string | null }>();
  for (const row of rows) {
    if (!isSuppressionAction(row.action)) continue;
    map.set(row.sourceKey, { action: row.action, at: row.updatedAt, title: row.taskTitle });
  }
  return map;
}

/**
 * Snoozes expire on their own, but a long-dead suppression for a message the
 * agent has stopped sending is just clutter. Trim anything expired.
 */
export async function pruneExpiredSuppressions(userId?: string) {
  const { count } = await prisma.suppression.deleteMany({
    where: { ...(userId ? { userId } : {}), expiresAt: { lt: new Date() } },
  });
  return count;
}
