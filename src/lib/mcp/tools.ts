import { prisma } from "../db";
import { BUCKETS, normalizeBucket } from "../buckets";
import { getSettings } from "../settings";
import { describeTeamForAgent, listTeam } from "../team";
import { activeSuppressions, clearSuppression, SUPPRESSION_REASON } from "../suppression";
import { serializeTaskForAgent, stringifyTags, taskInclude } from "../tasks";
import { syncTasks } from "../sync";
import { completeTask, deleteTask as deleteTaskAction, snoozeTask } from "../actions";
import { deriveLinkTarget, defaultLabel, hasAnyUrl } from "../deeplinks";
import { normalizeProvider } from "../providers";
import { sendPushToUser } from "../push";
import { formatZodError, syncInput, taskInput, updateTaskInput } from "../validation";
import { dataResult, errorResult, type JsonRpcRequest } from "./protocol";
import type { Actor } from "../auth";

type ToolResult = ReturnType<typeof dataResult>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Advisory hints clients use to decide what needs confirmation. */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  handler: (args: any, actor: Actor) => Promise<ToolResult>;
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const bool = (description: string, extra: Record<string, unknown> = {}) => ({ type: "boolean", description, ...extra });
const int = (description: string, extra: Record<string, unknown> = {}) => ({ type: "integer", description, ...extra });

const BUCKET_ENUM = BUCKETS.map((b) => b.key);

const SOURCE_SCHEMA = {
  type: "object",
  description:
    "Where this came from. Supply as much as you have — it is what turns the task into a one-tap jump back to the original email, message or meeting.",
  properties: {
    provider: str(
      "outlook | gmail | teams | slack | zoom | google_calendar | outlook_calendar | notion | linear | jira | asana | github",
    ),
    type: str("email | message | meeting | event | file | call"),
    externalId: str(
      "The provider's own id for the item — a Microsoft Graph message id, a Gmail message id, a Zoom meeting number. This is what makes the task stable across runs.",
    ),
    messageId: str(
      "REQUIRED for Gmail if you can get it: the RFC-822 Message-ID header (Gmail API: the 'Message-ID' entry in payload.headers). It makes the only Gmail link that always resolves — it survives archiving, label moves and a different signed-in account. Without it the button often lands on the inbox instead of the thread.",
    ),
    threadId: str(
      "Gmail's threadId (every messages.get returns one). Gmail's deep link resolves a THREAD id, not a message id, so send this whenever you have no Message-ID header — otherwise the link opens All Mail.",
    ),
    account: str(
      "REQUIRED when the user has more than one account: the mailbox address, e.g. 'jamie@company.com'. Gmail's /u/0/ numbering follows whatever order accounts were signed into the browser, so without this the link can open the wrong inbox entirely.",
    ),
    from: str("Sender, ideally 'Bob Whitaker <bob@acme.com>'."),
    subject: str("Original subject line or message title."),
    snippet: str("A short quote from the original so the task has context without opening it."),
    receivedAt: str("ISO 8601 timestamp of the original item."),
    accountIndex: int("For Gmail's /u/{n}/ multi-account URLs. Defaults to 0."),
    url: str("The canonical web URL if the connector gave you one (Graph webLink, Teams permalink). Always prefer this over anything derived."),
    desktopUrl: str("Desktop app URL if you know it, e.g. msteams:/l/message/..."),
    mobileUrl: str("Mobile app URL if you know it, e.g. ms-outlook://emails/message?restId=..."),
  },
} as const;

const LINKS_SCHEMA = {
  type: "array",
  description:
    "Extra buttons for the task detail sheet, beyond the automatic 'open the source' one. Use these for a meeting to join, a calendar entry, or a related file.",
  maxItems: 8,
  items: {
    type: "object",
    properties: {
      kind: str("source | draft | join | calendar | file | custom", { enum: ["source", "draft", "join", "calendar", "file", "custom"] }),
      label: str("Button text. Defaults to something sensible like 'Open in Outlook'."),
      provider: str("Provider for this specific link, if different from the task source."),
      url: str("Web URL (alias of `web`)."),
      web: str("Browser URL."),
      desktop: str("Desktop app URL."),
      mobile: str("Mobile app URL."),
      externalId: str("Provider id, so the app can derive the URLs it is missing."),
      messageId: str("RFC-822 Message-ID, for a mail link the app should derive."),
      threadId: str("Gmail thread id, for a mail link the app should derive."),
      account: str("Mailbox address this link belongs to."),
      primary: bool("Show this as the main button."),
    },
  },
} as const;

