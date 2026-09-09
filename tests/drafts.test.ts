import { describe, expect, it } from "vitest";
import { prepareDraft } from "@/lib/drafts";
import { taskInput } from "@/lib/validation";

const source = { provider: "gmail", externalId: "message-original", threadId: "thread-original", account: "owner@example.com" };
const input = (draft: Record<string, unknown>, origin = source) => taskInput.parse({ title: "Reply to vendor", bucket: "urgent_important", source: origin, draft });
const saved = { externalId: "draft-123", verifiedAt: new Date(), threadId: "thread-original", account: "owner@example.com", body: "Thanks for the update." };
const mailboxUi = { ...saved, externalId: undefined, verificationMethod: "mailbox_ui", to: "vendor@example.com", subject: "Re: Proposal" };

describe("saved draft contract", () => {
  it("retains suggested text without pretending it exists in Gmail", () => {
    const result = prepareDraft(input({ body: "Thanks!" }));
    expect(result.issue).toContain("only a suggestion");
    expect(result.row).toMatchObject({ body: "Thanks!", verifiedAt: null, webUrl: null, mobileUrl: null });
  });
  it("does not accept an invented saved status without a read-back receipt", () => {
    expect(prepareDraft(input({ ...saved, verifiedAt: undefined })).issue).toContain("verifiedAt");
  });
  it("opens a verified Gmail reply on the correct thread and mailbox", () => {
    const result = prepareDraft(input(saved));
    expect(result.issue).toBeNull();
    expect(result.row?.webUrl).toBe("https://mail.google.com/mail/?authuser=owner%40example.com#all/thread-original");
    expect(result.row?.mobileUrl).toBe("https://mail.google.com/mail/mu/?authuser=owner%40example.com#cv/All%20Mail/thread-original");
  });
  it("accepts an explicitly reopened Gmail reply without pretending to know its API draft id", () => {
    const result = prepareDraft(input(mailboxUi));
    expect(result.issue).toBeNull();
    expect(result.row).toMatchObject({ verificationMethod: "mailbox_ui", externalId: null, verifiedAt: saved.verifiedAt,
      to: "vendor@example.com", subject: "Re: Proposal", body: saved.body,
      webUrl: "https://mail.google.com/mail/?authuser=owner%40example.com#all/thread-original" });
    expect(prepareDraft(input({ ...mailboxUi, kind: "reply_all" })).issue).toBeNull();
  });
  it.each(["account", "threadId", "to", "subject", "body", "verifiedAt", "verificationMethod"])("does not infer a mailbox UI receipt when %s is missing", (field) => {
    const result = prepareDraft(input({ ...mailboxUi, [field]: undefined }));
    expect(result.issue).not.toBeNull();
    expect(result.row).toMatchObject({ verifiedAt: null, webUrl: null, mobileUrl: null });
  });
  it.each(["body", "subject"])("rejects a blank %s in a mailbox UI receipt", (field) => {
    expect(prepareDraft(input({ ...mailboxUi, [field]: "   " })).issue).not.toBeNull();
  });
  it("rejects a legacy or guessed API draft id on a mailbox UI receipt", () => {
    expect(prepareDraft(input({ ...mailboxUi, externalId: "unverified-legacy-id" })).issue).toContain("Omit draft.externalId");
  });
  it("keeps mailbox UI verification restricted to the source Gmail reply", () => {
    for (const kind of ["new", "forward"]) expect(prepareDraft(input({ ...mailboxUi, kind })).issue).toContain("only supported");
    expect(prepareDraft(input(mailboxUi, { ...source, provider: "outlook" })).issue).toContain("only supported");
    expect(prepareDraft(input({ ...mailboxUi, account: "other@example.com" })).issue).toContain("source provider and mailbox");
    expect(prepareDraft(input({ ...mailboxUi, threadId: "other-thread" })).issue).toContain("same threadId");
    expect(prepareDraft(input(mailboxUi, { ...source, account: "" })).issue).toContain("source.account");
    expect(prepareDraft(input({ ...mailboxUi, verifiedAt: new Date(Date.now() + 600_000) })).issue).toContain("future");
  });
  it("rejects an orphan reply draft even when it was saved", () => {
    expect(prepareDraft(input({ ...saved, threadId: "unrelated-thread" })).issue).toContain("same threadId");
  });
  it("rejects a reply in another mailbox", () => {
    expect(prepareDraft(input({ ...saved, account: "other@example.com" })).issue).toContain("source provider and mailbox");
  });
  it("keeps a delegation draft on its own thread and recipient", () => {
    const result = prepareDraft(input({ ...saved, kind: "new", threadId: "delegation-thread", to: "topaz@example.com" }));
    expect(result.issue).toBeNull();
    expect(result.row?.webUrl).toContain("#all/delegation-thread");
    expect(result.row?.mobileUrl).toBe("https://mail.google.com/mail/mu/?authuser=owner%40example.com#cv/All%20Mail/delegation-thread");
  });
  it("requires a delegate recipient instead of reusing a draft for somebody else", () => {
    expect(prepareDraft(input({ ...saved, kind: "forward" })).issue).toContain("draft.to");
  });
  it("requires an Outlook createReply source and opens that conversation on mobile", () => {
    const outlook = { ...source, provider: "outlook", externalId: "AAMk_source=" };
    const d = { ...saved, externalId: "AAMk_draft=", replyToId: "AAMk_source=" };
    const result = prepareDraft(input(d, outlook));
    expect(result.issue).toBeNull();
    expect(result.row?.webUrl).toContain("ItemID=AAMk%2Bdraft%3D");
    expect(result.row?.mobileUrl).toContain("restId=AAMk_source%3D");
    expect(prepareDraft(input({ ...d, replyToId: "wrong" }, outlook)).issue).toContain("createReply");
  });
  it("refuses Outlook inbox links or links to a different message as saved drafts", () => {
    const outlook = { ...source, provider: "outlook", externalId: "source" };
    for (const web of ["https://outlook.office.com/mail", "https://outlook.office.com/owa/?ItemID=source&exvsurl=1"]) {
      expect(prepareDraft(input({ ...saved, externalId: "draft", replyToId: "source", web }, outlook)).issue).toContain("own Graph webLink");
    }
  });
  it("accepts a provider draft webLink whose Exchange REST id contains both substitutions", () => {
    const outlook = { ...source, provider: "outlook", externalId: "source" };
    const web = "https://outlook.office365.com/owa/?ItemID=AAMk%2B%2F%2Fdraft%3D&exvsurl=1";
    const result = prepareDraft(input({ ...saved, externalId: "AAMk_--draft=", replyToId: "source", web }, outlook));
    expect(result.issue).toBeNull();
    expect(result.row?.webUrl).toBe(web);
    expect(prepareDraft(input({ ...saved, externalId: "AAMk-__draft=", replyToId: "source", web }, outlook)).issue).toContain("own Graph webLink");
  });
  it("keeps a personal Outlook draft on the source's live.com host", () => {
    const outlook = { ...source, provider: "outlook", externalId: "source", url: "https://outlook.live.com/owa/?ItemID=source&exvsurl=1" };
    expect(prepareDraft(input({ ...saved, externalId: "draft", replyToId: "source" }, outlook)).row?.webUrl).toContain("https://outlook.live.com/owa/");
  });
});
