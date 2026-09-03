import type { Draft, Prisma, Task, TaskLink } from "@prisma/client";
import { getBucket, type BucketKey } from "./buckets";
import {
  buildGmailWebUrl,
  gmailMobileLink,
  isCustomScheme,
  isVerifiedScheme,
  normalizeMailLink,
  outlookMobileLink,
  outlookSchemeFromWeb,
  toBase64Url,
} from "./mail-links";
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

/** The stored ids that let read-time repair tell links apart from guesses. */
interface MailIds {
  provider?: string | null;
  threadId?: string | null;
  account?: string | null;
  /** Graph id of the source message, for pointing an Outlook draft at its thread. */
  outlookItemId?: string | null;
  kind?: string;
}

function serializeLink(link: TaskLink, ids: MailIds): TaskLinkDTO {
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
    ...mailSlots(link.webUrl, link.desktopUrl, link.mobileUrl, { ...ids, provider: link.provider ?? ids.provider, kind: link.kind }),
    isPrimary: link.isPrimary,
  };
}

const isGmailUrl = (u: string | null) => !!u && /^https?:\/\/mail\.google\.com\//i.test(u);
const isGmailScheme = (u: string | null) => !!u && u.startsWith("googlegmail:");
/** The blank-composer shape: Gmail wants its own compose token, not an API draft id. */
const isGmailComposeUrl = (u: string | null) => !!u && isGmailUrl(u) && /[?&#]compose=/i.test(u);

/**
 * Legacy-safe link slots, repaired from stored IDS rather than by parsing
 * URLs. Every rule here was written by a real device failing:
 *
 * - Gmail's app scheme resolves ONLY a real thread id — a cv= link built from
 *   a message id opened the app on "failed to open link" — so it comes from
 *   the stored thread id or not at all, and a stored cv= that disagrees with
 *   that id is discarded as that same bug.
 * - A rfc822msgid search lands on a results list, so with a thread id known
 *   the web link is rebuilt to land ON the conversation.
 * - `#drafts?compose=<draft id>` opened an empty composer; with no thread id
 *   to aim at, the drafts LIST is the honest destination.
 * - A reply draft lives inside its conversation, so draft buttons aim there:
 *   Gmail web + app via the thread, the Outlook app via the SOURCE message.
 *   A draft never derives its app link from its own web link — that produced
 *   an app handoff carrying a draft id, i.e. "message not found".
 * - Only app schemes proven on a device survive at all (isVerifiedScheme);
 *   an agent-supplied ms-outlook://events/open was found live, opening
 *   Outlook on the wrong screen. The https link always works, so it wins.
 * - The desktop slot never carries a scheme: new Outlook on Windows opens
 *   and then refuses them.
 */
function mailSlots(webUrl: string | null, desktopUrl: string | null, mobileUrl: string | null, ids: MailIds = {}) {
  let web = normalizeMailLink(webUrl);

  const gmailish = ids.provider === "gmail" || isGmailUrl(web);
  const thread = ids.threadId?.trim() || null;
  const isDraft = ids.kind === "draft";
  // A calendar item is not a message: its id in the mail app's scheme is just
  // another invented link. The OWA calendar link carries path=/calendar/item.
  const isCalendar =
    ids.kind === "calendar" ||
    (ids.provider ?? "").endsWith("_calendar") ||
    /[?&]path=\/calendar/i.test(web ?? "");

  if (gmailish && (web === null || isGmailUrl(web))) {
    const rebuilt = buildGmailWebUrl({
      threadId: thread,
      account: ids.account,
      kind: isDraft ? "draft" : undefined,
    });
    // With a thread id, land on the conversation. Without one, the only thing
    // worth rewriting is the blank-composer draft link.
    if (thread || (isDraft && isGmailComposeUrl(web))) web = rebuilt ?? web;
  }

  const outlookAnchor =
    ids.provider === "outlook" && isDraft && ids.outlookItemId
      ? outlookMobileLink(toBase64Url(ids.outlookItemId))
      : null;
  const gmailApp = gmailish && thread ? gmailMobileLink(thread) : null;
  const scheme = isCalendar ? null : isDraft ? (outlookAnchor ?? gmailApp) : (outlookSchemeFromWeb(web) ?? gmailApp);

  const real = (slot: string | null) => (slot && slot !== webUrl && slot !== web ? slot : null);
  let storedMobile = real(mobileUrl);
  if (isCustomScheme(storedMobile) && !isVerifiedScheme(storedMobile)) storedMobile = null;
  if (isGmailScheme(storedMobile) && storedMobile !== gmailApp) storedMobile = null;
  // A draft's own web link is about the draft; its app link must be the thread.
  if (isDraft && isCustomScheme(storedMobile) && storedMobile !== scheme) storedMobile = null;

  const storedDesktop = real(desktopUrl) ?? desktopUrl;
  return {
    web,
    desktop: isCustomScheme(storedDesktop) ? null : storedDesktop,
    mobile: storedMobile ?? scheme ?? (isCustomScheme(mobileUrl) ? web : mobileUrl),
  };
}

export function serializeTask(task: TaskWithRelations, opts?: { includeDrafts?: boolean }): TaskDTO {
  const bucket = getBucket(task.bucket);
  const source = providerMeta(task.sourceProvider);
  const showDrafts = opts?.includeDrafts ?? true;
  const ids: MailIds = {
    provider: task.sourceProvider,
    threadId: task.sourceThreadId,
    account: task.sourceAccount,
    outlookItemId: task.sourceExternalId,
  };

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
    links: (task.links ?? []).filter((l) => showDrafts || l.kind !== "draft").map((l) => serializeLink(l, ids)),
    draft:
      task.draft && showDrafts
        ? {
            id: task.draft.id,
            provider: task.draft.provider,
            providerLabel: providerMeta(task.draft.provider).label,
            kind: task.draft.kind,
            subject: task.draft.subject,
            body: task.draft.body,
            // A reply draft rides its thread, so the draft button gets the
            // same repairs as the source button — and on a phone it opens
            // the conversation in the app, where the draft is waiting.
            ...mailSlots(task.draft.webUrl, task.draft.desktopUrl, task.draft.mobileUrl, {
              ...ids,
              provider: task.draft.provider ?? ids.provider,
              kind: "draft",
            }),
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
      messageId: task.sourceMessageId,
      threadId: task.sourceThreadId,
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
      ...mailSlots(l.webUrl, l.desktopUrl, l.mobileUrl, {
        provider: l.provider ?? task.sourceProvider,
        threadId: task.sourceThreadId,
        account: task.sourceAccount,
        outlookItemId: task.sourceExternalId,
        kind: l.kind,
      }),
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
