import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { handleMessage } from "@/lib/mcp/server";
import { LATEST_PROTOCOL_VERSION, negotiateVersion } from "@/lib/mcp/protocol";
import { hashPassword } from "@/lib/crypto";
import { completeTask } from "@/lib/actions";
import type { Actor } from "@/lib/auth";

let actor: Actor;

/** Tools answer with a summary line, a blank line, then the JSON payload. */
function toolPayload(result: any) {
  const text: string = result?.result?.content?.[0]?.text ?? "";
  const split = text.indexOf("\n\n");
  return JSON.parse(split === -1 ? text : text.slice(split + 2));
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, actor);

beforeEach(async () => {
  await prisma.user.deleteMany({});
  const user = await prisma.user.create({
    data: {
      email: `m${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      passwordHash: await hashPassword("password123"),
      timezone: "America/New_York",
      settings: { create: {} },
    },
  });
  actor = { user, via: "token", scopes: ["tasks:read", "tasks:write", "notify"] };
});

describe("protocol", () => {
  it("negotiates a version the client asked for, or the latest", () => {
    expect(negotiateVersion("2024-11-05")).toBe("2024-11-05");
    expect(negotiateVersion("1999-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("answers initialize with server info and instructions", async () => {
    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      actor,
    );
    expect(res.result.serverInfo.name).toBe("todo");
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.instructions).toContain("alreadyHandled");
  });

  it("returns nothing for a notification, as the spec requires", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, actor)).toBeNull();
  });

  it("reports an unknown method as a JSON-RPC error", async () => {
    const res: any = await handleMessage({ jsonrpc: "2.0", id: 3, method: "nope/nope" }, actor);
    expect(res.error.code).toBe(-32601);
  });

  it("handles a batch and drops the notification's slot", async () => {
    const res: any = await handleMessage(
      [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ],
      actor,
    );
    expect(res).toHaveLength(2);
    expect(res[0].id).toBe(1);
    expect(res[1].id).toBe(2);
  });

  it("rejects a message with no method", async () => {
    const res: any = await handleMessage({ jsonrpc: "2.0", id: 1 }, actor);
    expect(res.error.code).toBe(-32600);
  });
});

describe("tools", () => {
  it("advertises every tool with a schema", async () => {
    const res: any = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, actor);
    const tools = res.result.tools;
    expect(tools.length).toBeGreaterThanOrEqual(12);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(30);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("marks the read-only tools as read-only", async () => {
    const res: any = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, actor);
    const ctx = res.result.tools.find((t: any) => t.name === "get_run_context");
    expect(ctx.annotations.readOnlyHint).toBe(true);
    const sync = res.result.tools.find((t: any) => t.name === "sync_tasks");
    expect(sync.annotations.destructiveHint).toBe(true);
  });

  it("gives the agent a full run context", async () => {
    const res = await call("get_run_context");
    const ctx = toolPayload(res);
    expect(ctx.timezone).toBe("America/New_York");
    expect(ctx.buckets).toHaveLength(4);
    expect(ctx.window.days).toBe(14);
    expect(ctx.alreadyHandled).toEqual([]);
    expect(ctx.guidance).toContain("sync_tasks");
  });

  it("round-trips a sync and reads it back", async () => {
    await call("sync_tasks", {
      client: "Claude",
      tasks: [
        {
          title: "Reply to Bob",
          bucket: "urgent_important",
          source: { provider: "outlook", type: "email", externalId: "bob-1" },
        },
      ],
    });
    const list = toolPayload(await call("list_tasks"));
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].links[0].web).toContain("outlook.office365.com/owa/?ItemID=");
  });

  it("tells the agent exactly why it refused a task", async () => {
    await call("sync_tasks", {
      tasks: [{ title: "Reply to Bob", bucket: "urgent_important", source: { provider: "outlook", externalId: "bob-1" } }],
    });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });
    await completeTask(actor.user.id, task.id);

    const res = await call("sync_tasks", {
      replace: "none",
      tasks: [{ title: "Reply to Bob", bucket: "urgent_important", source: { provider: "outlook", externalId: "bob-1" } }],
    });
    const payload = toolPayload(res);
    expect(payload.skipped).toBe(1);
    expect((res as any).result.content[0].text).toContain("do not send those again");
  });

  it("attaches a draft and points it at the source thread", async () => {
    await call("create_task", {
      title: "Reply to Marta",
      bucket: "urgent_not_priority",
      source: { provider: "gmail", externalId: "marta-1", threadId: "t-marta", account: "j@w.com" },
    });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });

    await call("attach_draft", { id: task.id, provider: "gmail", externalId: "draft-9", body: "Hi Marta…" });
    const draft = await prisma.draft.findFirstOrThrow({ where: { taskId: task.id } });
    expect(draft.body).toBe("Hi Marta…");
    // A reply draft lives inside its conversation, so the button opens the
    // thread — web and app alike. The old `#drafts?compose=<draft id>` link
    // field-tested as opening an empty compose window.
    expect(draft.webUrl).toContain("#all/t-marta");
    expect(draft.mobileUrl).toBe("googlegmail:///cv=t-marta");
  });

  it("falls back to the drafts folder when the task has no thread id", async () => {
    await call("create_task", {
      title: "Reply to nobody in particular",
      bucket: "urgent_not_priority",
      source: { provider: "gmail", externalId: "loose-1" },
    });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id, sourceExternalId: "loose-1" } });

    await call("attach_draft", { id: task.id, provider: "gmail", externalId: "draft-2", body: "Hello…" });
    const draft = await prisma.draft.findFirstOrThrow({ where: { taskId: task.id } });
    expect(draft.webUrl).toContain("#drafts");
    expect(draft.webUrl).not.toContain("compose=");
  });

  it("refuses a draft with nowhere to point", async () => {
    await call("create_task", { title: "Something", bucket: "delete" });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });
    const res: any = await call("attach_draft", { id: task.id, provider: "gmail" });
    expect(res.result.isError).toBe(true);
  });

  it("refuses create_task for something you already cleared", async () => {
    await call("create_task", { title: "Newsletter", bucket: "delete", source: { provider: "gmail", externalId: "n-1" } });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });
    await completeTask(actor.user.id, task.id);

    const res: any = await call("create_task", {
      title: "Newsletter",
      bucket: "delete",
      source: { provider: "gmail", externalId: "n-1" },
    });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Not created");
  });

  it("looks up a task by sourceKey as well as id", async () => {
    await call("create_task", { title: "Find me", bucket: "delegate", source: { provider: "gmail", externalId: "f-1" } });
    const found = toolPayload(await call("get_task", { sourceKey: "gmail:item:f-1" }));
    expect(found.title).toBe("Find me");
  });

  it("reports a missing task instead of throwing", async () => {
    const res: any = await call("get_task", { id: "does-not-exist" });
    expect(res.result.isError).toBe(true);
  });

  it("checks a list of source keys in one call", async () => {
    await call("create_task", { title: "A", bucket: "delete", source: { provider: "gmail", externalId: "a" } });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });
    await completeTask(actor.user.id, task.id);

    const payload = toolPayload(await call("get_handled_items", { sourceKeys: ["gmail:item:a", "gmail:item:b"] }));
    expect(payload.checked[0].handled).toBe(true);
    expect(payload.checked[1].handled).toBe(false);
  });
});

describe("prompts and resources", () => {
  it("renders the daily triage prompt with the window baked in", async () => {
    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "prompts/get", params: { name: "daily_triage", arguments: { windowDays: "30" } } },
      actor,
    );
    const text = res.result.messages[0].content.text;
    expect(text).toContain("last and next 30 days");
    expect(text).toContain("alreadyHandled");
    expect(text).toContain("replace");
  });

  it("errors on an unknown prompt", async () => {
    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "prompts/get", params: { name: "nope" } },
      actor,
    );
    expect(res.error.code).toBe(-32602);
  });

  it("serves the handled-items resource", async () => {
    await call("create_task", { title: "X", bucket: "delete", source: { provider: "gmail", externalId: "x" } });
    const task = await prisma.task.findFirstOrThrow({ where: { userId: actor.user.id } });
    await completeTask(actor.user.id, task.id);

    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "todo://handled" } },
      actor,
    );
    expect(JSON.parse(res.result.contents[0].text)).toHaveLength(1);
  });

  it("errors on an unknown resource", async () => {
    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "todo://nope" } },
      actor,
    );
    expect(res.error.code).toBe(-32602);
  });
});
