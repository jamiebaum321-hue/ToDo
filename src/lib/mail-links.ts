/**
 * Mail links that actually land on the thread.
 *
 * Pure functions, no dependencies, safe to run server-side at write time — so
 * every client gets corrected links instead of each one re-deriving them.
 *
 * Provider routing observations and their limits:
 *
 * 1. Gmail `/u/<n>/` is never emitted. The index numbers accounts by the order
 *    they were signed into one particular browser, so the same link opens a
 *    different mailbox on a different machine — and Gmail lands on that inbox
 *    instead of the thread, which looks exactly like a broken deep link. The
 *    reporting user's work mailbox sat at /u/3. `?authuser=<email>` resolves
 *    the account by identity and Gmail rewrites to the right index itself.
 *    Confirmed working on desktop Chrome against a real multi-account setup.
 *
 * 2. The Graph `webLink` (`.../owa/?ItemID=...&exvsurl=1`) is the Outlook web
 *    link that WORKS, and it is kept byte-for-byte. An earlier version of this
 *    module rewrote it into `mail/deeplink/read/<base64url id>` on the theory
 *    that the owa form was legacy — and the field test came back the other
 *    way: the rebuilt deeplink did NOT resolve to the thread, while the raw
 *    webLink did. So the connector's URL is the canonical browser link, the
 *    deeplink/read shape is the banned one, and when only an id is known the
 *    web link is built in the same owa shape Microsoft itself emits.
 *
 * 3. `ms-outlook://` is a MOBILE scheme. On iOS and Android it opens the
 *    Outlook app on the exact message (field-confirmed). New Outlook on
 *    Windows registers the scheme but answers `emails/message?restId=` with
 *    "this link isn't supported" (field-confirmed), and classic Outlook
 *    ignores it silently — so no desktop slot ever carries it, and the web
 *    slot never carries any scheme at all.
 */

