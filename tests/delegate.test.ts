import { describe, expect, it } from "vitest";
import { delegateMailto } from "@/lib/client/delegate";
import type { TaskDTO } from "@/lib/tasks";
import type { TeamMemberDTO } from "@/lib/team";

const julie: TeamMemberDTO = {
  id: "t1",
  name: "Julie Alvarez",
  email: "julie@company.com",
  function: "marketing",
  functionLabel: "Marketing",
  level: "manager",
  levelLabel: "Manager",
  note: null,
};

const task = {
  title: "Book the offsite venue",
  description: "Deposit due by Friday.",
  source: { subject: "Venue hold — Cedar Hall", from: "events@cedarhall.com" },
  links: [
    { kind: "source", web: "https://mail.google.com/mail/u/?authuser=j%40w.com#all/t1" },
    { kind: "draft", web: "https://example.com/draft" },
  ],
} as unknown as TaskDTO;

describe("the hand-off email", () => {
  it("is a mailto to the teammate, subject forwarded, thread linked", () => {
    const url = delegateMailto(task, julie)!;
    expect(url.startsWith("mailto:julie%40company.com?")).toBe(true);

    const subject = decodeURIComponent(url.match(/subject=([^&]+)/)![1]);
    expect(subject).toBe("Fwd: Venue hold — Cedar Hall");

    const body = decodeURIComponent(url.match(/body=(.+)$/)![1]);
    expect(body).toContain("Hi Julie,");
    expect(body).toContain("Book the offsite venue");
    expect(body).toContain("Deposit due by Friday.");
    expect(body).toContain("events@cedarhall.com");
    // The source link, not the draft — the teammate wants the thread.
    expect(body).toContain("https://mail.google.com/mail/u/?authuser=j%40w.com#all/t1");
    expect(body).not.toContain("example.com/draft");
  });

  it("falls back to the task title when the source has no subject", () => {
    const bare = { ...task, source: { subject: null, from: null } } as unknown as TaskDTO;
    const url = delegateMailto(bare, julie)!;
    expect(decodeURIComponent(url)).toContain("Handing off: Book the offsite venue");
  });

  it("returns nothing for a teammate without an email — the chip just assigns", () => {
    expect(delegateMailto(task, { ...julie, email: null })).toBeNull();
  });
});
