import { normalizeProvider, type ProviderKey } from "./providers";
import { buildGmailWebUrl, gmailMobileLink, isOutlookScheme, normalizeMailLink, outlookMobileLink, outlookWebLink, parseOutlookWebLink } from "./mail-links";

/**
 * A single button's three destinations. Never all three, often only one —
 * the UI picks the best available for whatever device you are holding.
 */
export interface LinkTarget {
  web?: string | null;
  desktop?: string | null;
  mobile?: string | null;
}

export interface DeriveInput extends LinkTarget {
  provider?: string | null;
  /** Provider-native id: a Graph message id, a Gmail thread id, a Zoom meeting no. */
  externalId?: string | null;
  /** RFC-822 Message-ID header, if the agent has it. The best Gmail fallback. */
  messageId?: string | null;
  /** Gmail's thread id. What Gmail's #all/ fragment actually resolves. */
  threadId?: string | null;
  /** The mailbox address, e.g. "jamie@company.com". Names the Gmail account. */
  account?: string | null;
  /**
   * For a draft: the id of the SOURCE message it replies to. A reply draft
   * lives inside that conversation, so the app handoff opens the thread —
   * the ms-outlook drafts scheme field-tested as opening the app on nothing.
   */
  anchorItemId?: string | null;
  /** Which signed-in account, for Gmail's /u/{n}/ and Outlook mailboxes. */
  accountIndex?: number | null;
  /** Zoom passcode, Teams tenant, etc. */
  passcode?: string | null;
  tenantId?: string | null;
  /** "message" | "thread" | "draft" | "event" | "meeting" */
  kind?: string | null;
}

const isHttp = (u?: string | null): u is string => !!u && /^https?:\/\//i.test(u);
const clean = (u?: string | null) => (typeof u === "string" && u.trim().length > 0 ? u.trim() : undefined);

/** Teams and Zoom both publish an https link that the desktop app also claims. */
function teamsDesktopFromWeb(web?: string) {
  if (!web) return undefined;
  // https://teams.microsoft.com/l/message/... -> msteams:/l/message/...
  const m = web.match(/^https?:\/\/teams\.microsoft\.com\/(l\/.*)$/i);
  return m ? `msteams:/${m[1]}` : undefined;
}

function zoomAppFromWeb(web?: string, passcode?: string | null) {
  if (!web) return undefined;
  const m = web.match(/^https?:\/\/([\w.-]*zoom\.us)\/j\/(\d+)(?:\?(.*))?$/i);
  if (!m) return undefined;
  const host = m[1];
  const confno = m[2];
  const params = new URLSearchParams(m[3] ?? "");
  const pwd = passcode ?? params.get("pwd") ?? "";
  const q = new URLSearchParams({ action: "join", confno });
  if (pwd) q.set("pwd", pwd);
  return `zoommtg://${host}/join?${q.toString()}`;
}

function slackAppFromWeb(web?: string) {
  if (!web) return undefined;
  // https://acme.slack.com/archives/C12345/p1699999999000100
  const m = web.match(/^https?:\/\/[\w-]+\.slack\.com\/archives\/([\w]+)\/p(\d{10})(\d{6})/i);
  if (!m) return undefined;
  return `slack://channel?id=${m[1]}&message=${m[2]}.${m[3]}`;
}

/**
 * Fill in whatever we can work out, without ever overwriting what the agent
 * explicitly provided.
 */