const GMAIL_INDEXED = /^(https?:\/\/mail\.google\.com\/mail)\/u\/\d+\/?/i;
const OUTLOOK_OWA = /^https?:\/\/(outlook\.(?:office365|office|live)\.com)\/owa\/?\?(.+)$/i;
/** The shape that field-tested as NOT resolving; normalize rewrites it back. */
const OUTLOOK_READ_DEEPLINK = /^https?:\/\/(outlook\.[\w.]+)\/mail\/deeplink\/read\/([^/?#]+)$/i;
const OUTLOOK_SCHEME = /^ms-outlook:/i;

export function isOutlookScheme(url: string | null | undefined): boolean {
  return !!url && OUTLOOK_SCHEME.test(url);
}

/**
 * Allowlisted navigation schemes. A successful app launch does not prove
 * that the requested item opened. In particular, the September 8 iPhone
 * recording shows googlegmail:///cv= opening only the inbox, even with the
 * correct thread id. It must not be emitted or restored from old rows.
 */
const VERIFIED_SCHEMES: RegExp[] = [
  /^ms-outlook:\/\/emails\/message\?restId=/i,
  /^msteams:\/l\//i,
  /^slack:\/\/channel\?/i,
  /^zoommtg:\/\//i,
];

/** Anything that is not http(s) or mailto: — i.e. needs an app to answer it. */
export function isCustomScheme(url: string | null | undefined): boolean {
  return !!url && /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(?:https?|mailto):/i.test(url);
}

export function isVerifiedScheme(url: string | null | undefined): boolean {
  return !!url && VERIFIED_SCHEMES.some((re) => re.test(url));
}

/**
 * Exchange REST IDs use '/' -> '-' and '+' -> '_', unlike RFC 4648 base64url.
 * Match Office.context.mailbox.convertToRestId / convertToEwsId:
 * https://appsforoffice.microsoft.com/lib/1/hosted/outlook-web-16.01.debug.js
 * Reversing these substitutions sends real draft links back to the inbox.
 */
export function toOutlookRestId(id: string): string {
  return id.replace(/\//g, "-").replace(/\+/g, "_");
}

function fromOutlookRestId(id: string): string {
  return id.replace(/-/g, "/").replace(/_/g, "+");
}

/**
 * Pull the item id out of a Graph `webLink`, converted to Exchange REST — the form
 * the ms-outlook:// mobile scheme wants as its restId.
 */
export function parseOutlookWebLink(url: string): { host: string; itemId: string } | null {
  const m = url.match(OUTLOOK_OWA);
  if (!m) return null;

  // URLSearchParams decodes %2B/%2F back to +// for us; the param name has
  // been seen as ItemID and itemid in the wild, so match case-insensitively.
  for (const [key, value] of new URLSearchParams(m[2])) {
    if (key.toLowerCase() === "itemid" && value) {
      return { host: m[1].toLowerCase(), itemId: toOutlookRestId(value) };
    }
  }
  return null;
}

/**
 * The Outlook browser link for an item id in Graph's default Exchange REST format.
 *
 * Keep Microsoft's view hint for drafts too. Live validation showed that
 * omitting it redirects to the inbox, while ReadMessageItem opens the saved
 * draft with its response and a Continue editing action.
 */
export function outlookWebLink(itemId: string, _kind: "message" | "draft" = "message", host = "outlook.office365.com"): string {
  const owa = `https://${host}/owa/?ItemID=${encodeURIComponent(fromOutlookRestId(itemId))}&exvsurl=1`;
  return `${owa}&viewmodel=ReadMessageItem`;
}

/** Where a draft lives when its own id is unknown: the folder, not a blank composer. */
export function outlookDraftsFolder(): string {
  return "https://outlook.office.com/mail/drafts";
}

/**
 * The mobile app handoff. Field-confirmed to open the message on iOS/Android.
 *
 * Only `emails/message` exists here on purpose: the `emails/drafts` variant
 * this used to emit opened the app on "message not found", so a draft's app
 * link is the SOURCE message id instead — the reply draft is waiting inside
 * that conversation anyway.
 */
export function outlookMobileLink(itemId: string): string {
  return `ms-outlook://emails/message?restId=${encodeURIComponent(toOutlookRestId(itemId))}`;
}

/**
 * The app handoff derived from a stored browser link — either the owa webLink
 * or the retired deeplink shape older rows may still carry. Lets rows written
 * before this module existed offer the app with no migration.
 */
export function outlookSchemeFromWeb(url: string | null | undefined): string | null {
  if (!url) return null;

  const owa = parseOutlookWebLink(url);
  if (owa) return `ms-outlook://emails/message?restId=${encodeURIComponent(owa.itemId)}`;

  const read = url.match(OUTLOOK_READ_DEEPLINK);
  if (read) return `ms-outlook://emails/message?restId=${read[2]}`;

  return null;
}

export interface GmailUrlInput {
  /** RFC-822 Message-ID header, angle brackets optional. The most durable form. */
  messageId?: string | null;
  /** Gmail thread id — what the #all/ fragment actually resolves. */
  threadId?: string | null;
  /** Fallback id when nothing better is known. */
  externalId?: string | null;
  /** Mailbox address. Becomes ?authuser= so Gmail resolves the account by identity. */
  account?: string | null;
  kind?: string | null;
}

/**
 * Which mailbox Gmail opens, without ever hardcoding a browser-local index.
 * Returns a prefix a fragment can be appended to directly.
 */
export function gmailBase(account?: string | null): string {
  return account && account.includes("@")
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.trim())}`
    : // No identity known: the bare path lets Gmail pick the default account,
      // which is what /u/0/ meant — minus the pretence of knowing the index.
      "https://mail.google.com/mail/";
}

/** Recover a mailbox identity from a provider URL, never from /u/<index>/. */
export function gmailAccountFromWeb(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "mail.google.com" || !parsed.pathname.startsWith("/mail/")) return null;
    const account = parsed.searchParams.get("authuser");
    return account?.includes("@") ? account.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Gmail's mobile WEBSITE conversation route, observed by navigating All Mail
 * in Gmail itself. Desktop #all/<id> fragments are lost by its mobile UI.
 * Start at /mu/ so Gmail resolves its own /mp/<session>/ path; never store
 * that path or an account index. This is a browser workaround, not an app link.
 */
export function gmailMobileWebLink(threadId: string, account?: string | null): string {
  const base = gmailBase(account).replace("/mail/", "/mail/mu/");
  return `${base}#cv/All%20Mail/${encodeURIComponent(threadId.trim())}`;
}

/**
 * Upgrade legacy desktop links only when they contain a Gmail API thread id.
 * Opaque Gmail UI tokens and search results are not mobile conversation ids.
 */
export function gmailMobileWebFromWeb(url: string | null | undefined, account?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "mail.google.com" || !parsed.pathname.startsWith("/mail/")) return null;
    const thread = parsed.hash.match(/^#(?:all|inbox)\/([a-f0-9]+)$/i)?.[1];
    return thread ? gmailMobileWebLink(thread, account ?? gmailAccountFromWeb(url)) : null;
  } catch {
    return null;
  }
}

