import type { Draft, Prisma, Task, TaskLink } from "@prisma/client";
import { getBucket, type BucketKey } from "./buckets";
import { normalizeMailLink, outlookSchemeFromWeb } from "./mail-links";
import { providerMeta } from "./providers";

export const TASK_STATUSES = ["open", "completed", "dismissed", "snoozed", "delegated"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const isTaskStatus = (v: unknown): v is TaskStatus =>
  typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);

export const taskInclude = {
  links: { orderBy: [{ isPrimary: "desc" }, { position: "asc" }] },
  draft: true,
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Task & { links: TaskLink[]; draft: Draft | null };

export interface TaskLinkDTO {
  id: string;
  kind: string;
  label: string;
  provider: string | null;
  providerLabel: string;
  accent: string;
  web: string | null;
  desktop: string | null;
  mobile: string | null;
  isPrimary: boolean;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  bucket: BucketKey;
  bucketLabel: string;
  status: TaskStatus;
  origin: string;
  reason: string | null;
  confidence: number | null;
  tags: string[];
  pinned: boolean;
  position: number;
  dueAt: string | null;
  snoozedUntil: string | null;
  estimateMinutes: number | null;
  delegateTo: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceKey: string | null;
  source: {
    provider: string | null;
    providerLabel: string;
    chip: string;
    accent: string;
    type: string | null;
    account: string | null;
    from: string | null;
    subject: string | null;
    snippet: string | null;
    receivedAt: string | null;
  };
  links: TaskLinkDTO[];
  draft: {
    id: string;
    provider: string;
    providerLabel: string;
    kind: string;
    subject: string | null;
    body: string | null;
    web: string | null;
    desktop: string | null;
    mobile: string | null;
  } | null;
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function stringifyTags(tags: unknown): string {
  if (!Array.isArray(tags)) return "[]";
  const clean = tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
  return JSON.stringify(clean);
}

function serializeLink(link: TaskLink): TaskLinkDTO {
  const meta = providerMeta(link.provider);
  return {
    id: link.id,
    kind: link.kind,
    label: link.label,
    provider: link.provider,
    providerLabel: meta.label,
    accent: meta.accent,
    // Rows stored before mail-links.ts existed carry the raw Graph webLink and
    // Gmail's browser-local /u/<n>/ shapes — and app slots that are empty or a
    // copy of the web link, which is why phones were never offered the app.
    // normalize and the scheme derivation are idempotent, so fixing them here
    // costs nothing on clean rows and spares a data migration.
    ...mailSlots(link.webUrl, link.desktopUrl, link.mobileUrl),
    isPrimary: link.isPrimary,
  };
}

/** Legacy-safe link slots: web normalized, app slots backfilled with the scheme. */
function mailSlots(webUrl: string | null, desktopUrl: string | null, mobileUrl: string | null) {
  const web = normalizeMailLink(webUrl);
  const scheme = outlookSchemeFromWeb(web);
  const real = (slot: string | null) => (slot && slot !== webUrl && slot !== web ? slot : null);
  return {
    web,
    desktop: real(desktopUrl) ?? scheme ?? desktopUrl,
    mobile: real(mobileUrl) ?? scheme ?? mobileUrl,
  };
}

export function serializeTask(task: TaskWithRelations, opts?: { includeDrafts?: boolean }): TaskDTO {
  const bucket = getBucket(task.bucket);
  const source = providerMeta(task.sourceProvider);
  const showDrafts = opts?.includeDrafts ?? true;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    bucket: bucket.key,
    bucketLabel: bucket.label,
    status: (isTaskStatus(task.status) ? task.status : "open") as TaskStatus,
    origin: task.origin,
    reason: task.reason,
    confidence: task.confidence,
    tags: parseTags(task.tags),
    pinned: task.pinned,
    position: task.position,
    dueAt: task.dueAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    estimateMinutes: task.estimateMinutes,
    delegateTo: task.delegateTo,
    completedAt: task.completedAt?.toISOString() ?? null,
    dismissedAt: task.dismissedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    sourceKey: task.sourceKey,
    source: {
      provider: task.sourceProvider,
      providerLabel: source.label,
      chip: source.chip,
      accent: source.accent,
      type: task.sourceType,
      account: task.sourceAccount,
      from: task.sourceFrom,
      subject: task.sourceSubject,
      snippet: task.sourceSnippet,
      receivedAt: task.sourceReceivedAt?.toISOString() ?? null,
    },
    links: (task.links ?? []).filter((l) => showDrafts || l.kind !== "draft").map(serializeLink),
    draft:
      task.draft && showDrafts
        ? {
            id: task.draft.id,
            provider: task.draft.provider,
            providerLabel: providerMeta(task.draft.provider).label,
            kind: task.draft.kind,
            subject: task.draft.subject,
            body: task.draft.body,
            web: normalizeMailLink(task.draft.webUrl),
            desktop: task.draft.desktopUrl,
            mobile: task.draft.mobileUrl,
          }
        : null,
  };
}

/**
 * A compact shape for the MCP client. The agent does not need every UI field,
 * and a smaller payload means it can read more tasks before running out of room.
 */
export function serializeTaskForAgent(task: TaskWithRelations) {
  return {
    id: task.id,
    sourceKey: task.sourceKey,
    title: task.title,
    description: task.description,
    bucket: task.bucket,
    status: task.status,
    origin: task.origin,
    reason: task.reason,
    tags: parseTags(task.tags),
    dueAt: task.dueAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    delegateTo: task.delegateTo,
    pinned: task.pinned,
    source: {
      provider: task.sourceProvider,
      type: task.sourceType,
      externalId: task.sourceExternalId,
      account: task.sourceAccount,
      from: task.sourceFrom,
      subject: task.sourceSubject,
      receivedAt: task.sourceReceivedAt?.toISOString() ?? null,
    },
    hasDraft: Boolean(task.draft),
    links: (task.links ?? []).map((l) => ({
      kind: l.kind,
      label: l.label,
      provider: l.provider,
      ...mailSlots(l.webUrl, l.desktopUrl, l.mobileUrl),
    })),
    completedAt: task.completedAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * Ordering the list the way you would actually work it: pinned first, then
 * overdue, then by bucket, then by due date, then by the agent's own ranking.
 */
export function compareTasks(a: Task, b: Task): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

  const now = Date.now();
  const aOver = a.dueAt ? a.dueAt.getTime() < now : false;
  const bOver = b.dueAt ? b.dueAt.getTime() < now : false;
  if (aOver !== bOver) return aOver ? -1 : 1;

  const ab = getBucket(a.bucket).order;
  const bb = getBucket(b.bucket).order;
  if (ab !== bb) return ab - bb;

  if (a.position !== b.position) return a.position - b.position;

  const ad = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bd = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;

  return b.createdAt.getTime() - a.createdAt.getTime();
}