export function deriveLinkTarget(input: DeriveInput): LinkTarget {
  const provider = normalizeProvider(input.provider);
  const web = clean(input.web);
  const desktop = clean(input.desktop);
  const mobile = clean(input.mobile);
  const id = clean(input.externalId);
  const u = typeof input.accountIndex === "number" && input.accountIndex >= 0 ? input.accountIndex : 0;
  const kind = (input.kind ?? "message").toLowerCase();

  const out: LinkTarget = { web, desktop, mobile };

  switch (provider) {
    case "outlook": {
      // The connector's webLink is the browser link that field-tested as
      // opening the exact thread, so it is kept byte-for-byte — and mined for
      // the item id so the mobile app link exists even when that URL is all
      // the agent sent. (An earlier version rewrote it into mail/deeplink/read
      // and that shape did NOT resolve; normalizeMailLink now heals any rows
      // it produced.)
      const parsed = out.web ? parseOutlookWebLink(out.web) : null;
      const itemId = id ?? parsed?.itemId;
      const anchor = clean(input.anchorItemId);

      if (!out.web && itemId) {
        out.web = outlookWebLink(itemId, kind === "draft" ? "draft" : "message");
      }
      if (!out.mobile) {
        // Field-confirmed: emails/message opens the app on the conversation,
        // iOS and Android. The drafts variant opens the app on nothing, so a
        // draft's app link aims at the thread it replies to instead — the
        // reply draft is sitting right there in the conversation view.
        if (kind === "draft") {
          if (anchor) out.mobile = outlookMobileLink(anchor, "message");
        } else if (itemId) {
          out.mobile = outlookMobileLink(itemId, "message");
        }
      }
      // No desktop slot on purpose. New Outlook for Windows registers the
      // scheme but answers emails/message with "this link isn't supported"
      // (field-confirmed); classic Outlook ignores it silently. The browser,
      // signed in, is the only desktop destination that works.
      break;
    }
    case "outlook_calendar": {
      // The event's own webLink (Graph) is the link that opens the event —
      // instructions tell the agent to send it, and it passes through above
      // untouched. The path built from a bare id is the last resort. No
      // custom schemes here: the ms-outlook events variants are unverified,
      // and the mail ones taught us how those half-work. Accepting an invite
      // happens in the signed-in calendar, web everywhere.
      if (!out.web && id) out.web = `https://outlook.office365.com/calendar/item/${encodeURIComponent(id)}`;
      if (!out.mobile) out.mobile = out.web ?? undefined;
      break;
    }
    case "gmail": {
      if (!out.web) {
        out.web =
          buildGmailWebUrl({
            messageId: clean(input.messageId),
            threadId: clean(input.threadId),
            externalId: id,
            account: clean(input.account),
            kind,
          }) ?? undefined;
      }
      // googlegmail:///cv=<threadId> is undocumented but field-confirmed to
      // open the Gmail app on the exact thread; the button falls back to the
      // browser when no app answers. Without a thread id (an rfc822msgid
      // search, say) the https link is the best mobile link that exists —
      // Android app links hand it to the app anyway.
      if (!out.mobile) {
        const thread = clean(input.threadId);
        out.mobile = thread ? gmailMobileLink(thread) : (out.web ?? undefined);
      }
      break;
    }
    case "teams": {
      if (!out.web && id && /^https?:/i.test(id)) out.web = id;
      if (!out.desktop) out.desktop = teamsDesktopFromWeb(out.web ?? undefined);
      if (!out.mobile) out.mobile = out.desktop ?? out.web ?? undefined;
      break;
    }
    case "zoom": {
      if (!out.web && id) {
        const digits = id.replace(/\D/g, "");
        if (digits) {
          const q = input.passcode ? `?pwd=${encodeURIComponent(input.passcode)}` : "";
          out.web = `https://zoom.us/j/${digits}${q}`;
        }
      }
      const app = zoomAppFromWeb(out.web ?? undefined, input.passcode);
      if (!out.desktop) out.desktop = app;
      if (!out.mobile) out.mobile = app;
      break;
    }
    case "google_calendar": {
      // Prefer the API's own htmlLink (sent as source.url). From ids, the
      // event VIEW link is eid = base64url("<eventId> <calendarEmail>") —
      // the same token htmlLink carries. The old eventedit path opened the
      // event for editing, which is not what "look at this invite" means,
      // and /u/<n>/ numbering is the same wrong-account trap Gmail had.
      if (!out.web && id) {
        const email = clean(input.account);
        if (email) {
          const eid = Buffer.from(`${id} ${email}`, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          out.web = `https://calendar.google.com/calendar/event?eid=${eid}`;
        } else {
          out.web = `https://calendar.google.com/calendar/u/${u}/r/eventedit/${encodeURIComponent(id)}`;
        }
      }
      if (!out.mobile) out.mobile = out.web ?? undefined;
      break;
    }
    case "slack": {
      const app = slackAppFromWeb(out.web ?? undefined);
      if (!out.desktop) out.desktop = app;
      if (!out.mobile) out.mobile = app;
      break;
    }
    default:
      break;
  }

  // A link with nothing but a custom scheme is a dead end on any device that
  // does not have that app; keep web as the universal fallback where we have it.
  if (!out.web && isHttp(out.desktop)) out.web = out.desktop;
  if (!out.web && isHttp(out.mobile)) out.web = out.mobile;

  // The web slot is the one a browser will always open: no custom schemes in
  // it, ever, and any legacy shape an agent pasted in gets rewritten here so
  // every caller stores corrected links rather than re-deriving them. An
  // ms-outlook scheme is mobile-only — desktop Outlook refuses it — so a
  // misplaced one lands in the mobile slot, nowhere else.
  if (out.web && !isHttp(out.web)) {
    if (!out.mobile) out.mobile = out.web;
    out.web = undefined;
  }
  if (isOutlookScheme(out.desktop)) {
    if (!out.mobile) out.mobile = out.desktop;
    out.desktop = undefined;
  }
  out.web = normalizeMailLink(out.web);
  if (isHttp(out.desktop)) out.desktop = normalizeMailLink(out.desktop);
  if (isHttp(out.mobile)) out.mobile = normalizeMailLink(out.mobile);

  return {
    web: out.web ?? null,
    desktop: out.desktop ?? null,
    mobile: out.mobile ?? null,
  };
}

export type Platform = "ios" | "android" | "macos" | "windows" | "linux" | "unknown";
export type LinkPreference = "auto" | "app" | "web";

export function detectPlatform(ua?: string): Platform {
  const s = (ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  // iPadOS 13+ reports as a Mac; the touch-point check is the standard tell.
  if (/Macintosh/i.test(s) && typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 1) return "ios";
  if (/Android/i.test(s)) return "android";
  if (/Macintosh|Mac OS X/i.test(s)) return "macos";
  if (/Windows/i.test(s)) return "windows";
  if (/Linux/i.test(s)) return "linux";
  return "unknown";
}

export const isMobilePlatform = (p: Platform) => p === "ios" || p === "android";

/**
 * Pick the URL to actually open.
 *
 * "auto" is the honest default: the native app on phones and desktops that
 * have one, the browser everywhere else. "web" is the escape hatch for anyone
 * who does not have the desktop apps installed and is tired of dead links.
 */
export function chooseUrl(
  target: LinkTarget,
  platform: Platform,
  preference: LinkPreference = "auto",
): string | null {
  const web = clean(target.web) ?? null;
  const desktop = clean(target.desktop) ?? null;
  const mobile = clean(target.mobile) ?? null;

  if (preference === "web") return web ?? mobile ?? desktop;

  const native = isMobilePlatform(platform) ? mobile : desktop;
  if (preference === "app") return native ?? web ?? mobile ?? desktop;

  // auto
  if (isMobilePlatform(platform)) return mobile ?? web ?? desktop;
  // On a desktop, a custom scheme is a gamble: new Outlook answers it, classic
  // Outlook ignores it silently. Default to the web app — which is signed in
  // for anyone who uses it — and let the "open in the app instead" control and
  // the app preference reach the scheme deliberately, with the fallback ready.
  if (desktop && !/^https?:\/\//i.test(desktop) && web) return web;
  return desktop ?? web ?? mobile;
}

/**
 * Custom schemes (ms-outlook:, zoommtg:) do nothing at all if the app is not
 * installed — the browser stays put with no error. When we hand one of those
 * to the UI we also hand back the https fallback so it can offer a way out.
 */
export function fallbackFor(target: LinkTarget, chosen: string | null): string | null {
  if (!chosen || isHttp(chosen)) return null;
  const web = clean(target.web);
  return web && web !== chosen ? web : null;
}

/**
 * The other way to open the same thing.
 *
 * `chooseUrl` has to commit to one destination, and it guesses from the user
 * agent — which cannot tell whether the desktop mail client is actually
 * installed, or whether someone on a laptop would rather stay in the browser.
 * So the sheet offers the alternative alongside it instead of being wrong until
 * the global setting is changed.
 */
export function alternateFor(
  target: LinkTarget,
  chosen: string | null,
  platform: Platform,
): { url: string; kind: "app" | "web" } | null {
  if (!chosen) return null;
  const web = clean(target.web) ?? null;
  const native = clean(isMobilePlatform(platform) ? target.mobile : target.desktop) ?? null;

  // Going to the app: offer the browser. Going to the browser: offer the app,
  // but only when it is a real app link rather than the same https URL again.
  if (!isHttp(chosen)) return web && web !== chosen ? { url: web, kind: "web" } : null;
  return native && native !== chosen && !isHttp(native) ? { url: native, kind: "app" } : null;
}

export function hasAnyUrl(target: LinkTarget): boolean {
  return Boolean(clean(target.web) || clean(target.desktop) || clean(target.mobile));
}

/** Default button copy when the agent does not supply a label. */
export function defaultLabel(provider: ProviderKey | string | null | undefined, kind: string): string {
  const p = normalizeProvider(provider);
  const name =
    p === "manual" || p === "other"
      ? null
      : { outlook: "Outlook", gmail: "Gmail", teams: "Teams", slack: "Slack", zoom: "Zoom", google_calendar: "Google Calendar", outlook_calendar: "Outlook Calendar", notion: "Notion", linear: "Linear", jira: "Jira", asana: "Asana", github: "GitHub" }[p];

  switch (kind) {
    case "draft":
      return name ? `See your draft in ${name}` : "See your draft reply";
    case "join":
      return name ? `Join on ${name}` : "Join the meeting";
    case "calendar":
      return name ? `Open in ${name}` : "Open the event";
    case "file":
      return "Open the file";
    default:
      return name ? `Open in ${name}` : "Open the source";
  }
}
