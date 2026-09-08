import type { Prisma } from "@prisma/client";
import { deriveLinkTarget } from "./deeplinks";
import { normalizeProvider } from "./providers";
import type { TaskInput } from "./validation";
import { normalizeMailLink, outlookWebLink, parseOutlookWebLink, toOutlookRestId } from "./mail-links";

export const isReplyDraft = (kind: string) => kind === "reply" || kind === "reply_all";

/** A body is a suggestion. A saved draft needs provider identity and a read-back receipt. */
export function prepareDraft(input: TaskInput): { row: Prisma.DraftCreateWithoutTaskInput | null; issue: string | null } {
  const d = input.draft;
  if (!d || ![d.body, d.externalId, d.url, d.web].some(Boolean)) return { row: null, issue: null };
  const provider = normalizeProvider(d.provider ?? input.source?.provider);
  const reply = isReplyDraft(d.kind);
  const sameProvider = provider === normalizeProvider(input.source?.provider);
  const account = d.account ?? (sameProvider ? input.source?.account : undefined);
  const threadId = d.threadId ?? (reply && sameProvider ? input.source?.threadId : undefined);
  const suppliedWeb = normalizeMailLink(d.web ?? d.url);
  const outlookLink = provider === "outlook" && suppliedWeb ? parseOutlookWebLink(suppliedWeb) : null;
  let issue: string | null = null;

  if (!d.externalId || !d.verifiedAt) issue = "Save the draft in the provider, read it back, then supply draft.externalId and draft.verifiedAt. Body text alone is only a suggestion.";
  else if (d.verifiedAt.getTime() > Date.now() + 60_000) issue = "draft.verifiedAt cannot be in the future.";
  else if ((provider === "gmail" || provider === "outlook") && !account?.includes("@")) issue = "Supply draft.account (the mailbox that actually contains the draft).";
  else if (provider === "gmail" && !d.threadId) issue = "Supply draft.threadId from the saved Gmail draft's message.threadId, not its draft id or message id.";
  else if (reply && (!sameProvider || (input.source?.account && account?.toLowerCase() !== input.source.account.toLowerCase()))) issue = "The reply draft must belong to the source provider and mailbox.";
  else if (reply && provider === "gmail" && (!input.source?.threadId || d.threadId !== input.source.threadId)) issue = "The saved Gmail reply draft must have the same threadId as the source conversation.";
  else if (reply && provider === "outlook" && (!input.source?.externalId || d.replyToId !== input.source.externalId)) issue = "Create the Outlook draft with createReply/createReplyAll on source.externalId and supply that id as draft.replyToId.";
  else if (!reply && !d.to) issue = "Supply draft.to so a forward or new draft can be matched to the selected delegate.";
  else if (provider === "outlook" && suppliedWeb && (!outlookLink || outlookLink.itemId !== toOutlookRestId(d.externalId))) issue = "Supply the saved Outlook draft's own Graph webLink, matching draft.externalId; an inbox or source message URL is not a draft link.";

  const sourceOutlookLink = input.source?.webUrl ?? input.source?.url;
  const outlookHost = sourceOutlookLink ? parseOutlookWebLink(normalizeMailLink(sourceOutlookLink))?.host : undefined;

  const target = issue ? {} : deriveLinkTarget({
    provider, externalId: d.externalId, threadId, account,
    anchorItemId: reply ? input.source?.externalId : undefined,
    kind: "draft", web: suppliedWeb ?? (provider === "outlook" && d.externalId ? outlookWebLink(d.externalId, "draft", outlookHost) : undefined),
    // Mail handoffs are derived from identity; a supplied scheme cannot prove a draft exists.
  });
  return {
    issue,
    row: {
      provider, kind: d.kind, subject: d.subject ?? null, body: d.body ?? null,
      externalId: d.externalId ?? null, verifiedAt: issue ? null : d.verifiedAt,
      threadId: threadId ?? null, account: account ?? null,
      replyToId: d.replyToId ?? null, to: d.to ?? null,
      webUrl: target.web ?? null, desktopUrl: target.desktop ?? null, mobileUrl: target.mobile ?? null,
    },
  };
}
