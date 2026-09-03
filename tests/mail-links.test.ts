import { describe, expect, it } from "vitest";
import {
  assertSafeMailLink,
  isCustomScheme,
  isVerifiedScheme,
  outlookDraftsFolder,
  gmailMobileLink,
  gmailSchemeFromWeb,
  buildGmailWebUrl,
  gmailBase,
  isOutlookScheme,
  normalizeMailLink,
  outlookMobileLink,
  outlookSchemeFromWeb,
  outlookWebLink,
  parseOutlookWebLink,
  toBase64Url,
} from "@/lib/mail-links";

/**
 * The shapes in here are not hypothetical: each rule was set by a real person
 * tapping real tasks. The webLink fixture is the exact form the Graph
 * connector hands over — and the field test that matters most here is that
 * THIS shape opens the thread in the browser, while the rebuilt
 * `mail/deeplink/read` shape does not.
 */
const REAL_WEBLINK =
  "https://outlook.office365.com/owa/?ItemID=AAMkADRlY2ZjZGQx%2BrywUxVqo%2FAAA4T%2FVnAAA%3D&exvsurl=1&viewmodel=ReadMessageItem";

const RETIRED_DEEPLINK = "https://outlook.office.com/mail/deeplink/read/AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA%3D";

describe("gmail: resolve the mailbox by identity, never by index", () => {
  it("builds ?authuser= from the address", () => {
    expect(gmailBase("jamie@work.com")).toBe("https://mail.google.com/mail/u/?authuser=jamie%40work.com");
  });

  it("goes bare when no address is known — never /u/<n>/", () => {
    expect(gmailBase(null)).toBe("https://mail.google.com/mail/");
    expect(gmailBase("not-an-address")).toBe("https://mail.google.com/mail/");
  });

  it("prefers the thread id, then the RFC-822 search, then whatever is left", () => {
    // Field-ordered: #all/<threadId> lands ON the conversation; the search is
    // durable but lands on a results page the user still has to click.
    const all = { messageId: "<a@b.c>", threadId: "t1", externalId: "m1", account: "j@w.com" };
    expect(buildGmailWebUrl(all)).toContain("#all/t1");
    expect(buildGmailWebUrl({ ...all, threadId: null })).toContain("#search/rfc822msgid:a%40b.c");
    expect(buildGmailWebUrl({ ...all, messageId: null, threadId: null })).toContain("#all/m1");
    expect(buildGmailWebUrl({})).toBeNull();
  });

  it("rewrites a stored /u/<n>/ link to the bare form, fragment intact", () => {
    // The exact wall the first user hit: their work mailbox sat at /u/3.
    expect(normalizeMailLink("https://mail.google.com/mail/u/3/#all/18c9f0")).toBe(
      "https://mail.google.com/mail/#all/18c9f0",
    );
  });

  it("builds the field-confirmed Gmail app scheme from a thread id", () => {
    expect(gmailMobileLink("18c9f0")).toBe("googlegmail:///cv=18c9f0");
  });

  it("derives the app scheme from a stored thread link, and only from one", () => {
    expect(gmailSchemeFromWeb("https://mail.google.com/mail/u/?authuser=j%40w.com#all/18c9f0")).toBe(
      "googlegmail:///cv=18c9f0",
    );
    expect(gmailSchemeFromWeb("https://mail.google.com/mail/#all/18c9f0")).toBe("googlegmail:///cv=18c9f0");
    // A search link has no thread id to hand the app.
    expect(gmailSchemeFromWeb("https://mail.google.com/mail/#search/rfc822msgid:a%40b.c")).toBeNull();
    expect(gmailSchemeFromWeb(null)).toBeNull();
  });

  it("leaves the authuser form alone — that one is correct", () => {
    const good = "https://mail.google.com/mail/u/?authuser=j%40w.com#all/t1";
    expect(normalizeMailLink(good)).toBe(good);
  });
});

describe("outlook: the webLink is the browser link that works", () => {
  it("passes the connector's webLink through byte-for-byte", () => {
    // Field result: this shape opens the exact thread when signed in. The
    // earlier rewrite to mail/deeplink/read is what broke it.
    expect(normalizeMailLink(REAL_WEBLINK)).toBe(REAL_WEBLINK);
  });

  it("rewrites the retired deeplink shape back into the working owa form", () => {
    expect(normalizeMailLink(RETIRED_DEEPLINK)).toBe(
      "https://outlook.office365.com/owa/?ItemID=AAMkADRlY2ZjZGQx%2BrywUxVqo%2FAAA4T%2FVnAAA%3D&exvsurl=1&viewmodel=ReadMessageItem",
    );
  });

  it("is idempotent in both directions", () => {
    expect(normalizeMailLink(normalizeMailLink(RETIRED_DEEPLINK))).toBe(normalizeMailLink(RETIRED_DEEPLINK));
    expect(normalizeMailLink(normalizeMailLink(REAL_WEBLINK))).toBe(REAL_WEBLINK);
  });

  it("builds the same owa shape Microsoft emits when only an id is known", () => {
    // Graph ids arrive base64url; the owa ItemID wants plain base64, encoded.
    expect(outlookWebLink("AAMk-a_b=")).toBe(
      "https://outlook.office365.com/owa/?ItemID=AAMk%2Ba%2Fb%3D&exvsurl=1&viewmodel=ReadMessageItem",
    );
  });

  it("puts a draft in the same owa container, without the read-pane hint", () => {
    // Field result: mail/drafts/id/<id> showed no message at all.
    expect(outlookWebLink("d-1_x", "draft")).toBe("https://outlook.office365.com/owa/?ItemID=d%2B1%2Fx&exvsurl=1");
  });

  it("parses the ItemID out of a webLink, converted to base64url for the app", () => {
    const parsed = parseOutlookWebLink(REAL_WEBLINK);
    expect(parsed?.itemId).toBe("AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA=");
  });

  it("builds the mobile scheme that field-tested as opening the message", () => {
    expect(outlookMobileLink("AAMk-a_b=")).toBe("ms-outlook://emails/message?restId=AAMk-a_b%3D");
    // There is no drafts variant any more: it opened the app on nothing.
  });

  it("derives the app handoff from either stored browser shape", () => {
    expect(outlookSchemeFromWeb(REAL_WEBLINK)).toBe(
      "ms-outlook://emails/message?restId=AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA%3D",
    );
    expect(outlookSchemeFromWeb(RETIRED_DEEPLINK)).toBe(
      "ms-outlook://emails/message?restId=AAMkADRlY2ZjZGQx-rywUxVqo_AAA4T_VnAAA%3D",
    );
    expect(outlookSchemeFromWeb("https://mail.google.com/mail/#all/t1")).toBeNull();
    expect(outlookSchemeFromWeb(null)).toBeNull();
  });

  it("does not mangle URLs that merely mention outlook", () => {
    const notMail = "https://outlook.office.com/calendar/item/abc";
    expect(normalizeMailLink(notMail)).toBe(notMail);
    expect(parseOutlookWebLink("https://example.com/owa/?ItemID=x")).toBeNull();
  });

  it("converts ids defensively in both directions", () => {
    expect(toBase64Url("a+b/c=")).toBe("a-b_c=");
    expect(isOutlookScheme("ms-outlook://emails/message?restId=x")).toBe(true);
    expect(isOutlookScheme("https://outlook.office.com/x")).toBe(false);
  });
});

