import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { syncTasks } from "@/lib/sync";
import { syncInput, type TaskInputRaw } from "@/lib/validation";
import { activeSuppressions } from "@/lib/suppression";
import { handleMessage } from "@/lib/mcp/server";
import {
  clearBucket,
  completeTask,
  delegateTask,
  deleteTask,
  dismissTask,
  reopenTask,
  setBucket,
  snoozeTask,
  togglePin,
  undoLastAction,
} from "@/lib/actions";
import type { Actor } from "@/lib/auth";

/**
 * Tenant isolation.
 *
 * Every one of these asks the same question from a different angle: holding a
 * valid id belonging to someone else, can I read or change their data? The
 * answer has to be no on every path, including the MCP surface — a connection
 * token is handed to a third-party assistant, so it is the likeliest thing to
 * end up somewhere it should not be.
 */

let alice: Actor;
let bob: Actor;
/** The same email in both accounts, to prove keys are scoped per user. */
const SHARED_KEY_TASK: TaskInputRaw = {
  title: "Get back to Bob on the proposal",
  bucket: "urgent_important",
  source: { provider: "outlook", type: "email", externalId: "AAMk-shared-1" },
};

async function makeUser(label: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      passwordHash: await hashPassword("password123"),
      settings: { create: {} },
    },
  });
  return { user, via: "token", scopes: ["tasks:read", "tasks:write", "notify"] };
}

const sync = (actor: Actor, tasks: TaskInputRaw[], overrides: Record<string, unknown> = {}) =>
  syncTasks(actor.user.id, syncInput.parse({ tasks, ...overrides }), { source: "api" });

const mcp = (actor: Actor, name: string, args: Record<string, unknown> = {}) =>
  handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, actor);

const payload = (res: any) => {
  const text: string = res?.result?.content?.[0]?.text ?? "";
  const split = text.indexOf("\n\n");
  return JSON.parse(split === -1 ? text : text.slice(split + 2));
};
const isError = (res: any) => res?.result?.isError === true;

beforeEach(async () => {
  await prisma.user.deleteMany({});
  alice = await makeUser("alice");
  bob = await makeUser("bob");
});

describe("the same source key in two accounts", () => {
  it("does not collide — keys are unique per user, not globally", async () => {
    const a = await sync(alice, [SHARED_KEY_TASK]);
    const b = await sync(bob, [SHARED_KEY_TASK]);

    expect(a.created).toBe(1);
    expect(b.created).toBe(1);
    expect(await prisma.task.count()).toBe(2);
  });

  it("keeps one user's completion out of the other's way", async () => {
    await sync(alice, [SHARED_KEY_TASK]);
    await sync(bob, [SHARED_KEY_TASK]);

    const aliceTask = await prisma.task.findFirstOrThrow({ where: { userId: alice.user.id } });
    await completeTask(alice.user.id, aliceTask.id);

    // Alice handled it. Bob's agent must still be able to raise it for Bob.
    const again = await sync(bob, [SHARED_KEY_TASK], { replace: "none" });
    expect(again.skipped).toBe(0);

    expect(await activeSuppressions(alice.user.id)).toHaveLength(1);
    expect(await activeSuppressions(bob.user.id)).toHaveLength(0);
  });
});

describe("acting on someone else's task id", () => {
  let aliceTaskId: string;

  beforeEach(async () => {
    await sync(alice, [SHARED_KEY_TASK]);
    aliceTaskId = (await prisma.task.findFirstOrThrow({ where: { userId: alice.user.id } })).id;
  });

  it.each([
    ["complete", (id: string) => completeTask(bob.user.id, id)],
    ["reopen", (id: string) => reopenTask(bob.user.id, id)],
    ["dismiss", (id: string) => dismissTask(bob.user.id, id)],
    ["snooze", (id: string) => snoozeTask(bob.user.id, id, new Date(Date.now() + 3600e3))],
    ["delegate", (id: string) => delegateTask(bob.user.id, id, "someone")],
    ["move", (id: string) => setBucket(bob.user.id, id, "delete")],
    ["pin", (id: string) => togglePin(bob.user.id, id, true)],
    ["delete", (id: string) => deleteTask(bob.user.id, id)],
  ])("refuses %s", async (_label, act) => {
    await expect(act(aliceTaskId)).resolves.toBeNull();
  });

  it("leaves the task untouched after every refused attempt", async () => {
    const before = await prisma.task.findUniqueOrThrow({ where: { id: aliceTaskId } });
    await Promise.all([
      completeTask(bob.user.id, aliceTaskId),
      dismissTask(bob.user.id, aliceTaskId),
      deleteTask(bob.user.id, aliceTaskId),
      togglePin(bob.user.id, aliceTaskId, true),
    ]);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: aliceTaskId } });

    expect(after.status).toBe(before.status);
    expect(after.pinned).toBe(before.pinned);
    expect(after.bucket).toBe(before.bucket);
  });

  it("writes no suppression into the attacker's account", async () => {
    await completeTask(bob.user.id, aliceTaskId);
    expect(await activeSuppressions(bob.user.id)).toHaveLength(0);
  });
});

