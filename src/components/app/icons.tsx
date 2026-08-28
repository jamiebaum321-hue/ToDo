import {
  Calendar,
  CircleDot,
  FileText,
  Flame,
  Forward,
  Github,
  Mail,
  MessageSquare,
  Trash2,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const BUCKET_ICON: Record<string, LucideIcon> = {
  urgent_important: Flame,
  urgent_not_priority: Zap,
  delegate: Forward,
  delete: Trash2,
};

export const PROVIDER_ICON: Record<string, LucideIcon> = {
  outlook: Mail,
  gmail: Mail,
  teams: MessageSquare,
  slack: MessageSquare,
  zoom: Video,
  google_calendar: Calendar,
  outlook_calendar: Calendar,
  notion: FileText,
  linear: CircleDot,
  jira: CircleDot,
  asana: CircleDot,
  github: Github,
  manual: CircleDot,
  other: CircleDot,
};

/** CSS variables per bucket, so the accent follows the theme. */
export const BUCKET_VARS: Record<string, { accent: string; tint: string }> = {
  urgent_important: { accent: "var(--accent-urgent)", tint: "var(--tint-urgent)" },
  urgent_not_priority: { accent: "var(--accent-quick)", tint: "var(--tint-quick)" },
  delegate: { accent: "var(--accent-delegate)", tint: "var(--tint-delegate)" },
  delete: { accent: "var(--accent-drop)", tint: "var(--tint-drop)" },
};

export function bucketVars(key: string) {
  return BUCKET_VARS[key] ?? BUCKET_VARS.delete;
}
