import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncTasks } from "@/lib/sync";
import { syncInput, type TaskInputRaw } from "@/lib/validation";
import { completeTask, createUserTask, dismissTask, snoozeTask, undoLastAction, togglePin } from "@/lib/actions";
import { activeSuppressions } from "@/lib/suppression";
import { serializeTask, taskInclude } from "@/lib/tasks";
import { hashPassword } from "@/lib/crypto";

let userId: string;

const sync = (tasks: TaskInputRaw[], overrides: Record<string, unknown> = {}) =>
  syncTasks(userId, syncInput.parse({ tasks, ...overrides }), { source: "api", client: "Claude" });

const bobEmail: TaskInputRaw = {
  title: "Get back to Bob on the proposal",
  bucket: "urgent_important",
  description: "Bob wants the full deck.",
  source: { provider: "outlook", type: "email", externalId: "AAMk-bob-1", from: "Bob <bob@acme.com>" },
};

const newsletter: TaskInputRaw = {
  title: "Newsletter: 12 AI trends",
  bucket: "delete",
  source: { provider: "gmail", type: "email", messageId: "<news@x.com>" },
};

beforeEach(async () => {
  // Cascades take the tasks, links, drafts, suppressions and runs with it.
  await prisma.user.deleteMany({});
  const user = await prisma.user.create({
    data: {
      email: `t${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      passwordHash: await hashPassword("password123"),
      settings: { create: {} },
    },
  });
  userId = user.id;
});

describe("syncTasks", () => {
  it("creates tasks and reports what it did", async () => {
    const r = await sync([bobEmail, newsletter]);
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(0);
    expect(await prisma.task.count({ where: { userId } })).toBe(2);
  });

  it("is idempotent — the same batch twice does not duplicate", async () => {
    await sync([bobEmail]);
    const r = await sync([bobEmail]);
    expect(r.created).toBe(0);
    expect(r.unchanged).toBe(1);
    expect(await prisma.task.count({ where: { userId } })).toBe(1);
  });

  it("notices a real change and counts it as an update", async () => {
    await sync([bobEmail]);
    const r = await sync([{ ...bobEmail, title: "Send Bob the deck today" }]);
    expect(r.updated).toBe(1);
    expect(r.unchanged).toBe(0);
  });

  it("collapses duplicates inside a single batch", async () => {
    const r = await sync([bobEmail, { ...bobEmail, title: "Different wording, same email" }]);
    expect(r.created).toBe(1);
  });

  it("builds an Open in Outlook button from the source alone", async () => {
    await sync([bobEmail]);
    const link = await prisma.taskLink.findFirst({ where: { task: { userId } } });
    expect(link?.label).toBe("Open in Outlook");
    expect(link?.webUrl).toContain("outlook.office.com/mail/deeplink/read/");
    expect(link?.mobileUrl).toContain("ms-outlook://");
    expect(link?.isPrimary).toBe(true);
  });

  it("attaches a draft when the agent wrote one", async () => {
    await sync([{ ...bobEmail, draft: { provider: "outlook", kind: "reply", body: "Hi Bob…", externalId: "d1" } }]);
    const draft = await prisma.draft.findFirst({ where: { task: { userId } } });
    expect(draft?.body).toBe("Hi Bob…");
    expect(draft?.webUrl).toContain("/mail/drafts/id/d1");
  });

  it("does not write anything on a dry run", async () => {
    const r = await sync([bobEmail], { dryRun: true });
    expect(r.created).toBe(1);
    expect(await prisma.task.count({ where: { userId } })).toBe(0);
  });
});

describe("replace-the-window", () => {
  it("clears what the run did not re-send", async () => {
    await sync([bobEmail, newsletter]);
    const r = await sync([bobEmail]);
    expect(r.removed).toBe(1);
    expect(r.removedTasks[0].title).toContain("Newsletter");
    expect(await prisma.task.count({ where: { userId } })).toBe(1);
  });

  it("leaves everything alone when replace is 'none'", async () => {
    await sync([bobEmail, newsletter]);
    const r = await sync([bobEmail], { replace: "none" });
    expect(r.removed).toBe(0);
    expect(await prisma.task.count({ where: { userId } })).toBe(2);
  });

  it("never touches a task you added yourself", async () => {
    await createUserTask(userId, { title: "Mine", bucket: "delegate" });
    await sync([bobEmail]);

    const r = await sync([]);
    // The agent's own task goes; the one you typed in stays.
    expect(r.removed).toBe(1);
    expect(r.removedTasks[0].title).toContain("Bob");
    const survivors = await prisma.task.findMany({ where: { userId } });
    expect(survivors.map((t) => t.title)).toEqual(["Mine"]);
  });

  it("never clears something you pinned", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await togglePin(userId, task.id, true);
    const r = await sync([]);
    expect(r.removed).toBe(0);
    expect(await prisma.task.count({ where: { userId } })).toBe(1);
  });

  it("records what it cleared so the history survives the delete", async () => {
    await sync([bobEmail]);
    await sync([]);
    const events = await prisma.taskEvent.findMany({ where: { userId, type: "removed_by_run" } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload ?? "{}").task.title).toContain("Bob");
  });
});

describe("the feedback loop", () => {
  it("refuses to recreate what you already completed", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);

    const r = await sync([bobEmail], { replace: "none" });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.skippedTasks[0].action).toBe("completed");
    expect(r.skippedTasks[0].reason).toContain("already marked done");
  });

  it("explains itself in the message, not just the payload", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await dismissTask(userId, task.id);
    const r = await sync([bobEmail], { replace: "none" });
    expect(r.message).toContain("already handled");
  });

  it("matches on the message id, not the wording of the title", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);

    // Next run, the agent phrases it completely differently.
    const r = await sync([{ ...bobEmail, title: "Chase the Acme proposal", bucket: "urgent_not_priority" }], {
      replace: "none",
    });
    expect(r.skipped).toBe(1);
  });

  it("lets a snooze expire and the task come back", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await snoozeTask(userId, task.id, new Date(Date.now() + 3600e3));

    let r = await sync([bobEmail], { replace: "none" });
    expect(r.skipped).toBe(1);

    // Wind the snooze back past now, as the clock would.
    await prisma.suppression.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await sync([bobEmail], { replace: "none" });
    expect(r.skipped).toBe(0);
  });

  /**
   * The scenario the whole app exists for: a 30-day window means every sweep
   * sees the same email again, so "I already did this" has to survive being
   * re-read for the rest of the month — without also muting the thread if
   * something genuinely new lands on it.
   */
  it("stays cleared for every sweep in the window, not just the next one", async () => {
    const proposal: TaskInputRaw = {
      title: "Submit the $25k proposal",
      bucket: "urgent_important",
      source: { provider: "gmail", type: "email", externalId: "msg-proposal-1", threadId: "thread-proposal" },
    };

    await sync([proposal]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);

    // Thirty more mornings. The email has not moved; neither has the answer.
    for (let day = 0; day < 30; day += 1) {
      const r = await sync([proposal], { replace: "none" });
      expect(r.created, `day ${day}`).toBe(0);
      expect(r.skipped, `day ${day}`).toBe(1);
    }

    expect(await prisma.task.count({ where: { userId, status: "open" } })).toBe(0);
  });

  it("still lets a genuinely new message on the same thread through", async () => {
    const first: TaskInputRaw = {
      title: "Submit the $25k proposal",
      bucket: "urgent_important",
      source: { provider: "gmail", type: "email", externalId: "msg-proposal-1", threadId: "thread-proposal" },
    };
    await sync([first]);
    await completeTask(userId, (await prisma.task.findFirstOrThrow({ where: { userId } })).id);

    // They wrote back. Different message, so a different key, so it is not the
    // thing that was cleared — suppression is per item, not per conversation.
    const reply: TaskInputRaw = {
      title: "Bob came back on the proposal with questions",
      bucket: "urgent_important",
      source: { provider: "gmail", type: "email", externalId: "msg-proposal-2", threadId: "thread-proposal" },
    };
    const r = await sync([reply], { replace: "none" });
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(0);
  });

  it("tells the agent what it refused and why, so it can stop sending it", async () => {
    const proposal: TaskInputRaw = {
      title: "Submit the $25k proposal",
      bucket: "urgent_important",
      source: { provider: "gmail", type: "email", externalId: "msg-proposal-1" },
    };
    await sync([proposal]);
    await completeTask(userId, (await prisma.task.findFirstOrThrow({ where: { userId } })).id);

    const r = await sync([proposal], { replace: "none" });
    expect(r.skippedTasks[0].title).toBe("Submit the $25k proposal");
    expect(r.skippedTasks[0].sourceKey).toContain("msg-proposal-1");
    expect(r.message).toContain("already handled");
  });

  it("honours force when the user explicitly asks for it back", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);
    const r = await sync([bobEmail], { replace: "none", force: true });
    expect(r.skipped).toBe(0);
  });

  it("clears the suppression when you undo", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);
    expect(await activeSuppressions(userId)).toHaveLength(1);

    const restored = await undoLastAction(userId);
    expect(restored?.status).toBe("open");
    expect(await activeSuppressions(userId)).toHaveLength(0);

    const r = await sync([bobEmail], { replace: "none" });
    expect(r.skipped).toBe(0);
  });

  it("keeps a completed task completed even if the suppression is gone", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);
    await prisma.suppression.deleteMany({ where: { userId } });

    await sync([bobEmail], { replace: "none" });
    const after = await prisma.task.findFirstOrThrow({ where: { id: task.id } });
    expect(after.status).toBe("completed");
  });

  it("writes a run record with the skip detail attached", async () => {
    await sync([bobEmail]);
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });
    await completeTask(userId, task.id);
    await sync([bobEmail], { replace: "none" });

    const run = await prisma.agentRun.findFirstOrThrow({ where: { userId }, orderBy: { startedAt: "desc" } });
    expect(run.skippedCount).toBe(1);
    expect(run.client).toBe("Claude");
    expect(JSON.parse(run.skippedDetail ?? "[]")[0].title).toContain("Bob");
  });
});

describe("rows stored before mail-links.ts existed", () => {
  it("serves legacy bad shapes fixed, with no migration and no fresh sweep", async () => {
    await syncTasks(userId, syncInput.parse({ tasks: [bobEmail] }), { source: "api", client: "Claude" });
    const task = await prisma.task.findFirstOrThrow({ where: { userId } });

    // Plant the two shapes real accounts are still carrying: the raw Graph
    // webLink, and a Gmail link pinned to one browser's account order.
    await prisma.taskLink.createMany({
      data: [
        {
          taskId: task.id,
          kind: "source",
          label: "Legacy Outlook row",
          provider: "outlook",
          webUrl: "https://outlook.office365.com/owa/?ItemID=AAMk%2Ba%2Fb%3D&exvsurl=1&viewmodel=ReadMessageItem",
          position: 8,
        },
        {
          taskId: task.id,
          kind: "source",
          label: "Legacy Gmail row",
          provider: "gmail",
          webUrl: "https://mail.google.com/mail/u/3/#all/18c9f0",
          position: 9,
        },
      ],
    });

    const dto = serializeTask(
      await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude }),
    );

    const outlook = dto.links.find((l) => l.label === "Legacy Outlook row");
    expect(outlook?.web).toBe("https://outlook.office.com/mail/deeplink/read/AAMk-a_b%3D");

    const gmail = dto.links.find((l) => l.label === "Legacy Gmail row");
    expect(gmail?.web).toBe("https://mail.google.com/mail/#all/18c9f0");
  });
});
