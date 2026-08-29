import { describe, expect, it } from "vitest";
import {
  alternateFor,
  chooseUrl,
  deriveLinkTarget,
  detectPlatform,
  fallbackFor,
  hasAnyUrl,
  defaultLabel,
} from "@/lib/deeplinks";

describe("deriveLinkTarget", () => {
  it("builds the working owa web link and the mobile scheme from a Graph message id", () => {
    const t = deriveLinkTarget({ provider: "outlook", externalId: "AAMkAGI2TG93AAA=", kind: "email" });
    expect(t.web).toBe("https://outlook.office365.com/owa/?ItemID=AAMkAGI2TG93AAA%3D&exvsurl=1&viewmodel=ReadMessageItem");
    expect(t.mobile).toBe("ms-outlook://emails/message?restId=AAMkAGI2TG93AAA%3D");
    // Field result: new Outlook for Windows opens on the scheme and then says
    // the link is not supported, and classic Outlook ignores it — so there is
    // no desktop app destination at all, only the signed-in browser.
    expect(t.desktop ?? null).toBeNull();
  });

  it("points Outlook drafts at the drafts folder, not the reading pane", () => {
    const t = deriveLinkTarget({ provider: "outlook", externalId: "draft-1", kind: "draft" });
    expect(t.web).toContain("/mail/drafts/id/");
    expect(t.mobile).toContain("emails/drafts");
  });

  it("keeps the connector's webLink byte-for-byte — it is the link that works", () => {
    // Field result: the owa/?ItemID form opens the exact thread when signed
    // in; the rebuilt mail/deeplink/read form does not. The URL Microsoft
    // hands over is the URL the browser gets.
    const graphLink =
      "https://outlook.office365.com/owa/?ItemID=AAMkAGI2%2BTG93%2FAAA%3D&exvsurl=1&viewmodel=ReadMessageItem";
    const t = deriveLinkTarget({ provider: "outlook", externalId: "ignored", web: graphLink });
    expect(t.web).toBe(graphLink);
  });

  it("mines the webLink for the id, so the phone gets the app even when that URL is all we got", () => {
    const graphLink = "https://outlook.office365.com/owa/?ItemID=AAMkAGI2%2BTG93%2FAAA%3D&exvsurl=1";
    const t = deriveLinkTarget({ provider: "outlook", web: graphLink });
    expect(t.mobile).toBe("ms-outlook://emails/message?restId=AAMkAGI2-TG93_AAA%3D");
    expect(t.desktop ?? null).toBeNull();
  });

  it("rewrites the retired deeplink shape back to the working owa form", () => {
    const retired = "https://outlook.office.com/mail/deeplink/read/AAMkAGI2TG93AAA%3D";
    const t = deriveLinkTarget({ provider: "outlook", web: retired });
    expect(t.web).toBe("https://outlook.office365.com/owa/?ItemID=AAMkAGI2TG93AAA%3D&exvsurl=1&viewmodel=ReadMessageItem");
  });

  it("never stores a custom scheme where a browser or a desktop will click it", () => {
    const t = deriveLinkTarget({ provider: "outlook", web: "ms-outlook://emails/message?restId=abc" });
    expect(t.web ?? null).toBeNull();
    expect(t.desktop ?? null).toBeNull();
    expect(t.mobile).toBe("ms-outlook://emails/message?restId=abc");
  });

  it("evicts an ms-outlook scheme from an agent-supplied desktop slot", () => {
    const t = deriveLinkTarget({ provider: "outlook", externalId: "AAMkX", desktop: "ms-outlook://emails/message?restId=AAMkX" });
    expect(t.desktop ?? null).toBeNull();
    expect(t.mobile).toBe("ms-outlook://emails/message?restId=AAMkX");
  });

  it("uses the RFC-822 message id for Gmail, and never a browser-local index", () => {
    // accountIndex numbers accounts by sign-in order in ONE browser; honouring
    // it is how links open the wrong mailbox on every other machine.
    const t = deriveLinkTarget({ provider: "gmail", messageId: "<abc@mail.gmail.com>", accountIndex: 2 });
    expect(t.web).toBe("https://mail.google.com/mail/#search/rfc822msgid:abc%40mail.gmail.com");
  });

  it("falls back to a Gmail thread id when there is no message id", () => {
    const t = deriveLinkTarget({ provider: "gmail", externalId: "18c9f0" });
    expect(t.web).toBe("https://mail.google.com/mail/#all/18c9f0");
  });

  it("names the Gmail account instead of guessing at /u/0/", () => {
    // /u/{n}/ follows browser sign-in order, so on a second account u/0 opens
    // the wrong mailbox and Gmail shows that inbox rather than the thread.
    const t = deriveLinkTarget({ provider: "gmail", threadId: "18c9f0", account: "jamie@work.com" });
    expect(t.web).toBe("https://mail.google.com/mail/u/?authuser=jamie%40work.com#all/18c9f0");
  });

  it("prefers the thread id over the message id — only the thread resolves", () => {
    const t = deriveLinkTarget({ provider: "gmail", externalId: "1a034151929c4d51", threadId: "18c9f0" });
    expect(t.web).toBe("https://mail.google.com/mail/#all/18c9f0");
  });

  it("still prefers the RFC-822 id over everything, account and all", () => {
    const t = deriveLinkTarget({
      provider: "gmail",
      messageId: "<abc@mail.gmail.com>",
      threadId: "18c9f0",
      account: "jamie@work.com",
    });
    expect(t.web).toBe(
      "https://mail.google.com/mail/u/?authuser=jamie%40work.com#search/rfc822msgid:abc%40mail.gmail.com",
    );
  });

  it("ignores an account that is not an address", () => {
    const t = deriveLinkTarget({ provider: "gmail", threadId: "18c9f0", account: "personal" });
    expect(t.web).toBe("https://mail.google.com/mail/#all/18c9f0");
  });

  it("keeps the https link for Gmail on mobile — app links handle it", () => {
    const t = deriveLinkTarget({ provider: "gmail", externalId: "18c9f0" });
    expect(t.mobile).toBe(t.web);
  });

  it("converts a Teams permalink into the desktop scheme", () => {
    const web = "https://teams.microsoft.com/l/message/19:abc@thread.tacv2/1699?tenantId=t";
    const t = deriveLinkTarget({ provider: "teams", web });
    expect(t.desktop).toBe("msteams:/l/message/19:abc@thread.tacv2/1699?tenantId=t");
  });

  it("builds both halves of a Zoom join link, passcode included", () => {
    const t = deriveLinkTarget({ provider: "zoom", externalId: "812 3456 7890", passcode: "s3cret" });
    expect(t.web).toBe("https://zoom.us/j/81234567890?pwd=s3cret");
    expect(t.desktop).toBe("zoommtg://zoom.us/join?action=join&confno=81234567890&pwd=s3cret");
  });

  it("pulls the passcode out of a Zoom URL when it is only in the query", () => {
    const t = deriveLinkTarget({ provider: "zoom", web: "https://zoom.us/j/999?pwd=fromquery" });
    expect(t.desktop).toContain("pwd=fromquery");
  });

  it("turns a Slack archive URL into the app's channel scheme", () => {
    const t = deriveLinkTarget({ provider: "slack", web: "https://acme.slack.com/archives/C123/p1699999999000100" });
    expect(t.desktop).toBe("slack://channel?id=C123&message=1699999999.000100");
  });

  it("never leaves a custom scheme without an https escape route", () => {
    const t = deriveLinkTarget({ provider: "outlook", desktop: "https://outlook.office.com/x" });
    expect(t.web).toBe("https://outlook.office.com/x");
  });

  it("returns nothing at all when it has nothing to work with", () => {
    expect(hasAnyUrl(deriveLinkTarget({ provider: "outlook" }))).toBe(false);
  });
});

