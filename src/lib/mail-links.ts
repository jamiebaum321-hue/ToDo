/**
 * Mail links that actually land on the thread.
 *
 * Pure functions, no dependencies, safe to run server-side at write time — so
 * every client gets corrected links instead of each one re-deriving them.
 *
 * Every rule in here is field-tested, and one earlier rule was reversed by
 * that testing, so the evidence is worth recording:
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

/** Graph REST ids are base64url; the webLink's ItemID is plain base64. */
export function toBase64Url(id: string): string {
  return id.replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(id: string): string {
  return id.replace(/-/g, "+").replace(/_/g, "/");
}

/**
 * Pull the item id out of a Graph `webLink`, converted to base64url — the form
 * the ms-outlook:// mobile scheme wants as its restId.
 */
export function parseOutlookWebLink(url: string): { host: string; itemId: string } | null {
  const m = url.match(OUTLOOK_OWA);
  if (!m) return null;

  // URLSearchParams decodes %2B/%2F back to +// for us; the param name has
  // been seen as ItemID and itemid in the wild, so match case-insensitively.
  for (const [key, value] of new URLSearchParams(m[2])) {
    if (key.toLowerCase() === "itemid" && value) {
      return { host: m[1].toLowerCase(), itemId: toBase64Url(value) };
    }
  }
  return null;
}

/**
 * The Outlook browser link for an item id (base64url in, as Graph returns it).
 *
 * Deliberately the same owa shape Microsoft's own webLink uses, because that
 * is the shape that field-tested as opening the exact thread. Drafts use the
 * modern drafts path — there is no owa equivalent for a draft.
 */
export function outlookWebLink(itemId: string, kind: "message" | "draft" = "message", host = "outlook.office365.com"): string {
  if (kind === "draft") {
    return `https://outlook.office.com/mail/drafts/id/${encodeURIComponent(toBase64Url(itemId))}`;
  }
  return `https://${host}/owa/?ItemID=${encodeURIComponent(fromBase64Url(itemId))}&exvsurl=1&viewmodel=ReadMessageItem`;
}

/** The mobile app handoff. Field-confirmed to open the message on iOS/Android. */
export function outlookMobileLink(itemId: string, kind: "message" | "draft" = "message"): string {
  const path = kind === "draft" ? "emails/drafts" : "emails/message";
  return `ms-outlook://${path}?restId=${encodeURIComponent(toBase64Url(itemId))}`;
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
    ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}`
    : // No identity known: the bare path lets Gmail pick the default account,
      // which is what /u/0/ meant — minus the pretence of knowing the index.
      "https://mail.google.com/mail/";
}

export function buildGmailWebUrl(input: GmailUrlInput): string | null {
  const base = gmailBase(input.account);
  const mid = input.messageId?.trim();
  const thread = input.threadId?.trim();
  const id = input.externalId?.trim();

  if (mid) {
    // Searching by RFC-822 id survives label moves, archiving and a change of
    // signed-in account. Nothing else does.
    return `${base}#search/rfc822msgid:${encodeURIComponent(mid.replace(/[<>]/g, ""))}`;
  }
  if ((input.kind ?? "").toLowerCase() === "draft" && id) {
    return `${base}#drafts?compose=${encodeURIComponent(id)}`;
  }
  // #all/ resolves a THREAD id. Handed a message id it shows All Mail, so the
  // thread wins whenever both are known.
  const best = thread || id;
  return best ? `${base}#all/${encodeURIComponent(best)}` : null;
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
    return outlookWebLink(decodeURIComponent(read[2])) as T;
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
  if (OUTLOOK_SCHEME.test(url) && !opts.allowOutlookScheme) {
    throw new Error(
      `ms-outlook:// scheme in a slot a browser will open: ${url} — the scheme belongs only in the mobile slot, behind allowOutlookScheme.`,
    );
  }
}
