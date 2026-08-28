import type { TeamMemberDTO } from "../team";
import type { TaskDTO } from "@/lib/tasks";

export type { TaskDTO } from "@/lib/tasks";
export type { TaskLinkDTO } from "@/lib/tasks";

export interface BucketInfo {
  key: string;
  label: string;
  short: string;
  blurb: string;
  accent: string;
}

export interface LastRun {
  at: string;
  client: string | null;
  created: number;
  removed: number;
  skipped: number;
  summary: string | null;
}

export interface BoardPayload {
  tasks: TaskDTO[];
  counts: Record<string, number>;
  buckets: BucketInfo[];
  settings: {
    linkPreference: "auto" | "app" | "web";
    showDrafts: boolean;
    showReasons: boolean;
    defaultView: "focus" | "board" | "list";
    theme: "system" | "light" | "dark";
  };
  user: { name: string | null; email: string; timezone: string };
  lastRun: LastRun | null;
  /** Live connection tokens, OAuth ones included. Zero means nothing is wired up. */
  connections: number;
  /** Who work can be handed to. Drives the delegate picker. */
  team: TeamMemberDTO[];
}

export type TaskAction = "complete" | "reopen" | "dismiss" | "snooze" | "delegate" | "pin" | "move";
