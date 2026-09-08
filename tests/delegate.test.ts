import { describe, expect, it } from "vitest";
import { delegateMailto, delegationTarget } from "@/lib/client/delegate";
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

describe("provider delegation actions", () => {
  const gmail = { ...task, source: { ...task.source, provider: "gmail", account: "owner@example.com" } } as TaskDTO;
  it("opens Gmail with the selected recipient, subject and body on desktop and app compose on mobile", () => {
    const action = delegationTarget(gmail, julie)!;
    const url = new URL(action.target.web!);
    expect(url.hostname).toBe("mail.google.com");
    expect(url.searchParams.get("authuser")).toBe("owner@example.com");
    expect(url.searchParams.get("to")).toBe(julie.email);
    expect(url.searchParams.get("su")).toBe("Fwd: Venue hold — Cedar Hall");
    expect(url.searchParams.get("body")).toContain("Deposit due by Friday.");
    expect(action.target.mobile).toContain("googlegmail:///co?");
    expect(action.saved).toBe(false);
  });
  it("opens Outlook compose with the same recipient, subject and content", () => {
    const outlook = { ...gmail, links: [], source: { ...gmail.source, provider: "outlook" } };
    const action = delegationTarget(outlook, julie)!;
    const url = new URL(action.target.web!);
    expect(url.hostname).toBe("outlook.office.com");
    expect(url.searchParams.get("to")).toBe(julie.email);
    expect(url.searchParams.get("subject")).toContain("Cedar Hall");
    expect(action.target.mobile).toContain("ms-outlook://compose?");
  });
  it("reuses a saved draft only for its own recipient", () => {
    const ready = { ...gmail, draft: { ready: true, kind: "forward", to: julie.email, web: "https://mail.google.com/mail/#all/forward-thread", providerLabel: "Gmail" } } as TaskDTO;
    expect(delegationTarget(ready, julie)).toMatchObject({ saved: true, target: { web: ready.draft!.web } });
    expect(delegationTarget(ready, { ...julie, email: "topaz@example.com" })?.saved).toBe(false);
    expect(new URL(delegationTarget(ready, { ...julie, email: "topaz@example.com" })!.target.web!).searchParams.get("to")).toBe("topaz@example.com");
  });
  it("does not use a reply draft as a handoff and does not mutate task state", () => {
    const original = { ...gmail, status: "open", draft: { ready: true, kind: "reply", to: julie.email } } as TaskDTO;
    expect(delegationTarget(original, julie)?.saved).toBe(false);
    expect(original.status).toBe("open");
  });
});
