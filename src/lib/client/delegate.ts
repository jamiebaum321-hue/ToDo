import type { TaskDTO } from "@/lib/tasks";
import type { TeamMemberDTO } from "@/lib/team";
import { gmailBase } from "@/lib/mail-links";
import type { LinkTarget } from "@/lib/deeplinks";

/**
 * The hand-off email, as a mailto: link.
 *
 * ToDo never touches anybody's mailbox — that is the architecture, not an
 * omission — so "delegate now" cannot literally forward the original message.
 * What it can do is put a ready-to-send hand-off in the user's own mail
 * client, addressed to the teammate, carrying the task, the context, and the
 * link that opens the exact thread. One tap to open, one to send, and the
 * sending happens from the user's own account like any other mail.
 */
export function delegationMessage(task: TaskDTO, member: TeamMemberDTO) {
  if (!member.email) return null;

  const first = member.name.trim().split(/\s+/)[0] || member.name;
  const source = task.source;
  const link =
    task.links.find((l) => l.kind === "source" && l.web)?.web ?? task.links.find((l) => l.web)?.web ?? null;

  const subject = source.subject ? `Fwd: ${source.subject.replace(/^(?:fwd?:\s*)+/i, "")}` : `Handing off: ${task.title}`;

  const lines = [
    `Hi ${first},`,
    "",
    `Handing this one to you: ${task.title}`,
  ];
  if (task.description) lines.push("", task.description);
  if (source.subject || source.from) {
    lines.push("", `Original: ${source.subject ? `"${source.subject}"` : "the thread"}${source.from ? ` — from ${source.from}` : ""}`);
  }
  if (source.snippet) lines.push("", source.snippet);
  if (link) lines.push("", `Original in my mailbox (access may be required): ${link}`);
  lines.push("", "Thanks!");

  const matchingSuggestion = task.draft && !task.draft.ready && ["forward", "new"].includes(task.draft.kind) && task.draft.to?.toLowerCase() === member.email.toLowerCase();
  return {
    to: member.email,
    subject: matchingSuggestion && task.draft?.subject ? task.draft.subject : subject,
    body: matchingSuggestion && task.draft?.body ? task.draft.body : lines.join("\n"),
  };
}

export function delegateMailto(task: TaskDTO, member: TeamMemberDTO): string | null {
  const message = delegationMessage(task, member);
  return message ? `mailto:${encodeURIComponent(message.to)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}` : null;
}

/** Choose the source mail provider, rather than the operating system's default handler. */
export function delegationTarget(task: TaskDTO, member: TeamMemberDTO): { target: LinkTarget; saved: boolean; providerLabel: string } | null {
  const message = delegationMessage(task, member);
  if (!message) return null;
  const draft = task.draft;
  if (draft?.ready && ["forward", "new"].includes(draft.kind) && draft.to?.toLowerCase() === message.to.toLowerCase()) {
    return { target: draft, saved: true, providerLabel: draft.providerLabel };
  }
  const provider = task.source.provider;
  const params = new URLSearchParams({ to: message.to, subject: message.subject, body: message.body });
  // Outlook and native mail handlers decode URI components, not form data.
  // Spaces must be %20; a literal plus remains encoded as %2B.
  const composeQuery = params.toString().replace(/\+/g, "%20");
  if (provider === "gmail" || provider === "google_calendar" || task.links.some(l => l.kind === "source" && l.web?.startsWith("https://mail.google.com/"))) {
    const web = new URL(gmailBase(task.source.account));
    web.searchParams.set("view", "cm");
    web.searchParams.set("fs", "1");
    web.searchParams.set("to", message.to);
    web.searchParams.set("su", message.subject);
    web.searchParams.set("body", message.body);
    return { target: { web: web.toString(), mobile: `googlegmail:///co?${composeQuery}` }, saved: false, providerLabel: "Gmail" };
  }
  if (["outlook", "outlook_calendar", "teams"].includes(provider ?? "")) {
    const personal = task.links.some(l => l.web?.startsWith("https://outlook.live.com/"));
    const web = new URL(`https://${personal ? "outlook.live.com" : "outlook.office.com"}/mail/deeplink/compose`);
    for (const [key, value] of params) web.searchParams.set(key, value);
    if (task.source.account) web.searchParams.set("login_hint", task.source.account);
    return { target: { web: web.toString().replace(/\+/g, "%20"), mobile: `ms-outlook://compose?${composeQuery}` }, saved: false, providerLabel: "Outlook" };
  }
  const mailto = delegateMailto(task, member);
  return { target: { web: mailto, mobile: mailto, desktop: mailto }, saved: false, providerLabel: "your email app" };
}
