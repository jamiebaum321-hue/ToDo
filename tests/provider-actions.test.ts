import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncTasks } from "@/lib/sync";
import { syncInput } from "@/lib/validation";
import { serializeTask, serializeTaskForAgent, taskInclude } from "@/lib/tasks";
import { chooseUrl } from "@/lib/deeplinks";

let userId: string;
beforeEach(async () => {
  await prisma.user.deleteMany({});
  const user = await prisma.user.create({ data: { email: "actions@example.com", passwordHash: "test-only", settings: { create: {} } } });
  userId = user.id;
});
const source = { provider: "gmail", type: "email", externalId: "m-original", threadId: "t-original", account: "owner@example.com" };
const saved = { externalId: "draft-1", verifiedAt: new Date().toISOString(), threadId: "t-original", account: "owner@example.com", body: "Reviewed response" };
const sync = (task: Record<string, unknown>) => syncTasks(userId, syncInput.parse({ replace: "none", tasks: [{ title: "Reply to vendor", bucket: "urgent_important", source, ...task }] }));
const stored = () => prisma.task.findFirstOrThrow({ where: { userId }, include: taskInclude });

describe("provider actions through sync, storage and serialization", () => {
  it("adds Apple Mail as a source-only option without changing Gmail or its saved delegation draft", async () => {
    await sync({ source: { ...source, messageId: "<original@example.com>" }, draft: { ...saved, kind: "new", to: "topaz@example.com", threadId: "handoff-thread" } });
    const task = await stored();
    const before = structuredClone(task);
    const dto = serializeTask(task);
    expect(dto.source.appleMailUrl).toBe("message://%3Coriginal%40example.com%3E");
    expect(dto.links[0].mobile).toContain("#cv/All%20Mail/t-original");
    expect(dto.draft).toMatchObject({ ready: true, body: saved.body, to: "topaz@example.com" });
    expect(dto.draft?.mobile).toContain("#cv/All%20Mail/handoff-thread");
    expect(dto.draft).not.toHaveProperty("appleMailUrl");
    expect(dto.status).toBe("open");
    expect(task).toEqual(before);
    expect(await stored()).toEqual(task);
  });
  it("does not invent an Apple Mail identifier from a Gmail thread or another provider", async () => {
    await sync({ draft: saved });
    const task = await stored();
    expect(serializeTask(task).source.appleMailUrl).toBeNull();
    expect(serializeTask({ ...task, sourceMessageId: "not-an-rfc-message-id" }).source.appleMailUrl).toBeNull();
    expect(serializeTask({ ...task, sourceProvider: "outlook", sourceMessageId: "<outlook@example.com>" }).source.appleMailUrl).toBeNull();
  });

  it.each(["googlegmail:///cv=t-original", "googlegmail:///cv=wrong", "https://mail.google.com/mail/#inbox"])("repairs a legacy Gmail handoff %s without changing its saved draft or task", async (legacy) => {
    await sync({ draft: { ...saved, to: "vendor@example.com", subject: "Re: Proposal" } });
    const task = await stored();
    const legacyTask = { ...task,
      links: task.links.map(link => ({ ...link, mobileUrl: legacy })),
      draft: { ...task.draft!, mobileUrl: legacy },
    };
    const before = structuredClone(legacyTask);
    const dto = serializeTask(legacyTask);
    const mobile = "https://mail.google.com/mail/mu/?authuser=owner%40example.com#cv/All%20Mail/t-original";
    expect(dto.links.find(link => link.kind === "source")?.mobile).toBe(mobile);
    expect(dto.draft).toMatchObject({ ready: true, mobile, body: saved.body, to: "vendor@example.com", subject: "Re: Proposal" });
    for (const preference of ["auto", "app", "web"] as const) {
      expect(chooseUrl(dto.draft!, "ios", preference)).toBe(mobile);
    }
    expect(dto.status).toBe("open");
    expect(legacyTask).toEqual(before);
    expect(await stored()).toEqual(task);
  });

  it("keeps a related Gmail conversation distinct from the source", async () => {
    await sync({ links: [{ kind: "custom", provider: "gmail", threadId: "t-related", account: "other@example.com" }] });
    const task = await stored();
    for (const dto of [serializeTask(task), serializeTaskForAgent(task)]) {
      const related = dto.links.find(l => l.kind === "custom")!;
      expect(related.web).toContain("authuser=other%40example.com#all/t-related");
      expect(related.mobile).toBe("https://mail.google.com/mail/mu/?authuser=other%40example.com#cv/All%20Mail/t-related");
    }
  });
  it("keeps a saved delegation draft on its own conversation", async () => {
    await sync({ delegateTo: "Topaz", draft: { ...saved, kind: "new", to: "topaz@example.com", threadId: "t-handoff" } });
    const task = await stored();
    const dto = serializeTask(task);
    expect(dto.draft).toMatchObject({ ready: true, to: "topaz@example.com", mobile: "https://mail.google.com/mail/mu/?authuser=owner%40example.com#cv/All%20Mail/t-handoff" });
    expect(dto.draft?.web).toContain("#all/t-handoff");
    expect(serializeTaskForAgent(task).draft).toMatchObject({ externalId: "draft-1", threadId: "t-handoff" });
  });
  it("persists a reopened Gmail reply receipt without an API id and preserves it through an incomplete sync", async () => {
    const result = await sync({ draft: { ...saved, externalId: undefined, verificationMethod: "mailbox_ui", to: "vendor@example.com", subject: "Re: Proposal" } });
    expect(result.linkGaps).toHaveLength(0);
    const task = await stored();
    expect(task.draft).toMatchObject({ verificationMethod: "mailbox_ui", externalId: null, body: "Reviewed response" });
    expect(serializeTask(task).draft).toMatchObject({ ready: true, web: "https://mail.google.com/mail/?authuser=owner%40example.com#all/t-original" });
    const agent = serializeTaskForAgent(task);
    expect(agent.hasDraft).toBe(true);
    expect(agent.draft).toMatchObject({ verificationMethod: "mailbox_ui", externalId: null, threadId: "t-original", to: "vendor@example.com" });
    expect(agent.draft?.guidance).toContain("API draft id is unknown");
    await sync({ draft: { body: "Unverified replacement" } });
    expect(serializeTask(await stored()).draft).toMatchObject({ ready: true, body: "Reviewed response" });
    expect(serializeTask({ ...task, sourceAccount: "other@example.com" }).draft?.ready).toBe(false);
    expect(serializeTask({ ...task, sourceThreadId: "other-thread" }).draft?.ready).toBe(false);
    expect(serializeTask({ ...task, sourceAccount: null }).draft?.ready).toBe(false);
    for (const missing of ["to", "subject", "body", "verifiedAt"] as const) {
      expect(serializeTask({ ...task, draft: { ...task.draft!, [missing]: null } }).draft?.ready).toBe(false);
    }
  });
  it("returns repair-relevant metadata so an agent can preserve task estimates and source context", async () => {
    await sync({ confidence: 0.8, estimateMinutes: 20, position: 7, source: { ...source, snippet: "Original request context" } });
    const agent = serializeTaskForAgent(await stored());
    expect(agent).toMatchObject({ confidence: 0.8, estimateMinutes: 20, position: 7, source: { snippet: "Original request context" } });
    await sync({ confidence: agent.confidence, estimateMinutes: agent.estimateMinutes, position: agent.position, source: { ...source, snippet: agent.source.snippet } });
    expect(await stored()).toMatchObject({ confidence: 0.8, estimateMinutes: 20, position: 7, sourceSnippet: "Original request context" });
  });
  it.each(["teams.microsoft.com", "teams.cloud.microsoft"])("keeps %s message permalinks through write/read on desktop and phone", async (host) => {
    const web = `https://${host}/l/message/19:chat@thread.v2/1699?context=%7B%22contextType%22%3A%22chat%22%7D&tenantId=tenant-1`;
    await sync({ source: { provider: "teams", externalId: "1699", url: web } });
    const dto = serializeTask(await stored());
    for (const platform of ["windows", "macos", "ios", "android"] as const) {
      expect(chooseUrl(dto.links[0], platform)).toBe("msteams:/l/message/19:chat@thread.v2/1699?context=%7B%22contextType%22%3A%22chat%22%7D&tenantId=tenant-1");
      expect(chooseUrl(dto.links[0], platform, "web")).toBe(web);
    }
  });
  it("keeps the invite email, calendar event and Teams join as separate actions", async () => {
    await sync({ source: { provider: "outlook", type: "email", externalId: "invite-id" }, links: [
      { kind: "calendar", provider: "outlook", externalId: "event-id", url: "https://outlook.office.com/owa/?itemid=event-id&path=%2Fcalendar%2Fitem" },
      { kind: "join", provider: "teams", url: "https://teams.microsoft.com/l/meetup-join/meeting-context" },
    ] });
    const dto = serializeTask(await stored());
    expect(dto.links.find(l => l.kind === "source")?.mobile).toBe("ms-outlook://emails/message?restId=invite-id");
    const calendar = dto.links.find(l => l.kind === "calendar")!;
    expect(calendar.provider).toBe("outlook_calendar");
    expect(calendar.mobile).toBe(calendar.web);
    expect(calendar.mobile).toContain("calendar");
    expect(dto.links.find(l => l.kind === "join")?.desktop).toContain("msteams:/l/meetup-join/");
  });
  it("preserves known Gmail ids and a saved draft through an incomplete follow-up payload", async () => {
    await sync({ draft: saved });
    await sync({ source: { provider: "gmail", type: "email", externalId: "m-original" }, draft: { body: "Unverified replacement" } });
    const dto = serializeTask(await stored());
    expect(dto.links[0].web).toContain("authuser=owner%40example.com#all/t-original");
    expect(dto.draft).toMatchObject({ ready: true, body: "Reviewed response" });
  });
  it("stores missing capability as a repair gap and never presents it as a saved draft", async () => {
    const result = await sync({ draft: { body: "Suggested response only" } });
    expect(result.linkGaps.some(g => g.missing.includes("verifiedAt"))).toBe(true);
    const dto = serializeTask(await stored());
    expect(dto.draft).toMatchObject({ ready: false, web: null, mobile: null });
    expect(dto.actionIssues.join(" ")).toContain("not been verified");
    expect(serializeTaskForAgent(await stored()).hasDraft).toBe(false);
  });
  it("preserves Outlook source identity and extra actions when a repair omits them", async () => {
    const url = "https://outlook.live.com/owa/?ItemID=source&exvsurl=1&viewmodel=ReadMessageItem";
    await sync({ sourceKey: "repair-me", source: { provider: "outlook", externalId: "source", account: "owner@example.com", url },
      links: [{ kind: "calendar", provider: "outlook_calendar", url: "https://outlook.live.com/owa/?ItemID=event&path=/calendar/item" }],
      draft: { externalId: "draft", replyToId: "source", verifiedAt: new Date(), account: "owner@example.com" },
    });
    await sync({ sourceKey: "repair-me", source: undefined });
    const task = await stored();
    expect(task.sourceExternalId).toBe("source");
    expect(serializeTask(task).draft?.ready).toBe(true);
    expect(serializeTask(task).links.find(l => l.kind === "source")?.web).toBe(url);
    expect(serializeTask(task).links.find(l => l.kind === "calendar")?.web).toContain("ItemID=event");
    await sync({ sourceKey: "repair-me", source: undefined, links: [] });
    expect(serializeTask(await stored()).links.some(l => l.kind === "calendar")).toBe(false);
  });
  it("does not borrow source identity for a link belonging to another provider", async () => {
    await sync({ source: { provider: "outlook", externalId: "mail-original", account: "work@example.com" }, links: [
      { kind: "source", provider: "gmail", externalId: "other-message", threadId: "other-thread", account: "personal@example.com" },
    ] });
    const task = await stored();
    for (const dto of [serializeTask(task), serializeTaskForAgent(task)]) {
      const gmail = dto.links.find(l => l.provider === "gmail")!;
      expect(gmail.web).toContain("authuser=personal%40example.com#all/other-thread");
    }
  });
  it("clears an old delegation reference when the task's source changes", async () => {
    await sync({ sourceKey: "changing-source", draft: { ...saved, kind: "new", to: "topaz@example.com", threadId: "handoff" } });
    await sync({ sourceKey: "changing-source", source: { ...source, account: "different@example.com", externalId: "different-message", threadId: "different-thread" } });
    expect(serializeTask(await stored()).draft).toBeNull();
  });
});
