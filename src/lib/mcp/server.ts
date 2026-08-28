import { prisma } from "../db";
import { BUCKETS } from "../buckets";
import { getSettings } from "../settings";
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

const INSTRUCTIONS = `ToDo is the user's task inbox. You fill it; they clear it.

On a scheduled run, always start with \`get_run_context\`, then send the whole list in one \`sync_tasks\` call with replace="window".

The single rule that matters: anything in \`alreadyHandled\` has been cleared by the user in the app and must never be raised again. You are looking at a rolling window, so yesterday's unanswered email is still sitting in the mailbox — but if the user marked it done, it is done, whatever the mailbox says.

Every task should carry a \`source\` with the provider's own id and URL, so the app can put a button on the card that opens the exact email, message or meeting. Where you can write the reply, save it to their drafts and pass it in \`draft\` — that turns the task into two taps.`;

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
        return ok(id, {
          protocolVersion: version,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            logging: {},
          },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
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
