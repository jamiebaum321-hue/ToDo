import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { describeTeamForAgent, listTeam, normalizeFunction, normalizeLevel } from "@/lib/team";
import { buildInstructions } from "@/lib/mcp/server";
import type { Actor } from "@/lib/auth";

let userId: string;
let actor: Actor;

beforeEach(async () => {
  await prisma.user.deleteMany({});
  const user = await prisma.user.create({
    data: {
      email: `t${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      passwordHash: await hashPassword("password123"),
      settings: { create: {} },
    },
  });
  userId = user.id;
  actor = { user, tokenId: null, scopes: ["tasks:read", "tasks:write", "notify"] } as unknown as Actor;
});

const add = (name: string, fn: string, level: string, note?: string) =>
  prisma.teamMember.create({ data: { userId, name, function: fn, level, note: note ?? null } });

describe("the team roster", () => {
  it("falls back rather than rejecting a function it does not know", () => {
    expect(normalizeFunction("marketing")).toBe("marketing");
    expect(normalizeFunction("MARKETING")).toBe("marketing");
    expect(normalizeFunction("underwater basket weaving")).toBe("other");
    expect(normalizeLevel("executive")).toBe("executive");
    expect(normalizeLevel(undefined)).toBe("member");
  });

  it("tells the agent to leave the delegate bucket alone when nobody is listed", () => {
    const text = describeTeamForAgent([]);
    expect(text).toContain("has not listed a team");
    expect(text).toContain("delegate");
  });

  it("gives each person a function and how much they can decide", async () => {
    await add("Julie Alvarez", "marketing", "manager", "Runs Larchmont");
    await add("Sam Whitfield", "finance", "member");

    const text = describeTeamForAgent(await listTeam(userId));
    expect(text).toContain("Julie Alvarez");
    expect(text).toContain("Marketing");
    expect(text).toContain("Manager");
    expect(text).toContain("Runs Larchmont");
    // A member takes tasks, a manager can be handed the problem itself.
    expect(text).toContain("do not hand over decisions");
    expect(text).toContain("Can be given a problem rather than a task");
  });

  it("keeps one account's team out of another's", async () => {
    await add("Julie Alvarez", "marketing", "manager");
    const other = await prisma.user.create({
      data: { email: `o${Date.now()}@example.com`, passwordHash: await hashPassword("password123") },
    });
    expect(await listTeam(other.id)).toHaveLength(0);
  });
});

describe("what the connection tells the assistant", () => {
  it("carries the settings that only the assistant can act on", async () => {
    const text = await buildInstructions(actor);
    // The app never reads a mailbox, so "write drafts" is only ever an
    // instruction to whoever holds the connection.
    expect(text).toContain("WRITE IT");
    expect(text).toContain("whether or not the prompt asked for drafts");
    expect(text).toContain("14-day window");
  });

  it("says the opposite when the user turns drafts off", async () => {
    await prisma.settings.update({ where: { userId }, data: { requestDrafts: false } });
    const text = await buildInstructions(actor);
    expect(text).toContain("Do not write draft replies");
    expect(text).not.toContain("WRITE IT");
  });

  it("follows the rolling window the user picked", async () => {
    await prisma.settings.update({ where: { userId }, data: { rollingWindowDays: 30 } });
    expect(await buildInstructions(actor)).toContain("30-day window");
  });

  it("names the team so the delegate bucket can mean something", async () => {
    await add("Julie Alvarez", "marketing", "manager");
    const text = await buildInstructions(actor);
    expect(text).toContain("Julie Alvarez");
    expect(text).toContain("delegateTo");
  });

  it("still states the rule that stops handled work coming back", async () => {
    const text = await buildInstructions(actor);
    expect(text).toContain("alreadyHandled");
    expect(text).toContain("not new evidence");
  });

  it("keeps telling agents how to build a link that resolves", async () => {
    const text = await buildInstructions(actor);
    expect(text).toContain("Message-ID");
    expect(text).toContain("threadId");
  });
});
