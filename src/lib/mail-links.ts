/**
 * Mail links that actually land on the thread.
 *
 * Pure functions, no dependencies, safe to run server-side at write time — so
 * every client gets corrected links instead of each one re-deriving them.
 * Three link shapes have each burned a real user, and everything here exists
 * to kill them at the source:
 *
 * 1. Gmail `/u/<n>/`. The index numbers accounts by the order they were signed
 *    into one particular browser, so the same link opens a different mailbox on
 *    a different machine — and Gmail lands on that inbox instead of the thread,
 *    which looks exactly like the deep link being broken. `?authuser=<email>`
 *    resolves by identity and Gmail rewrites to the right index itself. This
 *    module never emits a numbered index.
 *
 * 2. The raw Graph `webLink` (`.../owa/?ItemID=...&exvsurl=1`). A legacy OWA
 *    shape: the ItemID is plain base64 (`+`, `/`) and `exvsurl=1` invokes
 *    desktop-Outlook hand-off behaviour that strands people on the inbox. The
 *    ItemID is parsed out, converted base64 → base64url, and rebuilt as the
 *    modern deeplink. `exvsurl` cannot survive.
 *
 * 3. `ms-outlook://` leaking into slots where a browser will click it. The
 *    scheme is what the mobile apps (and new Outlook on desktop) register, but
 *    on a machine without a handler it does nothing at all, silently. It is
 *    opt-in per slot via `allowOutlookScheme`, never a default for the web.
 */

const GMAIL_INDEXED = /^(https?:\/\/mail\.google\.com\/mail)\/u\/\d+\/?/i;
const OUTLOOK_OWA = /^https?:\/\/(outlook\.(?:office365|office|live)\.com)\/owa\/?\?(.+)$/i;
const OUTLOOK_SCHEME = /^ms-outlook:/i;

/** `outlook.office365.com` and `outlook.office.com` are the same OWA; canonicalise. */
function canonicalOutlookHost(host: string): string {
  return /office/i.test(host) ? "outlook.office.com" : host.toLowerCase();
}

/** Graph webLink ItemIDs are plain base64; every modern Outlook URL wants base64url. */
export function toBase64Url(id: string): string {
  return id.replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Pull the item id out of a Graph `webLink`, already converted to base64url.
 * Returns null for anything that is not that shape.
 */
export function parseOutlookWebLink(url: string): { host: string; itemId: string } | null {
  const m = url.match(OUTLOOK_OWA);
  if (!m) return null;

  // URLSearchParams decodes %2B/%2F back to +// for us; the param name has
  // been seen as ItemID and itemid in the wild, so match case-insensitively.
  for (const [key, value] of new URLSearchParams(m[2])) {
    if (key.toLowerCase() === "itemid" && value) {
      return { host: canonicalOutlookHost(m[1]), itemId: toBase64Url(value) };
    }
  }
  return null;
}

/** The modern OWA deeplink for an item id (base64url, unencoded). */
export function outlookDeepLink(itemId: string, kind: "message" | "draft" = "message", host = "outlook.office.com"): string {
  const path = kind === "draft" ? "mail/drafts/id" : "mail/deeplink/read";
  return `https://${host}/${path}/${encodeURIComponent(toBase64Url(itemId))}`;
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
 * before this module existed.
 */
export function normalizeMailLink<T extends string | null | undefined>(url: T): T {
  if (!url) return url;

  const owa = parseOutlookWebLink(url);
  if (owa) return outlookDeepLink(owa.itemId, "message", owa.host) as T;

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
 * The guard that stops these shapes recurring. Call it at the boundary where a
 * link is about to be persisted: it throws on all three bad shapes with an
 * error naming the fix, so a bad link from a connector payload, a legacy row,
 * or an LLM-generated task is rejected at write time rather than discovered by
 * a user clicking it.
 */
export function assertSafeMailLink(url: string, opts: { allowOutlookScheme?: boolean } = {}): void {
  if (GMAIL_INDEXED.test(url)) {
    throw new Error(
      `Unsafe Gmail link (browser-local /u/<n>/ index): ${url} — build it with ?authuser=<email> via gmailBase(), or run it through normalizeMailLink().`,
    );
  }
  if (OUTLOOK_OWA.test(url) || /[?&]exvsurl=1/i.test(url)) {
    throw new Error(
      `Unsafe Outlook link (raw Graph webLink / exvsurl): ${url} — parse the ItemID and rebuild with outlookDeepLink(), or run it through normalizeMailLink().`,
    );
  }
  if (OUTLOOK_SCHEME.test(url) && !opts.allowOutlookScheme) {
    throw new Error(
      `ms-outlook:// scheme in a slot a browser will open: ${url} — the scheme belongs only in the app slots, behind allowOutlookScheme.`,
    );
  }
}

const OUTLOOK_DEEPLINK = /^https:\/\/(outlook\.[\w.]+)\/mail\/(deeplink\/read|drafts\/id)\/([^/?#]+)$/i;

/**
 * The ms-outlook:// handoff for a deeplink we already trust.
 *
 * Exists for rows written before this module did: they stored the https link
 * in every slot (or nothing at all in the app slots), so phones were never
 * offered the app. The id inside a deeplink is exactly the restId the mobile
 * scheme wants, so the app link can be derived at read time — no migration,
 * no waiting for the next sweep to rewrite the row.
 */
export function outlookSchemeFromWeb(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(OUTLOOK_DEEPLINK);
  if (!m) return null;
  const path = m[2].toLowerCase().startsWith("drafts") ? "emails/drafts" : "emails/message";
  return `ms-outlook://${path}?restId=${m[3]}`;
}