describe("chooseUrl", () => {
  const target = { web: "https://web", desktop: "app://desktop", mobile: "app://mobile" };

  it("takes the phone app on a phone", () => {
    expect(chooseUrl(target, "ios")).toBe("app://mobile");
    expect(chooseUrl(target, "android")).toBe("app://mobile");
  });

  it("defaults desktops to the web, where the scheme is a gamble", () => {
    // Classic Outlook ignores ms-outlook:// silently; the web app is signed
    // in for anyone who uses it. The scheme stays one deliberate tap away.
    expect(chooseUrl(target, "macos")).toBe("https://web");
    expect(chooseUrl(target, "windows")).toBe("https://web");
  });

  it("still reaches the desktop app when the user asks for the app", () => {
    expect(chooseUrl(target, "macos", "app")).toBe("app://desktop");
    expect(chooseUrl(target, "windows", "app")).toBe("app://desktop");
  });

  it("takes an https desktop link under auto — no gamble there", () => {
    expect(chooseUrl({ web: "https://web", desktop: "https://desktop-app" }, "windows")).toBe("https://desktop-app");
  });

  it("honours a preference for the browser", () => {
    expect(chooseUrl(target, "ios", "web")).toBe("https://web");
    expect(chooseUrl(target, "windows", "web")).toBe("https://web");
  });

  it("falls back to the web link when the platform has no app link", () => {
    expect(chooseUrl({ web: "https://web" }, "ios")).toBe("https://web");
  });

  it("returns null rather than a broken button when there is no link", () => {
    expect(chooseUrl({}, "ios")).toBeNull();
  });
});

