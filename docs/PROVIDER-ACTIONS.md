# Provider actions and saved drafts

ToDo uses the user's existing Claude or ChatGPT session. That assistant reads mail and saves drafts through its own available connectors; ToDo stores task and draft references over MCP. There is no new mail OAuth connection, model API key, or per-click model call in this change. Connector availability and write permissions depend on the user's assistant setup.

## Saved reply contract

A body or URL alone is a suggested response. A saved mail draft must include:

| Field | Meaning |
| --- | --- |
| `verificationMethod` | `provider_api` (default), or the restricted Gmail `mailbox_ui` receipt described below |
| `externalId` | Actual provider draft ID, obtained after saving; required for `provider_api`, omitted for `mailbox_ui` |
| `verifiedAt` | Time the assistant read the saved draft back and checked it |
| `account` | Address of the mailbox containing the draft |
| `kind` | `reply`, `reply_all`, `forward`, or `new` |
| `threadId` | Gmail: the saved draft message's thread ID; for replies it must match `source.threadId` |
| `replyToId` | Outlook replies: source Graph message ID used in `createReply` / `createReplyAll` |
| `to` | Required for forward/new drafts and `mailbox_ui` receipts |
| `web` | Outlook: the saved draft's own Graph `webLink`, when available |
| `subject`, `body` | Preview of the response; preserve any user edits |

`verifiedAt` is an attestation from the assistant, not an independent provider check performed by ToDo. The assistant must confirm the DRAFT label / `isDraft`, account, recipients, conversation, subject, and composed response. Quoted original mail alone is not a prepared reply. The app validates consistency of the supplied identities; it cannot detect an assistant inventing a receipt.

When Gmail's authenticated browser UI is available but its API draft ID is not, a **reply/reply_all only** can use `verificationMethod: "mailbox_ui"`. Reopen the persisted draft from Drafts or its source conversation and check the mailbox, recipient, subject, composed body, and exact thread. Supply those as `account`, `to`, `subject`, `body`, `threadId`, plus the actual read-back time in `verifiedAt`. Both the source mailbox and source thread must match. Omit `externalId`; a legacy or guessed API ID is not proof. An open composer or suggested text without this reopened-mailbox check is insufficient. Outlook and forward/new delegation drafts still require provider API identity. On later runs, locate this existing Gmail draft by mailbox and thread before editing, preserve user edits, and never create a duplicate merely because its API ID is absent.

