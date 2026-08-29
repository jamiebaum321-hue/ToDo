import { describe, expect, it } from "vitest";
import {
  assertSafeMailLink,
  outlookSchemeFromWeb,
  buildGmailWebUrl,
  gmailBase,
  normalizeMailLink,
  outlookDeepLink,
  parseOutlookWebLink,
  toBase64Url,
} from "@/lib/mail-links";

/**
 * The shapes in here are not hypothetical: each one was stored in a real
 * account and clicked by a real user before it was killed. The Graph webLink
 * fixture is the exact form the connector hands over.
 */
const REAL_WEBLINK =
  "https://outlook.office365.com/owa/?ItemID=AAMkADRlY2ZjZGQx%2BrywUxVqo%2FAAA4T%2FVnAAA%3D&exvsurl=1&viewmodel=ReadMessageItem";

describe("gmail: resolve the mailbox by identity, never by index", () => {
  it("builds ?authuser= from the address", () => {
    expect(gmailBase("jamie@work.com")).toBe("https://mail.google.com/mail/u/?authuser=jamie%40work.com");
  });

  it("goes bare when no address is known — never /u/<n>/", () => {
    expect(gmailBase(null)).toBe("https://mail.google.com/mail/");
    expect(gmailBase("not-an-address")).toBe("https://mail.google.com/mail/");
  });

  it("prefers the RFC-822 id, then the thread id, then whatever is left", () => {
    const all = { messageId: "<a@b.c>", threadId: "t1", externalId: "m1", account: "j@w.com" };
    expect(buildGmailWebUrl(all)).toContain("#search/rfc822msgid:a%40b.c");
    expect(buildGmailWebUrl({ ...all, messageId: null })).toContain("#all/t1");
    expect(buildGmailWebUrl({ ...all, messageId: null, threadId: null })).toContain("#all/m1");
    expect(buildGmailWebUrl({})).toBeNull();
  });

  it("rewrites a stored /u/<n>/ link to the bare form, fragment intact", () => {
    // The exact wall the first user hit: their work mailbox sat at /u/3.
    expect(normalizeMailLink("https://mail.google.com/mail/u/3/#all/18c9f0")).toBe(
      "https://mail.google.com/mail/#all/18c9f0",
    );
  });

  it("leaves the authuser form alone — that one is correct", () => {
    const good = "https://mail.google.com/mail/u/?authuser=j%40w.com#all/t1";
    expect(normalizeMailLink(good)).toBe(good);
  });
});

describe("outlook: the raw Graph webLink dies at the boundary", () => {
  it("parses the ItemID out and converts base64 to base64url", () => {
    const parsed = parseOutlookWebLink(REAL_WEBLINK);
    expect(parsed?.host).toBe("outlook.office.com");
    // %2B and %2F decode to + and /, which become - and _.
    expect(parsed?.itemId).toBe("AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA=");
  });

  it("rebuilds it as the modern deeplink, exvsurl gone", () => {
    const fixed = normalizeMailLink(REAL_WEBLINK);
    expect(fixed).toBe(
      "https://outlook.office.com/mail/deeplink/read/AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA%3D",
    );
    expect(fixed).not.toContain("exvsurl");
    expect(fixed).not.toContain("owa");
  });

  it("keeps a consumer mailbox on its own host", () => {
    const consumer = "https://outlook.live.com/owa/?ItemID=abc%2Fdef&exvsurl=1";
    expect(normalizeMailLink(consumer)).toBe("https://outlook.live.com/mail/deeplink/read/abc_def");
  });

  it("is idempotent — normalizing a fixed link changes nothing", () => {
    const once = normalizeMailLink(REAL_WEBLINK);
    expect(normalizeMailLink(once)).toBe(once);
  });

  it("points drafts at the drafts folder", () => {
    expect(outlookDeepLink("d+1/x", "draft")).toBe("https://outlook.office.com/mail/drafts/id/d-1_x");
  });

  it("does not mangle URLs that merely mention outlook", () => {
    const notOwa = "https://outlook.office.com/calendar/item/abc";
    expect(normalizeMailLink(notOwa)).toBe(notOwa);
    expect(parseOutlookWebLink("https://example.com/owa/?ItemID=x")).toBeNull();
  });

  it("converts plain base64 ids defensively", () => {
    expect(toBase64Url("a+b/c=")).toBe("a-b_c=");
  });
});

describe("assertSafeMailLink: the three bad shapes are rejected by name", () => {
  it("throws on a browser-local Gmail index, naming the fix", () => {
    expect(() => assertSafeMailLink("https://mail.google.com/mail/u/3/#all/x")).toThrow(/authuser/);
  });

  it("throws on the raw webLink and on exvsurl anywhere", () => {
    expect(() => assertSafeMailLink(REAL_WEBLINK)).toThrow(/outlookDeepLink/);
    expect(() => assertSafeMailLink("https://outlook.office.com/mail/x?exvsurl=1")).toThrow(/webLink/);
  });

  it("throws on ms-outlook:// unless the slot opted in", () => {
    const scheme = "ms-outlook://emails/message?restId=abc";
    expect(() => assertSafeMailLink(scheme)).toThrow(/allowOutlookScheme/);
    expect(() => assertSafeMailLink(scheme, { allowOutlookScheme: true })).not.toThrow();
  });

  it("passes every shape the builders emit", () => {
    for (const url of [
      gmailBase("j@w.com") + "#all/t1",
      gmailBase(null) + "#search/rfc822msgid:a%40b.c",
      outlookDeepLink("AAMk+x/y="),
      normalizeMailLink(REAL_WEBLINK)!,
      normalizeMailLink("https://mail.google.com/mail/u/3/#all/x")!,
    ]) {
      expect(() => assertSafeMailLink(url)).not.toThrow();
    }
  });
});

describe("outlookSchemeFromWeb: the app handoff, derived from a link we trust", () => {
  it("turns a read deeplink into the mobile scheme, id untouched", () => {
    expect(outlookSchemeFromWeb("https://outlook.office.com/mail/deeplink/read/AAMk-a_b%3D")).toBe(
      "ms-outlook://emails/message?restId=AAMk-a_b%3D",
    );
  });

  it("routes drafts to the drafts screen", () => {
    expect(outlookSchemeFromWeb("https://outlook.office.com/mail/drafts/id/d-1")).toBe(
      "ms-outlook://emails/drafts?restId=d-1",
    );
  });

  it("derives nothing from links that are not Outlook deeplinks", () => {
    expect(outlookSchemeFromWeb("https://mail.google.com/mail/#all/t1")).toBeNull();
    expect(outlookSchemeFromWeb("https://outlook.office.com/calendar/item/abc")).toBeNull();
    expect(outlookSchemeFromWeb(null)).toBeNull();
  });
});