describe("assertSafeMailLink: the bad shapes are rejected by name", () => {
  it("throws on a browser-local Gmail index, naming the fix", () => {
    expect(() => assertSafeMailLink("https://mail.google.com/mail/u/3/#all/x")).toThrow(/authuser/);
  });

  it("throws on the retired deeplink shape — field-tested as not resolving", () => {
    expect(() => assertSafeMailLink(RETIRED_DEEPLINK)).toThrow(/field-tested/);
  });

  it("accepts the webLink — the shape that works is not an error", () => {
    expect(() => assertSafeMailLink(REAL_WEBLINK)).not.toThrow();
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
      outlookWebLink("AAMk+x/y="),
      outlookWebLink("d1", "draft"),
      normalizeMailLink(RETIRED_DEEPLINK)!,
      normalizeMailLink("https://mail.google.com/mail/u/3/#all/x")!,
    ]) {
      expect(() => assertSafeMailLink(url)).not.toThrow();
    }
  });
});

describe("app schemes: only the ones a device confirmed", () => {
  it("knows a custom scheme from an ordinary link", () => {
    expect(isCustomScheme("ms-outlook://emails/message?restId=x")).toBe(true);
    expect(isCustomScheme("googlegmail:///cv=t1")).toBe(true);
    expect(isCustomScheme("https://outlook.office365.com/owa/?ItemID=x")).toBe(false);
    expect(isCustomScheme("mailto:someone@example.com")).toBe(false);
    expect(isCustomScheme(null)).toBe(false);
  });

  it("vouches only for the field-tested shapes", () => {
    expect(isVerifiedScheme("ms-outlook://emails/message?restId=abc")).toBe(true);
    expect(isVerifiedScheme("googlegmail:///cv=t1")).toBe(true);
    expect(isVerifiedScheme("msteams:/l/message/19:abc")).toBe(true);
    // Found live on a real account, supplied by the agent: opened the Outlook
    // app on the wrong screen instead of the event.
    expect(isVerifiedScheme("ms-outlook://events/open?restId=abc")).toBe(false);
    // Opened the app on nothing at all.
    expect(isVerifiedScheme("ms-outlook://emails/drafts?restId=abc")).toBe(false);
    expect(isVerifiedScheme("weird://whatever")).toBe(false);
  });

  it("refuses to store an unverified scheme, in any slot", () => {
    expect(() => assertSafeMailLink("ms-outlook://events/open?restId=abc", { allowOutlookScheme: true })).toThrow(
      /Unverified app-scheme/,
    );
    expect(() => assertSafeMailLink("ms-outlook://emails/drafts?restId=abc", { allowOutlookScheme: true })).toThrow(
      /Unverified app-scheme/,
    );
    expect(() => assertSafeMailLink("ms-outlook://emails/message?restId=abc", { allowOutlookScheme: true })).not.toThrow();
    expect(() => assertSafeMailLink("googlegmail:///cv=t1", { allowOutlookScheme: true })).not.toThrow();
  });

  it("builds an Outlook draft link in the container that works, minus the read-pane hint", () => {
    // Field result: mail/drafts/id/<id> opened Outlook on the web with no
    // message shown. The owa ItemID container is the proven one.
    expect(outlookWebLink("AAMk-d_1=", "draft")).toBe(
      "https://outlook.office365.com/owa/?ItemID=AAMk%2Bd%2F1%3D&exvsurl=1",
    );
    expect(outlookDraftsFolder()).toBe("https://outlook.office.com/mail/drafts");
  });

  it("sends a draft with no thread to the drafts list, never a blank composer", () => {
    // `#drafts?compose=<draft id>` opened an empty compose window.
    expect(buildGmailWebUrl({ kind: "draft", account: "j@w.com" })).toBe(
      "https://mail.google.com/mail/u/?authuser=j%40w.com#drafts",
    );
    expect(buildGmailWebUrl({ kind: "draft", threadId: "t7", account: "j@w.com" })).toBe(
      "https://mail.google.com/mail/u/?authuser=j%40w.com#all/t7",
    );
  });
});