For Gmail, save a reply with the real `message.threadId`, matching subject, and `In-Reply-To` / `References` headers. A connector's threaded-reply operation, such as `reply_message_id`, may set these on the assistant's behalf. Read back the result before attaching it. [Gmail threading requirements](https://developers.google.com/workspace/gmail/api/guides/threads).

For Outlook, create the draft with `createReply` / `createReplyAll` on the source message and update its body. Read back the draft's identity and `webLink`. Sending is a separate operation, performed by the user. [Microsoft Graph createReply](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0).

Verify the mailbox using the mail connector's account/profile. The ToDo login address is not evidence of which mailbox contains an email. A source ID, thread ID, and saved draft ID must stay paired with the mailbox that returned them. A 404 in another mailbox is not proof of deletion.

Outlook uses Exchange REST ID substitutions (`/` becomes `-`, `+` becomes `_`), not the standard base64url alphabet. This matches Microsoft's `convertToRestId` and `convertToEwsId` in the [Office SDK](https://appsforoffice.microsoft.com/lib/1/hosted/outlook-web-16.01.debug.js). Preserve the provider webLink. When deriving one, keep `viewmodel=ReadMessageItem` for a draft too: live Chrome validation found that dropping it returned to the inbox. The canonical link opens the saved draft and Outlook offers **Continue editing**.

Example Gmail reply payload, using illustrative IDs:

```json
{
  "title": "Reply to the workshop date proposal",
  "bucket": "urgent_not_priority",
  "source": {
    "provider": "gmail",
    "type": "email",
    "externalId": "source-message-id",
    "threadId": "source-thread-id",
    "messageId": "<original-message@example.com>",
    "account": "owner@example.com",
    "subject": "Workshop dates"
  },
  "draft": {
    "provider": "gmail",
    "kind": "reply",
    "externalId": "saved-provider-draft-id",
    "threadId": "source-thread-id",
    "account": "owner@example.com",
    "verifiedAt": "2026-09-08T14:00:00Z",
    "subject": "Re: Workshop dates",
    "body": "Thanks for the options. I will confirm after checking the calendar."
  }
}
```

The Gmail action opens that mailbox and conversation, where the saved draft resides. It does not pass a Gmail API draft ID as a browser compose token. Outlook opens the draft's own web link on desktop; a reply's mobile action uses the source message to reach its conversation. The original email remains a separate action.

## Delegation

Selecting a teammate reuses a saved forward/new draft only when `draft.to` matches that teammate's email. A delegation draft has its own conversation identity; it must not inherit the original Gmail thread ID. Replies to the original sender are never reused as delegation drafts.

When no matching saved draft exists, selecting the teammate opens a provider-specific composer with recipient, subject, task description, and available source context. This is a prefilled new email; it does not forward attachments or imply that a draft was saved. Include enough context for someone without access to the original mailbox. Gmail and Outlook stay with the source provider; Teams tasks use Outlook. Other providers use the default email app.

Opening email leaves the task open. Only **I've sent it — mark handed off** records delegation and suppresses the task from later sweeps. Undo restores it. A missing teammate address can be saved before opening email, with errors shown if saving fails.

## Calendar, Teams, and devices

| Action | Computer | Phone |
| --- | --- | --- |
| Gmail reply | Account-qualified conversation URL | Existing Gmail conversation scheme, with browser alternative |
| Outlook reply | Provider draft webLink; original email separately | Source conversation in Outlook, with browser alternative |
| New delegation | Gmail/Outlook prefilled web composer | Provider compose scheme, with browser alternative |
| Outlook RSVP | Invite email with Accept/Decline controls | Invite email in Outlook; browser alternative |
| Calendar event | Event's own provider webLink | Event's own webLink |
| Teams message / meeting | Exact Teams app permalink and web alternative | Exact Teams app permalink and web alternative |

Send an Outlook invitation **email** as the source, the event as a separate `kind: "calendar", provider: "outlook_calendar"` link, and a Teams join link as `kind: "join"`. Each link keeps its own IDs. Joining a meeting is not accepting an invitation.

Native mail URL schemes are best-effort handoffs, not supported guarantees that a particular screen opened. Gmail's conversation scheme is undocumented. The existing repository records device observations, but the September 2026 changes were not validated on physical iOS/Android devices or installed Outlook/Teams clients. A browser can detect a handoff attempt, not whether the destination found the message. The browser alternative therefore stays visible, including after an apparent successful app launch. Native Outlook calendar navigation is not claimed: the invite email provides RSVP, with the calendar event available through its webLink.

Teams URLs preserve tenant and conversation context. Use the message's **Copy link** action; the browser address bar may only identify the app. Both `teams.microsoft.com/l/...` and the `teams.cloud.microsoft/l/...` links copied by the current Teams UI are recognized. ToDo retains the original web link and derives the corresponding app path without rewriting its message context. [Teams deep links](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/deep-link-teams).

## Repair and lifecycle

- `get_run_context` repeats the current settings, roster, action guidance, draft identities and verification methods, and `actionIssues` on every run. It also retains estimates, confidence, rank, and source snippets so link repairs can preserve them. Reuse existing drafts and preserve user edits.
- `sync_tasks` reports `linkGaps`. Repair with `replace: "none"` and re-read the task before calling it ready.
- Omitted source metadata and extra links are preserved for the same source. Explicit `links: []` removes extra links. Changing source provider/account/item does not borrow the previous source's identity.
- A new unverified suggestion does not overwrite an existing saved draft reference. After confirming a draft was sent or deleted, call `detach_draft` to remove the stale reference. This does not change task status or delete mail. A temporary connector error is not evidence of deletion.
- On incomplete connector sweeps, use `replace: "none"`. Full replacement is only for complete sweeps.
- Existing draft rows receive no invented verification timestamp during migration. The next assistant run must read them back and attach their verified identities.
- Never claim a payment, attachment, approval, or RSVP occurred without evidence. Prepare conditional wording or state the prerequisite clearly; the user performs the action.

## Verification

Automated coverage includes provider identities through sync/database/serialization, related Gmail links, standalone delegation threads, Outlook URL consistency, device selection, invite/calendar/join separation, draft lifecycle and tenant isolation. Run `npm test` against an isolated Postgres database; `npm run test:unit` runs the pure tests without Docker or Postgres.

Before claiming a provider/device is verified, test with a signed-in account: select a real task, check the correct mailbox/conversation and composed draft text, return without sending and confirm the task remains, select the delegate and verify recipient/subject/body, then check the invite and Teams actions. Repeat on desktop, iOS, and Android, including an app-not-installed case. Local synthetic fixtures test UI behavior but cannot prove a provider's native screen behavior.
