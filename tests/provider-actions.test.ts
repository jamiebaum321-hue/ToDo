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
  it("keeps a related Gmail conversation distinct from the source", async () => {
    await sync({ links: [{ kind: "custom", provider: "gmail", threadId: "t-related", account: "other@example.com" }] });
    const task = await stored();
    for (const dto of [serializeTask(task), serializeTaskForAgent(task)]) {
      const related = dto.links.find(l => l.kind === "custom")!;
      expect(related.web).toContain("authuser=other%40example.com#all/t-related");
      expect(related.mobile).toBe("googlegmail:///cv=t-related");
    }
  });
  it("keeps a saved delegation draft on its own conversation", async () => {
    await sync({ delegateTo: "Topaz", draft: { ...saved, kind: "new", to: "topaz@example.com", threadId: "t-handoff" } });
    const task = await stored();
    const dto = serializeTask(task);
    expect(dto.draft).toMatchObject({ ready: true, to: "topaz@example.com", mobile: "googlegmail:///cv=t-handoff" });
    expect(dto.draft?.web).toContain("#all/t-handoff");
    expect(serializeTaskForAgent(task).draft).toMatchObject({ externalId: "draft-1", threadId: "t-handoff" });
  });
  it("keeps Teams app permalinks through the entire write/read path on desktop and phone", async () => {
    await sync({ source: { provider: "teams", externalId: "1699", url: "https://teams.microsoft.com/l/message/19:chat@thread.v2/1699?tenantId=tenant-1" } });
    const dto = serializeTask(await stored());
    for (const platform of ["windows", "macos", "ios", "android"] as const) {
      expect(chooseUrl(dto.links[0], platform)).toBe("msteams:/l/message/19:chat@thread.v2/1699?tenantId=tenant-1");
      expect(chooseUrl(dto.links[0], platform, "web")).toContain("https://teams.microsoft.com/l/message/");
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
