import { prisma } from "./db";

/**
 * Who the user can hand work to.
 *
 * "Delegate" is one of the four buckets, so an assistant deciding whether
 * something can be handed off has to know who exists and what they cover.
 * Without that it can only ever say "someone else could do this", which is not
 * a decision anyone can act on.
 */

export const TEAM_FUNCTIONS = [
  { key: "operations", label: "Operations" },
  { key: "marketing", label: "Marketing" },
  { key: "sales", label: "Sales" },
  { key: "finance", label: "Finance & accounting" },
  { key: "facilities", label: "Facilities & maintenance" },
  { key: "it", label: "IT & engineering" },
  { key: "hr", label: "People & HR" },
  { key: "legal", label: "Legal & compliance" },
  { key: "customer", label: "Customer support" },
  { key: "product", label: "Product & design" },
  { key: "admin", label: "Admin & scheduling" },
  { key: "other", label: "Something else" },
] as const;

export const TEAM_LEVELS = [
  {
    key: "member",
    label: "Team member",
    /** Written for the agent, not the settings screen. */
    meaning: "Does the work. Hand over well-defined tasks; do not hand over decisions.",
  },
  {
    key: "manager",
    label: "Manager",
    meaning: "Owns an area. Can be given a problem rather than a task, and can decide within it.",
  },
  {
    key: "executive",
    label: "Owner / executive",
    meaning: "Peer-level. Only hand over things that genuinely need their authority.",
  },
] as const;

export type TeamFunctionKey = (typeof TEAM_FUNCTIONS)[number]["key"];
export type TeamLevelKey = (typeof TEAM_LEVELS)[number]["key"];

const FUNCTION_KEYS = new Set<string>(TEAM_FUNCTIONS.map((f) => f.key));
const LEVEL_KEYS = new Set<string>(TEAM_LEVELS.map((l) => l.key));

export function normalizeFunction(value: unknown): TeamFunctionKey {
  const v = String(value ?? "").trim().toLowerCase();
  return (FUNCTION_KEYS.has(v) ? v : "other") as TeamFunctionKey;
}

export function normalizeLevel(value: unknown): TeamLevelKey {
  const v = String(value ?? "").trim().toLowerCase();
  return (LEVEL_KEYS.has(v) ? v : "member") as TeamLevelKey;
}

export function functionLabel(key: string): string {
  return TEAM_FUNCTIONS.find((f) => f.key === key)?.label ?? "Something else";
}

export function levelLabel(key: string): string {
  return TEAM_LEVELS.find((l) => l.key === key)?.label ?? "Team member";
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string | null;
  function: string;
  functionLabel: string;
  level: string;
  levelLabel: string;
  note: string | null;
}

export async function listTeam(userId: string): Promise<TeamMemberDTO[]> {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: [{ name: "asc" }],
    take: 100,
  });

  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    function: m.function,
    functionLabel: functionLabel(m.function),
    level: m.level,
    levelLabel: levelLabel(m.level),
    note: m.note,
  }));
}

/**
 * Match what the agent wrote against who actually exists.
 *
 * The roster is sent to the assistant when the connection is made, and people
 * leave — so an agent can be working from a name that was accurate a month ago.
 * Accept the obvious spellings of a real person, and let the caller decide what
 * to do about a name that matches nobody.
 */
export function resolveDelegate(input: string, team: TeamMemberDTO[]): TeamMemberDTO | null {
  const q = input.trim().toLowerCase();
  if (!q || team.length === 0) return null;

  const byName = team.find((m) => m.name.toLowerCase() === q);
  if (byName) return byName;

  const byEmail = team.find((m) => m.email && m.email.toLowerCase() === q);
  if (byEmail) return byEmail;

  // "Julie" for "Julie Alvarez" — but not when there are two Julies.
  const byFirstName = team.filter((m) => m.name.toLowerCase().split(/\s+/)[0] === q);
  return byFirstName.length === 1 ? byFirstName[0] : null;
}

/**
 * The roster as the agent should read it: names, what each covers, and how much
 * they can decide without going back to the user.
 */
export function describeTeamForAgent(team: TeamMemberDTO[]): string {
  if (team.length === 0) {
    return "The user has not listed a team, so do not put anything in `delegate` unless the item itself names who it belongs to.";
  }

  const lines = team.map((m) => {
    const level = TEAM_LEVELS.find((l) => l.key === m.level);
    const who = [m.name, m.email ? `<${m.email}>` : null].filter(Boolean).join(" ");
    return `- ${who} — ${m.functionLabel}, ${level?.label ?? "team member"}. ${level?.meaning ?? ""}${m.note ? ` Note: ${m.note}` : ""}`;
  });

  return [
    "The user's team. Put something in `delegate` only when one of these people could genuinely carry it, and name them in `delegateTo`:",
    ...lines,
    "",
    "People join and leave, and this list was written when the connection was made. `get_run_context` returns the current one on every run — treat that as the truth, and if `sync_tasks` reports a name it does not recognise, take the roster it hands back rather than the one above.",
  ].join("\n");
}
