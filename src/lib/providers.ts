/**
 * Everything the app knows about the places a task can come from.
 *
 * The agent supplies whatever URLs its own connector gave it (Graph `webLink`,
 * a Gmail thread id, a Teams message permalink). We keep those verbatim and
 * only *derive* the missing ones — an explicit URL from the agent always wins,
 * because it is the one that came from the real API.
 */

export type ProviderKey =
  | "outlook"
  | "gmail"
  | "teams"
  | "slack"
  | "zoom"
  | "google_calendar"
  | "outlook_calendar"
  | "notion"
  | "linear"
  | "jira"
  | "asana"
  | "github"
  | "manual"
  | "other";

export interface ProviderMeta {
  key: ProviderKey;
  /** What the button says: "Open in Outlook". */
  label: string;
  /** Brand colour used for the small source chip. */
  accent: string;
  /** Short word for the chip, e.g. "Outlook". */
  chip: string;
}

export const PROVIDERS: Record<ProviderKey, ProviderMeta> = {
  outlook: { key: "outlook", label: "Outlook", accent: "#0F6CBD", chip: "Outlook" },
  gmail: { key: "gmail", label: "Gmail", accent: "#EA4335", chip: "Gmail" },
  teams: { key: "teams", label: "Teams", accent: "#5059C9", chip: "Teams" },
  slack: { key: "slack", label: "Slack", accent: "#4A154B", chip: "Slack" },
  zoom: { key: "zoom", label: "Zoom", accent: "#2D8CFF", chip: "Zoom" },
  google_calendar: { key: "google_calendar", label: "Google Calendar", accent: "#1A73E8", chip: "Calendar" },
  outlook_calendar: { key: "outlook_calendar", label: "Outlook Calendar", accent: "#0F6CBD", chip: "Calendar" },
  notion: { key: "notion", label: "Notion", accent: "#111111", chip: "Notion" },
  linear: { key: "linear", label: "Linear", accent: "#5E6AD2", chip: "Linear" },
  jira: { key: "jira", label: "Jira", accent: "#0052CC", chip: "Jira" },
  asana: { key: "asana", label: "Asana", accent: "#F06A6A", chip: "Asana" },
  github: { key: "github", label: "GitHub", accent: "#24292F", chip: "GitHub" },
  manual: { key: "manual", label: "ToDo", accent: "#0E0E0C", chip: "Added by you" },
  other: { key: "other", label: "Source", accent: "#7C776A", chip: "Source" },
};

const PROVIDER_ALIASES: Record<string, ProviderKey> = {
  outlook: "outlook",
  office365: "outlook",
  o365: "outlook",
  microsoft: "outlook",
  microsoft365: "outlook",
  m365: "outlook",
  exchange: "outlook",
  mail: "outlook",
  gmail: "gmail",
  google: "gmail",
  googlemail: "gmail",
  teams: "teams",
  msteams: "teams",
  "microsoft teams": "teams",
  slack: "slack",
  zoom: "zoom",
  gcal: "google_calendar",
  google_calendar: "google_calendar",
  googlecalendar: "google_calendar",
  "google calendar": "google_calendar",
  calendar: "outlook_calendar",
  outlook_calendar: "outlook_calendar",
  outlookcalendar: "outlook_calendar",
  notion: "notion",
  linear: "linear",
  jira: "jira",
  atlassian: "jira",
  asana: "asana",
  github: "github",
  manual: "manual",
  user: "manual",
};

export function normalizeProvider(input: unknown): ProviderKey {
  if (typeof input !== "string") return "other";
  const lower = input.trim().toLowerCase();

  // Agents write the same provider half a dozen ways — "Microsoft 365",
  // "microsoft_365", "MS-Teams". Try the obvious spellings before giving up,
  // since falling through to "other" silently costs the task its deep link.
  const candidates = [
    lower,
    lower.replace(/[\s-]+/g, "_"),
    lower.replace(/[_-]+/g, " "),
    lower.replace(/[^a-z0-9]/g, ""),
  ];
  for (const candidate of candidates) {
    const hit = PROVIDER_ALIASES[candidate];
    if (hit) return hit;
  }
  return "other";
}

export function providerMeta(input: unknown): ProviderMeta {
  return PROVIDERS[normalizeProvider(input)];
}
