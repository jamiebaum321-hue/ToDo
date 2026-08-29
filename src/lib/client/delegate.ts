import type { TaskDTO } from "@/lib/tasks";
import type { TeamMemberDTO } from "@/lib/team";

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
export function delegateMailto(task: TaskDTO, member: TeamMemberDTO): string | null {
  if (!member.email) return null;

  const first = member.name.trim().split(/\s+/)[0] || member.name;
  const source = task.source;
  const link =
    task.links.find((l) => l.kind === "source" && l.web)?.web ?? task.links.find((l) => l.web)?.web ?? null;

  const subject = source.subject ? `Fwd: ${source.subject}` : `Handing off: ${task.title}`;

  const lines = [
    `Hi ${first},`,
    "",
    `Handing this one to you: ${task.title}`,
  ];
  if (task.description) lines.push("", task.description);
  if (source.subject || source.from) {
    lines.push("", `Original: ${source.subject ? `"${source.subject}"` : "the thread"}${source.from ? ` — from ${source.from}` : ""}`);
  }
  if (link) lines.push("", `Open the thread here: ${link}`);
  lines.push("", "Thanks!");

  return `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
