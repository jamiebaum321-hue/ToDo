/**
 * The four buckets every task lands in.
 *
 * This is the Eisenhower split the agent is told to use: urgency on one axis,
 * whether it actually matters on the other. "delete" is a real bucket, not a
 * bin — the agent puts things there so you can confirm they can go, which is
 * how the noise gets cleared instead of quietly ignored.
 */
export const BUCKETS = [
  {
    key: "urgent_important",
    label: "Urgent & Important",
    short: "Do now",
    blurb: "Time-sensitive and it is yours to do. Start at the top.",
    /** Bright red — the only bucket allowed to shout. */
    accent: "#D8402F",
    accentSoft: "#FDECE9",
    accentSoftDark: "#33110D",
    icon: "flame",
    order: 0,
  },
  {
    key: "urgent_not_priority",
    label: "Urgent, not priority",
    short: "Quick hits",
    blurb: "Deadlines that are real but small. Batch them.",
    accent: "#C4801A",
    accentSoft: "#FBF1DF",
    accentSoftDark: "#2E2109",
    icon: "zap",
    order: 1,
  },
  {
    key: "delegate",
    label: "Delegate",
    short: "Hand off",
    blurb: "Someone else can carry this. Send it and move on.",
    accent: "#2C7BB8",
    accentSoft: "#E6F1F9",
    accentSoftDark: "#0C1F2E",
    icon: "forward",
    order: 2,
  },
  {
    key: "delete",
    label: "Delete",
    short: "Drop it",
    blurb: "No action needed. Confirm and it is gone for good.",
    accent: "#7C776A",
    accentSoft: "#F0EEE8",
    accentSoftDark: "#22211D",
    icon: "trash",
    order: 3,
  },
] as const;

export type BucketKey = (typeof BUCKETS)[number]["key"];
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_KEYS = BUCKETS.map((b) => b.key) as BucketKey[];

const BY_KEY = new Map<string, Bucket>(BUCKETS.map((b) => [b.key, b]));

export function getBucket(key: string): Bucket {
  return BY_KEY.get(key) ?? BUCKETS[3];
}

export function isBucketKey(key: unknown): key is BucketKey {
  return typeof key === "string" && BY_KEY.has(key);
}

/**
 * The agent sometimes phrases buckets in its own words. Rather than reject the
 * whole batch over wording, map the common variants onto the real key.
 */
const ALIASES: Record<string, BucketKey> = {
  // urgent + important
  urgent_important: "urgent_important",
  "urgent-important": "urgent_important",
  "urgent and important": "urgent_important",
  urgentimportant: "urgent_important",
  important_urgent: "urgent_important",
  do: "urgent_important",
  do_now: "urgent_important",
  q1: "urgent_important",
  critical: "urgent_important",
  // urgent, not priority
  urgent_not_priority: "urgent_not_priority",
  "urgent-not-priority": "urgent_not_priority",
  "urgent not priority": "urgent_not_priority",
  "urgent not important": "urgent_not_priority",
  urgent_not_important: "urgent_not_priority",
  not_priority: "urgent_not_priority",
  schedule: "urgent_not_priority",
  q2: "urgent_not_priority",
  quick: "urgent_not_priority",
  // delegate
  delegate: "delegate",
  delegated: "delegate",
  handoff: "delegate",
  hand_off: "delegate",
  assign: "delegate",
  q3: "delegate",
  // delete
  delete: "delete",
  deleted: "delete",
  drop: "delete",
  discard: "delete",
  ignore: "delete",
  archive: "delete",
  q4: "delete",
};

export function normalizeBucket(input: unknown, fallback: BucketKey = "urgent_not_priority"): BucketKey {
  if (typeof input !== "string") return fallback;
  const key = input.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[key] ?? ALIASES[key.replace(/ /g, "_")] ?? fallback;
}
