import { describe, expect, it } from "vitest";
import { deriveSourceKey, syncInput, taskInput } from "@/lib/validation";

const base = { title: "Get back to Bob", bucket: "urgent_important" };

describe("deriveSourceKey", () => {
  it("uses provider and external id — the identity that survives a re-run", () => {
    const key = deriveSourceKey(taskInput.parse({ ...base, source: { provider: "outlook", type: "email", externalId: "AAMk123" } }));
    expect(key).toBe("outlook:email:AAMk123");
  });

  it("falls back to the RFC-822 message id", () => {
    const key = deriveSourceKey(taskInput.parse({ ...base, source: { provider: "gmail", messageId: "<x@y.com>" } }));
    expect(key).toBe("gmail:msgid:x@y.com");
  });

  it("hashes the title when there is no id, so re-runs still dedupe", () => {
    const a = deriveSourceKey(taskInput.parse(base));
    const b = deriveSourceKey(taskInput.parse({ ...base, title: "  get back to BOB  " }));
    expect(a).toMatch(/^agent:title:[0-9a-f]{16}$/);
    expect(a).toBe(b);
  });

  it("gives different titles different keys", () => {
    const a = deriveSourceKey(taskInput.parse(base));
    const b = deriveSourceKey(taskInput.parse({ ...base, title: "Something else entirely" }));
    expect(a).not.toBe(b);
  });

  it("respects an explicit key over anything derived", () => {
    const key = deriveSourceKey(taskInput.parse({ ...base, sourceKey: "mine", source: { provider: "outlook", externalId: "x" } }));
    expect(key).toBe("mine");
  });
});

describe("taskInput", () => {
  it("rejects an empty title", () => {
    expect(taskInput.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  it("accepts ISO strings, epoch millis and Dates for dueAt", () => {
    expect(taskInput.parse({ ...base, dueAt: "2026-01-01T09:00:00Z" }).dueAt).toBeInstanceOf(Date);
    expect(taskInput.parse({ ...base, dueAt: 1767258000000 }).dueAt).toBeInstanceOf(Date);
    expect(taskInput.parse({ ...base, dueAt: new Date() }).dueAt).toBeInstanceOf(Date);
  });

  it("rejects a date it cannot read rather than storing garbage", () => {
    expect(taskInput.safeParse({ ...base, dueAt: "next Tuesdayish" }).success).toBe(false);
  });

  it("treats `url` as an alias of `web` on a link", () => {
    const parsed = taskInput.parse({ ...base, links: [{ kind: "join", url: "https://zoom.us/j/1" }] });
    expect(parsed.links?.[0].web).toBe("https://zoom.us/j/1");
  });
});

describe("syncInput", () => {
  it("replaces the window by default — that is the daily-run contract", () => {
    expect(syncInput.parse({ tasks: [] }).replace).toBe("window");
  });

  it("does not force or dry-run unless asked", () => {
    const parsed = syncInput.parse({ tasks: [] });
    expect(parsed.force).toBe(false);
    expect(parsed.dryRun).toBe(false);
  });

  it("caps a runaway batch", () => {
    const tasks = Array.from({ length: 301 }, (_, i) => ({ ...base, title: `t${i}` }));
    expect(syncInput.safeParse({ tasks }).success).toBe(false);
  });
});