describe("fallbackFor", () => {
  it("offers the web link when the chosen one is a custom scheme", () => {
    expect(fallbackFor({ web: "https://w", mobile: "app://m" }, "app://m")).toBe("https://w");
  });

  it("offers nothing when the chosen link is already https", () => {
    expect(fallbackFor({ web: "https://w" }, "https://w")).toBeNull();
  });
});

describe("detectPlatform", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macos"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
  ])("reads %s", (ua, expected) => {
    expect(detectPlatform(ua)).toBe(expected);
  });
});

describe("defaultLabel", () => {
  it("names the app in the button", () => {
    expect(defaultLabel("outlook", "source")).toBe("Open in Outlook");
    expect(defaultLabel("gmail", "draft")).toBe("See your draft in Gmail");
    expect(defaultLabel("zoom", "join")).toBe("Join on Zoom");
  });

  it("stays generic when the provider is unknown", () => {
    expect(defaultLabel("something-else", "source")).toBe("Open the source");
  });
});

describe("offering the other way to open it", () => {
  // The real Outlook shape now: browser link, mobile scheme, no desktop app.
  const outlook = {
    web: "https://outlook.office365.com/owa/?ItemID=abc&exvsurl=1&viewmodel=ReadMessageItem",
    desktop: null,
    mobile: "ms-outlook://emails/message?restId=abc",
  };

  it("offers nothing on a desktop — there is no app destination that works", () => {
    const chosen = chooseUrl(outlook, "windows");
    expect(chosen).toBe(outlook.web);
    expect(alternateFor(outlook, chosen, "windows")).toBeNull();
    // Even asking for the app lands on the browser, because nothing else can
    // open the message; the preference must not produce a dead button.
    expect(chooseUrl(outlook, "windows", "app")).toBe(outlook.web);
  });

  it("keeps the phone on the app first, browser as the alternate", () => {
    const chosen = chooseUrl(outlook, "ios");
    expect(chosen).toBe(outlook.mobile);
    expect(alternateFor(outlook, chosen, "ios")).toEqual({ url: outlook.web, kind: "web" });
  });

  it("offers the phone app on a phone, not the desktop one", () => {
    const target = { ...outlook, desktop: "ms-outlook://desktop", mobile: "ms-outlook://phone" };
    expect(alternateFor(target, target.web, "ios")).toEqual({ url: "ms-outlook://phone", kind: "app" });
  });

  it("offers nothing when there is only ever one destination", () => {
    const gmail = { web: "https://mail.google.com/x", desktop: null, mobile: "https://mail.google.com/x" };
    expect(alternateFor(gmail, gmail.web, "macos")).toBeNull();
    expect(alternateFor(gmail, gmail.web, "ios")).toBeNull();
  });

  it("offers nothing when there is no link at all", () => {
    expect(alternateFor({ web: null, desktop: null, mobile: null }, null, "macos")).toBeNull();
  });
});