describe("the MCP surface", () => {
  let aliceTaskId: string;

  beforeEach(async () => {
    await sync(alice, [SHARED_KEY_TASK]);
    aliceTaskId = (await prisma.task.findFirstOrThrow({ where: { userId: alice.user.id } })).id;
  });

  it.each(["get_task", "update_task", "complete_task", "delete_task", "reopen_task", "attach_draft"])(
    "refuses %s against another account's task id",
    async (tool) => {
      const res = await mcp(bob, tool, { id: aliceTaskId, title: "hijacked", provider: "gmail", url: "https://x" });
      expect(isError(res)).toBe(true);
    },
  );

  it("refuses snooze_task against another account's task id", async () => {
    const res = await mcp(bob, "snooze_task", { id: aliceTaskId, until: new Date(Date.now() + 3600e3).toISOString() });
    expect(isError(res)).toBe(true);
  });

  it("refuses a lookup by the other account's sourceKey", async () => {
    const res = await mcp(bob, "get_task", { sourceKey: "outlook:email:AAMk-shared-1" });
    expect(isError(res)).toBe(true);
  });

  it("lists only the caller's own tasks", async () => {
    await sync(bob, [{ title: "Bob's own thing", bucket: "delegate" }]);

    const asBob = payload(await mcp(bob, "list_tasks"));
    expect(asBob.tasks).toHaveLength(1);
    expect(asBob.tasks[0].title).toBe("Bob's own thing");

    const asAlice = payload(await mcp(alice, "list_tasks"));
    expect(asAlice.tasks).toHaveLength(1);
    expect(asAlice.tasks[0].title).toContain("Bob on the proposal");
  });

  it("scopes get_run_context to the caller", async () => {
    await completeTask(alice.user.id, aliceTaskId);

    const ctx = payload(await mcp(bob, "get_run_context"));
    expect(ctx.openTasks).toHaveLength(0);
    expect(ctx.alreadyHandled).toHaveLength(0);
    expect(ctx.user.email).toBe(bob.user.email);
  });

  it("scopes get_stats and get_handled_items to the caller", async () => {
    await completeTask(alice.user.id, aliceTaskId);

    expect(payload(await mcp(bob, "get_stats")).totalOpen).toBe(0);
    const handled = payload(await mcp(bob, "get_handled_items", { sourceKeys: ["outlook:email:AAMk-shared-1"] }));
    expect(handled.checked[0].handled).toBe(false);
  });

  it("scopes resources to the caller", async () => {
    const res: any = await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "todo://open" } },
      bob,
    );
    expect(JSON.parse(res.result.contents[0].text)).toHaveLength(0);
  });
});

describe("bulk operations stay inside one account", () => {
  it("a replace-the-window sync never clears another account's list", async () => {
    await sync(alice, [SHARED_KEY_TASK, { title: "Alice second", bucket: "delegate" }]);
    await sync(bob, [{ title: "Bob only", bucket: "delete" }]);

    // Bob's agent sends an empty list — the most destructive call there is.
    const result = await sync(bob, [], { replace: "window" });

    expect(result.removed).toBe(1);
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(2);
    expect(await prisma.task.count({ where: { userId: bob.user.id } })).toBe(0);
  });

  it("clearBucket only clears the caller's bucket", async () => {
    await sync(alice, [{ title: "Alice junk", bucket: "delete" }]);
    await sync(bob, [{ title: "Bob junk", bucket: "delete" }]);

    const cleared = await clearBucket(bob.user.id, "delete");

    expect(cleared).toBe(1);
    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(1);
    expect(await prisma.task.count({ where: { userId: bob.user.id } })).toBe(0);
  });

  it("undo cannot reach into another account's history", async () => {
    await sync(alice, [SHARED_KEY_TASK]);
    const aliceTask = await prisma.task.findFirstOrThrow({ where: { userId: alice.user.id } });
    await completeTask(alice.user.id, aliceTask.id);

    // Bob has done nothing, so there is nothing of his to undo.
    expect(await undoLastAction(bob.user.id)).toBeNull();

    const stillDone = await prisma.task.findUniqueOrThrow({ where: { id: aliceTask.id } });
    expect(stillDone.status).toBe("completed");
  });
});

describe("credentials and devices", () => {
  it("a token resolves to exactly one account", async () => {
    const { issueApiToken } = await import("@/lib/auth");
    const { token } = await issueApiToken(alice.user.id, "Alice's Claude");
    const { sha256 } = await import("@/lib/crypto");

    const record = await prisma.apiToken.findUniqueOrThrow({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    expect(record.user.id).toBe(alice.user.id);
    expect(record.user.id).not.toBe(bob.user.id);
  });

  it("deleting an account takes its data and leaves the other intact", async () => {
    await sync(alice, [SHARED_KEY_TASK]);
    await sync(bob, [{ title: "Bob only", bucket: "delegate" }]);
    const aliceTask = await prisma.task.findFirstOrThrow({ where: { userId: alice.user.id } });
    await completeTask(alice.user.id, aliceTask.id);

    await prisma.user.delete({ where: { id: alice.user.id } });

    expect(await prisma.task.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.suppression.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.agentRun.count({ where: { userId: alice.user.id } })).toBe(0);
    expect(await prisma.task.count({ where: { userId: bob.user.id } })).toBe(1);
  });
});
