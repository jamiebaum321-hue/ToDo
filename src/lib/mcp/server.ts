import { prisma } from "../db";
import { BUCKETS } from "../buckets";
import { getSettings } from "../settings";
import { describeTeamForAgent, listTeam } from "../team";
import { activeSuppressions } from "../suppression";
import { serializeTaskForAgent, taskInclude } from "../tasks";
import type { Actor } from "../auth";
import { callTool, listToolsPayload } from "./tools";
import { getPromptPayload, listPromptsPayload } from "./prompts";
import {
  ERROR_CODES,
  fail,
  isNotification,
  negotiateVersion,
  ok,
  SERVER_INFO,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol";

/**
 * What the connection tells the assistant about itself.
 *
 * These reach the model as the server's own instructions, ahead of whatever the
 * user typed. That matters because the settings in this app are not settings
 * the app can act on — ToDo never reads anybody's mailbox, the assistant does.
 * "Write draft replies" is therefore not a switch the app can honour on its
 * own; it is a standing instruction that has to travel to whoever is holding
 * the connection. Same for the rolling window and the team roster.
 *
 * So the rules are built per user and sent at initialize, which is why a
 * scheduled prompt that says nothing about drafts still produces them.
 *
 * One caveat worth knowing: clients read these once, when the connection is
 * made. Changing a setting will not reach a session that is already open — so
 * `get_run_context` repeats the same rules on every run, and that is the copy
 * to trust.
 */
export async function buildInstructions(actor: Actor): Promise<string> {
  const [settings, team] = await Promise.all([getSettings(actor.user.id), listTeam(actor.user.id)]);

  const rules = [
    `Cover a rolling ${settings.rollingWindowDays}-day window, backwards and forwards, on every run.`,
    settings.requestDrafts
      ? "Where a reply is obvious, WRITE IT as a REPLY DRAFT on the source thread (Gmail: drafts.create with the thread's threadId; Outlook: createReply on the message, then patch the body), then pass it in `draft` — never a standalone draft, and do this whether or not the prompt asked for drafts, they have turned it on here."
      : "Do not write draft replies. The user has turned that off.",
    settings.showReasons
      ? "Give every task a one-line `reason` for the bucket you chose. The user reads them."
      : "A `reason` is optional; the user has hidden them.",
  ];

  return [
    "ToDo is the user's task inbox. You fill it; they clear it.",
    "",
    "On a scheduled run, always start with `get_run_context`, then send the whole list in one `sync_tasks` call with replace=\"window\".",
    "",
    "The single rule that matters: anything in `alreadyHandled` has been cleared by the user in the app and must never be raised again. You are looking at a rolling window, so yesterday's unanswered email is still sitting in the mailbox — but if the user marked it done, it is done, whatever the mailbox says. Raise it again only if something genuinely new has happened on it since: a fresh reply, a moved deadline. A message you already saw is not new evidence.",
    "",
    "## How this user has set it up",
    "",
    "These come from their settings and apply to every run, whatever the prompt says:",
    "",
    ...rules.map((r) => `- ${r}`),
    "",
    describeTeamForAgent(team),
    "",
    "## Links",
    "",
    "Every task should carry a `source` with the provider's own ids and URL, so the app can put a button on the card that opens the exact email, message or meeting. That button is the whole point of the app, and a link that lands on a generic inbox is worse than no link at all. These rules are field-tested — real people tapped real tasks:",
    "",
    "- **Gmail** — `source.threadId` is REQUIRED (every `messages.get` returns one): it is the only id that lands ON the conversation, in the browser and in the Gmail app alike. Also send `source.messageId` (the RFC-822 `Message-ID` header) as the durable fallback, and always `source.account`.",
    "- **Outlook / Graph** — the message's `webLink` in `source.url`, UNTOUCHED — it is the one browser link that opens the thread. The Graph id in `source.externalId`, the mailbox in `source.account`, and default Graph ids only (never `Prefer: IdType=\"ImmutableId\"`; links built from immutable ids do not resolve).",
    "- **Drafts** — a draft must be a REPLY draft created on the source thread (Gmail: `drafts.create` with `message.threadId`; Outlook: `createReply`, then patch the body). The draft buttons open the conversation with the draft sitting in it; a standalone draft shows up nowhere.",
    "- **Calendar invites** — add a `links` entry with kind `calendar` carrying the event's own link (`webLink` on a Graph event, `htmlLink` from Google Calendar), plus the event id and account, so accepting happens in the calendar, not the mailbox.",
    "- **Teams, Slack, Zoom** — the permalink in `source.url`; the app derives the app links from it.",
  ].join("\n");
}

const FALLBACK_INSTRUCTIONS = `ToDo is the user's task inbox. You fill it; they clear it.

On a scheduled run, always start with \`get_run_context\`, then send the whole list in one \`sync_tasks\` call with replace="window".

The single rule that matters: anything in \`alreadyHandled\` has been cleared by the user in the app and must never be raised again. You are looking at a rolling window, so yesterday's unanswered email is still sitting in the mailbox — but if the user marked it done, it is done, whatever the mailbox says.

Every task should carry a \`source\` with the provider's own ids and URL, so the app can put a button on the card that opens the exact email, message or meeting. Where you can write the reply, write it as a REPLY DRAFT on the source thread (Gmail: \`drafts.create\` with \`message.threadId\`; Outlook: \`createReply\`, then patch the body) and pass it in \`draft\` — that turns the task into two taps, and a standalone draft shows up nowhere.

That button is the whole point of the app, and a link that lands on a generic inbox is worse than no link at all, so spend the extra call to get the ids right (these rules are field-tested):

- **Gmail** — \`source.threadId\` is REQUIRED (every \`messages.get\` returns one): the only id that lands ON the conversation, in the browser and in the Gmail app alike. Also send \`source.messageId\` (the RFC-822 \`Message-ID\` header, from \`payload.headers\`) as the durable fallback, and always \`source.account\` — Gmail numbers accounts by browser sign-in order, so without the address the link can open the wrong mailbox.
- **Outlook / Graph** — send the message's \`webLink\` in \`source.url\`, untouched; the message id in \`source.externalId\`; the mailbox in \`source.account\`. Default Graph ids only — never \`Prefer: IdType="ImmutableId"\`; links built from immutable ids do not resolve.
- **Calendar invites** — add a \`links\` entry with kind \`calendar\` carrying the event's own link (\`webLink\` on a Graph event, \`htmlLink\` from Google Calendar), so accepting happens in the calendar, not the mailbox.
- **Teams, Slack, Zoom** — send the permalink in \`source.url\`; the app derives the desktop and mobile app links from it.

If a connector hands you a canonical URL, pass it in \`source.url\` — a real permalink always beats one the app has to reconstruct.`;

const RESOURCES = [
  {
    uri: "todo://buckets",
    name: "buckets",
    title: "The four buckets",
    description: "What each bucket means and when to use it.",
    mimeType: "application/json",
  },
  {
    uri: "todo://open",
    name: "open-tasks",
    title: "Open tasks",
    description: "Everything currently on the user's list.",
    mimeType: "application/json",
  },
  {
    uri: "todo://handled",
    name: "handled",
    title: "Already handled",
    description: "Items the user has cleared. Never recreate these.",
    mimeType: "application/json",
  },
  {
    uri: "todo://settings",
    name: "settings",
    title: "Preferences",
    description: "Rolling window, digest time, whether the user wants drafts written.",
    mimeType: "application/json",
  },
];

async function readResource(uri: string, actor: Actor) {
  const userId = actor.user.id;
  const json = (data: unknown) => ({
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
  });

  switch (uri) {
    case "todo://buckets":
      return json(BUCKETS.map((b) => ({ key: b.key, label: b.label, meaning: b.blurb })));
    case "todo://open": {
      const tasks = await prisma.task.findMany({
        where: { userId, status: "open" },
        include: taskInclude,
        orderBy: [{ pinned: "desc" }, { dueAt: "asc" }],
        take: 200,
      });
      return json(tasks.map(serializeTaskForAgent));
    }
    case "todo://handled": {
      const rows = await activeSuppressions(userId, { limit: 500 });
      return json(
        rows.map((r) => ({
          sourceKey: r.sourceKey,
          title: r.taskTitle,
          action: r.action,
          handledAt: r.updatedAt.toISOString(),
        })),
      );
    }
    case "todo://settings": {
      const s = await getSettings(userId);
      return json({
        timezone: actor.user.timezone,
        rollingWindowDays: s.rollingWindowDays,
        digestTime: s.digestTime,
        writeDrafts: s.requestDrafts,
        quietHours: s.quietHoursEnabled ? { from: s.quietHoursStart, to: s.quietHoursEnd } : null,
      });
    }
    default:
      return null;
  }
}

/**
 * Handle one JSON-RPC message. Returns null for notifications, which by spec
 * get no response body at all.
 */
export async function handleRpc(req: JsonRpcRequest, actor: Actor): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const notification = isNotification(req);

  try {
    switch (req.method) {
      case "initialize": {
        const version = negotiateVersion(req.params?.protocolVersion);
        // A failure here must not cost the user their connection, so the
        // static text stands in if the settings lookup falls over.
        const instructions = await buildInstructions(actor).catch(() => FALLBACK_INSTRUCTIONS);
        return ok(id, {
          protocolVersion: version,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            logging: {},
          },
          serverInfo: SERVER_INFO,
          instructions,
        });
      }

      // Client-side notifications. Acknowledged by saying nothing.
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
      case "notifications/roots/list_changed":
        return null;

      case "ping":
        return ok(id, {});

      case "logging/setLevel":
        return ok(id, {});

      case "tools/list":
        return ok(id, listToolsPayload());

      case "tools/call": {
        const result = await callTool(req, actor);
        return ok(id, result);
      }

      case "prompts/list":
        return ok(id, listPromptsPayload());

      case "prompts/get": {
        const payload = getPromptPayload(req.params?.name, req.params?.arguments ?? {});
        if (!payload) return fail(id, ERROR_CODES.INVALID_PARAMS, `Unknown prompt "${req.params?.name}".`);
        return ok(id, payload);
      }

      case "resources/list":
        return ok(id, { resources: RESOURCES });

      case "resources/templates/list":
        return ok(id, { resourceTemplates: [] });

      case "resources/read": {
        const uri = req.params?.uri;
        const contents = await readResource(uri, actor);
        if (!contents) return fail(id, ERROR_CODES.INVALID_PARAMS, `Unknown resource "${uri}".`);
        return ok(id, contents);
      }

      case "completion/complete":
        return ok(id, { completion: { values: [], total: 0, hasMore: false } });

      default:
        if (notification) return null;
        return fail(id, ERROR_CODES.METHOD_NOT_FOUND, `Method "${req.method}" is not supported.`);
    }
  } catch (err: any) {
    console.error("[mcp] handler error:", err);
    if (notification) return null;
    return fail(id, ERROR_CODES.INTERNAL_ERROR, err?.message ?? "Internal error");
  }
}

/** A batch is just an array of messages; responses to notifications drop out. */
export async function handleMessage(
  body: unknown,
  actor: Actor,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    const responses: JsonRpcResponse[] = [];
    for (const item of body) {
      const res = await handleRpc(item as JsonRpcRequest, actor);
      if (res) responses.push(res);
    }
    return responses.length ? responses : null;
  }

  const req = body as JsonRpcRequest;
  if (!req || typeof req !== "object" || typeof req.method !== "string") {
    return fail(null, ERROR_CODES.INVALID_REQUEST, "Expected a JSON-RPC 2.0 message with a `method`.");
  }
  return handleRpc(req, actor);
}