const DRAFT_SCHEMA = {
  type: "object",
  description:
    "A reply you already wrote and saved to the user's drafts. Adds a 'See your draft' button next to the open button, so the task is one tap from sent.",
  properties: {
    provider: str("outlook | gmail | ..."),
    kind: str("reply | reply_all | forward | new", { enum: ["reply", "reply_all", "forward", "new"] }),
    subject: str("Draft subject."),
    body: str("Draft body, for preview inside the app."),
    externalId: str("The draft's id in the provider, so the button opens that exact draft."),
    url: str("Direct URL to the draft."),
    desktop: str("Desktop app URL to the draft."),
    mobile: str("Mobile app URL to the draft."),
  },
} as const;

const TASK_SCHEMA = {
  type: "object",
  required: ["title", "bucket"],
  properties: {
    title: str("The action, phrased as something to do: 'Get back to Bob on the proposal'. Keep it under ~70 characters."),
    bucket: str("Which of the four buckets this belongs in.", { enum: BUCKET_ENUM }),
    description: str(
      "One or two sentences of detail shown when the task is opened: what happened, and what 'done' looks like. 'Bob wants the full proposal deck sent over — he asked Tuesday and is waiting.'",
    ),
    reason: str("One short line on why you filed it in this bucket. Shown under the title so the user can trust the sort."),
    sourceKey: str(
      "Stable dedupe key. Leave it out and the app derives one from provider + externalId. Only set it by hand if you are deliberately merging several items into one task.",
    ),
    dueAt: str("ISO 8601 deadline, if there is a real one."),
    estimateMinutes: int("Rough minutes to finish. Powers the 'quick hits' grouping."),
    delegateTo: str("For the delegate bucket: who should get it."),
    tags: { type: "array", items: { type: "string" }, maxItems: 12, description: "Short labels, e.g. ['client', 'proposal']." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "How sure you are about this bucket. Below 0.5 the app flags it for review." },
    source: SOURCE_SCHEMA,
    links: LINKS_SCHEMA,
    draft: DRAFT_SCHEMA,
  },
} as const;

// ---------------------------------------------------------------------------