export function isGmailMobileWebLink(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/mail\.google\.com\/mail\/mu\/(?:\?[^#]*)?#cv\/All%20Mail\//i.test(url);
}

export function buildGmailWebUrl(input: GmailUrlInput): string | null {
  const base = gmailBase(input.account);
  const mid = input.messageId?.trim();
  const thread = input.threadId?.trim();

  if ((input.kind ?? "").toLowerCase() === "draft") {
    // A reply draft lives inside its thread, so the thread IS the draft link.
    // The old `#drafts?compose=<id>` form field-tested as opening an empty
    // compose window — Gmail wants its own compose token there, not an API
    // draft id. Without a thread id there is no exact draft destination.
    return thread ? `${base}#all/${encodeURIComponent(thread)}` : null;
  }
  // The thread id first: #all/<threadId> lands ON the conversation. The
  // rfc822msgid search is more durable, but it field-tested as landing on a
  // search-results list the user still has to click through — "did not go to
  // the thread". So it is the fallback, not the default.
  if (thread) {
    return `${base}#all/${encodeURIComponent(thread)}`;
  }
  if (mid) {
    return `${base}#search/rfc822msgid:${encodeURIComponent(mid.replace(/[<>]/g, ""))}`;
  }
  // A Gmail message id is NOT a thread id. A generic inbox is not a destination.
  return null;
}

/**
 * Rewrite the known-bad shapes, pass everything else through untouched.
 * Total and idempotent, so it is safe at write time AND on rows written
 * before the rules existed — in either direction: it also heals the rows the
 * earlier version of this module rewrote into the deeplink shape.
 */
export function normalizeMailLink<T extends string | null | undefined>(url: T): T {
  if (!url) return url;

  const read = url.match(OUTLOOK_READ_DEEPLINK);
  if (read) {
    // decodeURIComponent because the deeplink builder stored the id encoded.
    try {
      return outlookWebLink(decodeURIComponent(read[2]), "message", read[1]) as T;
    } catch {
      return url;
    }
  }

  if (GMAIL_INDEXED.test(url)) {
    // The email cannot be recovered from the URL, so rewrite to the bare form:
    // same behaviour as u/0 for a single-account user, and no longer a lie for
    // everyone else. The write path builds authuser links when it knows the
    // address; this catches what was stored before it did.
    return url.replace(GMAIL_INDEXED, "$1/") as T;
  }

  return url;
}

/**
 * The guard that stops the bad shapes recurring. Call it at the boundary where
 * a link is about to be persisted: it throws with an error naming the fix, so
 * a bad link from a connector payload, a legacy row, or an LLM-generated task
 * is rejected at write time rather than discovered by a user clicking it.
 */
export function assertSafeMailLink(url: string, opts: { allowOutlookScheme?: boolean } = {}): void {
  if (GMAIL_INDEXED.test(url)) {
    throw new Error(
      `Unsafe Gmail link (browser-local /u/<n>/ index): ${url} — build it with ?authuser=<email> via gmailBase(), or run it through normalizeMailLink().`,
    );
  }
  if (OUTLOOK_READ_DEEPLINK.test(url)) {
    throw new Error(
      `Unsafe Outlook link (mail/deeplink/read — field-tested as not resolving to the thread): ${url} — keep the connector's webLink, or build the owa form with outlookWebLink(), or run it through normalizeMailLink().`,
    );
  }
  if (isCustomScheme(url) && !isVerifiedScheme(url)) {
    throw new Error(
      `Unverified app-scheme link: ${url} — send the provider's https URL and item identity instead. Gmail conversation schemes open the inbox on iPhone; use the mailbox-qualified mobile web conversation route.`,
    );
  }
  if (OUTLOOK_SCHEME.test(url) && !opts.allowOutlookScheme) {
    throw new Error(
      `ms-outlook:// scheme in a slot a browser will open: ${url} — the scheme belongs only in the mobile slot, behind allowOutlookScheme.`,
    );
  }
}