function toolError(message: string) {
  return errorResult(message) as unknown as ToolResult;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "get_run_context",
    title: "Get run context",
    description:
      "CALL THIS FIRST on every triage run. Returns the user's timezone and current local time, the rolling window to cover, the four bucket definitions, the tasks already on the list, and — most importantly — everything the user has ALREADY HANDLED in the app. Items in `alreadyHandled` must not be turned into tasks again: the user has told you, by clearing them here, that they are done. Without this call you will re-file yesterday's email every single morning.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        handledSince: str("ISO 8601. Only return items handled after this. Omit to get everything still in effect."),
        includeOpenTasks: bool("Include the current open list. Default true."),
      },
    },
    handler: async (args, actor) => {
      const userId = actor.user.id;
      const settings = await getSettings(userId);
      const team = await listTeam(userId);
      const since = args?.handledSince ? new Date(args.handledSince) : undefined;
      const suppressions = await activeSuppressions(userId, {
        since: since && !Number.isNaN(since.getTime()) ? since : undefined,
      });

      const includeOpen = args?.includeOpenTasks !== false;
      const openTasks = includeOpen
        ? await prisma.task.findMany({
            where: { userId, status: { in: ["open", "snoozed"] } },
            include: taskInclude,
            orderBy: [{ pinned: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
            take: 200,
          })
        : [];

      const lastRun = await prisma.agentRun.findFirst({
        where: { userId, status: "completed" },
        orderBy: { startedAt: "desc" },
      });

      const now = new Date();
      const windowDays = settings.rollingWindowDays;

      return dataResult(
        `Context for ${actor.user.email}: ${openTasks.length} open, ${suppressions.length} already handled, ${windowDays}-day window.`,
        {
          now: now.toISOString(),
          timezone: actor.user.timezone,
          user: { name: actor.user.name, email: actor.user.email },
          window: {
            days: windowDays,
            from: new Date(now.getTime() - windowDays * 864e5).toISOString(),
            to: new Date(now.getTime() + windowDays * 864e5).toISOString(),
          },
          buckets: BUCKETS.map((b) => ({ key: b.key, label: b.label, meaning: b.blurb })),
          // Repeated here on purpose. The same rules go out as the server's
          // instructions when the connection is made, but clients read those
          // once — a setting changed since then only reaches the agent through
          // this call, so this is the copy to trust.
          houseRules: {
            rollingWindowDays: windowDays,
            writeDrafts: settings.requestDrafts,
            writeDraftsMeaning: settings.requestDrafts
              ? "Write the obvious replies, save them to the user's drafts, and pass them in `draft` — whether or not this run's prompt mentioned drafts."
              : "Do not write draft replies; the user has turned that off.",
            explainBucketChoices: settings.showReasons,
            digestTime: settings.digestTime,
          },
          team: {
            members: team,
            guidance: describeTeamForAgent(team),
          },
          preferences: {
            writeDrafts: settings.requestDrafts,
            showReasons: settings.showReasons,
            rollingWindowDays: windowDays,
            digestTime: settings.digestTime,
          },
          alreadyHandled: suppressions.map((s) => ({
            sourceKey: s.sourceKey,
            title: s.taskTitle,
            action: s.action,
            meaning: SUPPRESSION_REASON[s.action as keyof typeof SUPPRESSION_REASON] ?? "handled in the app",
            handledAt: s.updatedAt.toISOString(),
            expiresAt: s.expiresAt?.toISOString() ?? null,
            note: s.note,
          })),
          openTasks: openTasks.map(serializeTaskForAgent),
          lastRun: lastRun
            ? {
                at: lastRun.startedAt.toISOString(),
                created: lastRun.createdCount,
                updated: lastRun.updatedCount,
                removed: lastRun.removedCount,
                skipped: lastRun.skippedCount,
              }
            : null,
          guidance:
            "Build the full list for the window, then send it in ONE sync_tasks call with replace='window'. Anything you leave out is cleared. Anything in alreadyHandled will be refused and reported back to you — do not re-raise those just because the original email is still sitting in the mailbox; only something genuinely new on the same item (a fresh reply, a moved deadline) justifies a new task, and a message you have already seen is not new evidence. Follow `houseRules` even where this run's prompt says nothing about them.",
        },
      );
    },
  },

  {
    name: "sync_tasks",
    title: "Replace the task list",
    description:
      "Write the user's list in a single call. Send every task you want on the list right now; with replace='window' (the default) anything you leave out is cleared, so the old list is genuinely replaced rather than added to. Tasks the user pinned and tasks they created themselves are never touched. Tasks the user has already cleared are refused and returned in `skippedTasks` with the reason — read that array, it is the app telling you what you got wrong.",
    annotations: { destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      required: ["tasks"],
      properties: {
        tasks: { type: "array", maxItems: 300, items: TASK_SCHEMA, description: "The complete list for the window." },
        replace: str(
          "'window' clears anything you did not re-send (use this for the daily run). 'none' only adds and updates.",
          { enum: ["window", "none"], default: "window" },
        ),
        windowDays: int("Rolling window you covered. Defaults to the user's setting."),
        client: str("Which assistant is calling, e.g. 'Claude' or 'ChatGPT'. Shown in the app's run history."),
        summary: str("One line on what you found this run. Shown in the app."),
        dryRun: bool("Report what would happen without writing. Default false."),
        force: bool("Recreate tasks even if the user already cleared them. Almost never right — only when the user explicitly asks."),
        notify: bool("Send a push notification once the new list is in."),
      },
    },
    handler: async (args, actor) => {
      const parsed = syncInput.safeParse(args ?? {});
      if (!parsed.success) return toolError(`Invalid arguments — ${formatZodError(parsed.error)}`);

      const result = await syncTasks(actor.user.id, parsed.data, {
        tokenId: actor.tokenId ?? null,
        source: "scheduled",
        client: parsed.data.client ?? null,
      });

      if (parsed.data.notify && !parsed.data.dryRun && result.created > 0) {
        await sendPushToUser(actor.user.id, {
          title: "Your list is ready",
          body: result.message,
          kind: "agent",
          url: "/",
          tag: "sync",
        }).catch(() => {});
      }

      const hint =
        result.skipped > 0
          ? ` ${result.skipped} item(s) were refused because the user already handled them — do not send those again.`
          : "";

      return dataResult(result.message + hint, result);
    },
  },

  {
    name: "list_team",
    title: "Who work can go to",
    description:
      "The people the user can hand work to right now, with what each covers and how much they can decide. Read this before putting anything in the `delegate` bucket. The roster you were given when you connected can be months old — people join and leave — so check here rather than trusting it, and use the exact `name` in `delegateTo`.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, actor) => {
      const team = await listTeam(actor.user.id);
      return dataResult(
        team.length === 0
          ? "Nobody on the team yet — do not use the delegate bucket."
          : `${team.length} on the team: ${team.map((m) => m.name).join(", ")}.`,
        { team, guidance: describeTeamForAgent(team) },
      );
    },
  },

  {
    name: "get_handled_items",
    title: "What the user already did",
    description:
      "The list of items the user has cleared in the app, keyed by sourceKey. Check this before creating any task for something you found in email or chat: if the key is here, the user has handled it and you must not raise it again. Cheaper than get_run_context when you only need this one thing.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        since: str("ISO 8601 — only items handled after this."),
        sourceKeys: {
          type: "array",
          items: { type: "string" },
          maxItems: 200,
          description: "Check specific keys. Returns only these, with a `handled` boolean for each.",
        },
      },
    },
    handler: async (args, actor) => {
      const userId = actor.user.id;
      const since = args?.since ? new Date(args.since) : undefined;
      const rows = await activeSuppressions(userId, {
        since: since && !Number.isNaN(since.getTime()) ? since : undefined,
        limit: 1000,
      });

      if (Array.isArray(args?.sourceKeys) && args.sourceKeys.length) {
        const map = new Map(rows.map((r) => [r.sourceKey, r]));
        const checked = args.sourceKeys.slice(0, 200).map((key: string) => {
          const row = map.get(key);
          return {
            sourceKey: key,
            handled: Boolean(row),
            action: row?.action ?? null,
            handledAt: row?.updatedAt.toISOString() ?? null,
            title: row?.taskTitle ?? null,
          };
        });
        const n = checked.filter((c: any) => c.handled).length;
        return dataResult(`${n} of ${checked.length} already handled.`, { checked });
      }

      return dataResult(`${rows.length} item(s) already handled.`, {
        handled: rows.map((s) => ({
          sourceKey: s.sourceKey,
          title: s.taskTitle,
          action: s.action,
          meaning: SUPPRESSION_REASON[s.action as keyof typeof SUPPRESSION_REASON] ?? "handled in the app",
          handledAt: s.updatedAt.toISOString(),
          expiresAt: s.expiresAt?.toISOString() ?? null,
        })),
      });
    },
  },

  {
    name: "list_tasks",
    title: "List tasks",
    description: "Read the current list. Filter by bucket, status, due date or free text.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        bucket: str("Limit to one bucket.", { enum: BUCKET_ENUM }),
        status: str("open | completed | dismissed | snoozed | delegated | all. Default open.", {
          enum: ["open", "completed", "dismissed", "snoozed", "delegated", "all"],
        }),
        query: str("Free-text match on title, description and subject."),
        dueBefore: str("ISO 8601."),
        limit: int("Max 200. Default 50."),
      },
    },
    handler: async (args, actor) => {
      const status = args?.status ?? "open";
      const tasks = await prisma.task.findMany({
        where: {
          userId: actor.user.id,
          ...(status === "all" ? {} : { status }),
          ...(args?.bucket ? { bucket: normalizeBucket(args.bucket) } : {}),
          ...(args?.dueBefore ? { dueAt: { lte: new Date(args.dueBefore) } } : {}),
          ...(args?.query
            ? {
                OR: [
                  { title: { contains: args.query } },
                  { description: { contains: args.query } },
                  { sourceSubject: { contains: args.query } },
                  { sourceFrom: { contains: args.query } },
                ],
              }
            : {}),
        },
        include: taskInclude,
        orderBy: [{ pinned: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        take: Math.min(Number(args?.limit) || 50, 200),
      });
      return dataResult(`${tasks.length} task(s).`, { tasks: tasks.map(serializeTaskForAgent) });
    },
  },

  {
    name: "get_task",
    title: "Get one task",
    description: "Full detail for a single task, by id or by sourceKey.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { id: str("Task id."), sourceKey: str("Stable source key.") },
    },
    handler: async (args, actor) => {
      if (!args?.id && !args?.sourceKey) return toolError("Provide either `id` or `sourceKey`.");
      const task = await prisma.task.findFirst({
        where: {
          userId: actor.user.id,
          ...(args.id ? { id: args.id } : { sourceKey: args.sourceKey }),
        },
        include: taskInclude,
      });
      if (!task) return toolError("No task matches that id or sourceKey.");
      return dataResult(task.title, serializeTaskForAgent(task));
    },
  },

  {
    name: "create_task",
    title: "Add one task",
    description:
      "Add a single task without touching the rest of the list. Use this for something the user mentions mid-conversation; use sync_tasks for the scheduled run. Refused if the user has already cleared this source.",
    inputSchema: TASK_SCHEMA as unknown as Record<string, unknown>,
    handler: async (args, actor) => {
      const parsed = taskInput.safeParse(args ?? {});
      if (!parsed.success) return toolError(`Invalid arguments — ${formatZodError(parsed.error)}`);

      const result = await syncTasks(
        actor.user.id,
        { tasks: [parsed.data], replace: "none", dryRun: false, force: false },
        { tokenId: actor.tokenId ?? null, source: "api" },
      );

      if (result.skipped > 0) {
        const s = result.skippedTasks[0];
        return toolError(`Not created — "${s.title}" was ${s.reason} on ${new Date(s.handledAt).toLocaleString()}.`);
      }
      return dataResult(result.created ? "Task added." : "Task already existed and was updated.", result);
    },
  },

  {
    name: "update_task",
    title: "Update a task",
    description: "Change the title, description, bucket, due date or delegate of an existing task.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: str("Task id, or the sourceKey."),
        title: str("New title."),
        description: str("New description."),
        bucket: str("Move to a different bucket.", { enum: BUCKET_ENUM }),
        reason: str("New one-line reason."),
        dueAt: str("ISO 8601, or null to clear."),
        delegateTo: str("Who it goes to."),
        estimateMinutes: int("Minutes."),
        tags: { type: "array", items: { type: "string" }, maxItems: 12 },
        pinned: bool("Pin to the top."),
      },
    },
    handler: async (args, actor) => {
      const { id, ...rest } = args ?? {};
      if (!id) return toolError("`id` is required.");
      const parsed = updateTaskInput.safeParse(rest);
      if (!parsed.success) return toolError(`Invalid arguments — ${formatZodError(parsed.error)}`);

      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id }, { sourceKey: id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");

      const d = parsed.data;
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
          ...(d.bucket !== undefined ? { bucket: normalizeBucket(d.bucket) } : {}),
          ...(d.reason !== undefined ? { reason: d.reason } : {}),
          ...(d.dueAt !== undefined ? { dueAt: d.dueAt } : {}),
          ...(d.delegateTo !== undefined ? { delegateTo: d.delegateTo } : {}),
          ...(d.estimateMinutes !== undefined ? { estimateMinutes: d.estimateMinutes } : {}),
          ...(d.tags !== undefined ? { tags: stringifyTags(d.tags) } : {}),
          ...(d.pinned !== undefined ? { pinned: d.pinned } : {}),
        },
        include: taskInclude,
      });
      await prisma.taskEvent.create({
        data: { userId: actor.user.id, taskId: task.id, type: "updated", actor: "agent", payload: JSON.stringify(d) },
      });
      return dataResult("Task updated.", serializeTaskForAgent(updated));
    },
  },

  {
    name: "complete_task",
    title: "Mark a task done",
    description:
      "Mark a task done on the user's behalf — for example when you can see the meeting actually got booked, or the reply was sent. This also records it as handled so no future run raises it again.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: str("Task id or sourceKey."), note: str("Why you are closing it. Shown in the app's history.") },
    },
    handler: async (args, actor) => {
      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id: args?.id }, { sourceKey: args?.id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");
      const done = await completeTask(actor.user.id, task.id, { actor: "agent", note: args?.note ?? null });
      return dataResult(`Completed: ${done?.title}`, { id: task.id, status: "completed" });
    },
  },

  {
    name: "snooze_task",
    title: "Snooze a task",
    description:
      "Push a task out until a date. It leaves the list, and you must not re-raise it before then — the snooze is recorded as a temporary handled item that expires on its own.",
    inputSchema: {
      type: "object",
      required: ["id", "until"],
      properties: { id: str("Task id or sourceKey."), until: str("ISO 8601 — when it should come back.") },
    },
    handler: async (args, actor) => {
      const until = new Date(args?.until);
      if (Number.isNaN(until.getTime())) return toolError("`until` must be a valid ISO 8601 date.");
      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id: args?.id }, { sourceKey: args?.id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");
      await snoozeTask(actor.user.id, task.id, until, { actor: "agent" });
      return dataResult(`Snoozed until ${until.toISOString()}.`, { id: task.id, until: until.toISOString() });
    },
  },

  {
    name: "delete_task",
    title: "Delete a task",
    description:
      "Remove a task permanently and record that it is not relevant, so it never comes back. Use for things the user told you to drop.",
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: str("Task id or sourceKey."), note: str("Why.") },
    },
    handler: async (args, actor) => {
      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id: args?.id }, { sourceKey: args?.id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");
      await deleteTaskAction(actor.user.id, task.id, { actor: "agent", note: args?.note ?? null });
      return dataResult(`Deleted: ${task.title}`, { id: task.id, deleted: true });
    },
  },

  {
    name: "reopen_task",
    title: "Put a task back",
    description:
      "Undo a completion or dismissal and clear the handled record, so the item can appear on future runs again. Use when the user says something is not actually done.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: str("Task id or sourceKey.") },
    },
    handler: async (args, actor) => {
      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id: args?.id }, { sourceKey: args?.id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: "open", completedAt: null, dismissedAt: null, snoozedUntil: null },
      });
      await clearSuppression(actor.user.id, task.sourceKey);
      return dataResult(`Reopened: ${updated.title}`, { id: task.id, status: "open" });
    },
  },

  {
    name: "attach_draft",
    title: "Attach a draft reply",
    description:
      "Attach a reply you have written and saved into the user's drafts. The task then shows a 'See your draft' button that opens that exact draft in Outlook or Gmail — the user reads it, hits send, and the task is done.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: str("Task id or sourceKey."),
        provider: str("outlook | gmail | ..."),
        kind: str("reply | reply_all | forward | new", { enum: ["reply", "reply_all", "forward", "new"] }),
        subject: str("Draft subject."),
        body: str("Draft body, previewed in the app."),
        externalId: str("The draft's provider id, so the button opens that exact draft."),
        url: str("Direct URL to the draft, if the connector gave you one."),
        desktop: str("Desktop app URL."),
        mobile: str("Mobile app URL."),
      },
    },
    handler: async (args, actor) => {
      const task = await prisma.task.findFirst({
        where: { userId: actor.user.id, OR: [{ id: args?.id }, { sourceKey: args?.id }] },
      });
      if (!task) return toolError("No task matches that id or sourceKey.");

      const provider = normalizeProvider(args?.provider ?? task.sourceProvider);
      const target = deriveLinkTarget({
        provider,
        externalId: args?.externalId,
        kind: "draft",
        web: args?.url ?? args?.web,
        desktop: args?.desktop,
        mobile: args?.mobile,
      });
      if (!hasAnyUrl(target) && !args?.body) {
        return toolError("Give me at least a URL, an externalId, or the draft body — otherwise the button has nowhere to go.");
      }

      const data = {
        provider,
        kind: args?.kind ?? "reply",
        subject: args?.subject ?? null,
        body: args?.body ?? null,
        externalId: args?.externalId ?? null,
        webUrl: target.web ?? null,
        desktopUrl: target.desktop ?? null,
        mobileUrl: target.mobile ?? null,
      };
      await prisma.draft.upsert({ where: { taskId: task.id }, create: { taskId: task.id, ...data }, update: data });
      return dataResult(`Draft attached to "${task.title}".`, { taskId: task.id, label: defaultLabel(provider, "draft") });
    },
  },

  {
    name: "send_notification",
    title: "Send a push notification",
    description:
      "Push a notification to every device the user has signed in on — phone and desktop. Respects their quiet hours unless you mark it urgent. Use sparingly: the daily digest is sent automatically.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: str("Notification title. Keep it short."),
        body: str("One line of detail."),
        taskId: str("Open straight to this task when tapped."),
        urgent: bool("Break through quiet hours. Only for genuinely time-critical things."),
      },
    },
    handler: async (args, actor) => {
      if (!args?.title) return toolError("`title` is required.");
      const res = await sendPushToUser(actor.user.id, {
        title: String(args.title).slice(0, 120),
        body: args?.body ? String(args.body).slice(0, 300) : undefined,
        url: args?.taskId ? `/?task=${encodeURIComponent(args.taskId)}` : "/",
        kind: "agent",
        taskId: args?.taskId ?? undefined,
        urgent: Boolean(args?.urgent),
      });
      if (res.skipped === "not_configured") return toolError("Push is not configured on this server — no VAPID keys set.");
      if (res.skipped === "no_devices") return toolError("The user has not enabled notifications on any device yet.");
      if (res.skipped === "quiet_hours") return dataResult("Held back — the user is in quiet hours.", res);
      return dataResult(`Sent to ${res.sent} device(s).`, res);
    },
  },

  {
    name: "get_stats",
    title: "List summary",
    description: "Counts per bucket, what is overdue, and how the last few runs went.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, actor) => {
      const userId = actor.user.id;
      const [open, overdue, completedToday, runs] = await Promise.all([
        prisma.task.groupBy({ by: ["bucket"], where: { userId, status: "open" }, _count: true }),
        prisma.task.count({ where: { userId, status: "open", dueAt: { lt: new Date() } } }),
        prisma.task.count({ where: { userId, status: "completed", completedAt: { gte: new Date(Date.now() - 864e5) } } }),
        prisma.agentRun.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 5 }),
      ]);

      const byBucket = Object.fromEntries(open.map((r) => [r.bucket, r._count]));
      const total = open.reduce((n, r) => n + r._count, 0);
      return dataResult(`${total} open, ${overdue} overdue, ${completedToday} cleared in the last 24h.`, {
        openByBucket: byBucket,
        totalOpen: total,
        overdue,
        completedLast24h: completedToday,
        recentRuns: runs.map((r) => ({
          at: r.startedAt.toISOString(),
          client: r.client,
          created: r.createdCount,
          updated: r.updatedCount,
          removed: r.removedCount,
          skipped: r.skippedCount,
        })),
      });
    },
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function listToolsPayload() {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
    })),
  };
}

export async function callTool(req: JsonRpcRequest, actor: Actor) {
  const name = req.params?.name;
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return errorResult(`Unknown tool "${name}". Call tools/list to see what is available.`);

  try {
    return await tool.handler(req.params?.arguments ?? {}, actor);
  } catch (err: any) {
    console.error(`[mcp] ${name} failed:`, err);
    return errorResult(`${name} failed: ${err?.message ?? "unexpected error"}`);
  }
}
