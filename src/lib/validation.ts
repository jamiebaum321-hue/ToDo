import { z } from "zod";
import { createHash } from "node:crypto";
import { normalizeBucket } from "./buckets";
import { normalizeProvider } from "./providers";

/** Accepts an ISO string, an epoch number, or a Date. Rejects nonsense. */
export const isoDate = z
  .union([z.string(), z.number(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v).trim());
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Not a valid date" });
      return z.NEVER;
    }
    return d;
  });

export const linkInput = z
  .object({
    kind: z.enum(["source", "draft", "join", "calendar", "file", "custom"]).default("source"),
    label: z.string().trim().min(1).max(80).optional(),
    provider: z.string().trim().max(40).optional(),
    /** `url` is a friendlier alias for `web` — agents reach for it constantly. */
    url: z.string().trim().max(2000).optional(),
    web: z.string().trim().max(2000).optional(),
    desktop: z.string().trim().max(2000).optional(),
    mobile: z.string().trim().max(2000).optional(),
    externalId: z.string().trim().max(400).optional(),
    messageId: z.string().trim().max(400).optional(),
    accountIndex: z.number().int().min(0).max(9).optional(),
    passcode: z.string().trim().max(64).optional(),
    primary: z.boolean().optional(),
  })
  .transform((l) => ({ ...l, web: l.web ?? l.url }));

export const draftInput = z.object({
  provider: z.string().trim().max(40).optional(),
  kind: z.enum(["reply", "reply_all", "forward", "new"]).default("reply"),
  subject: z.string().trim().max(300).optional(),
  body: z.string().max(8000).optional(),
  externalId: z.string().trim().max(400).optional(),
  url: z.string().trim().max(2000).optional(),
  web: z.string().trim().max(2000).optional(),
  desktop: z.string().trim().max(2000).optional(),
  mobile: z.string().trim().max(2000).optional(),
});

export const sourceInput = z.object({
  provider: z.string().trim().max(40).optional(),
  type: z.string().trim().max(40).optional(),
  externalId: z.string().trim().max(400).optional(),
  /** RFC-822 Message-ID. The most durable id an email can give us. */
  messageId: z.string().trim().max(400).optional(),
  account: z.string().trim().max(160).optional(),
  from: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(400).optional(),
  snippet: z.string().trim().max(1200).optional(),
  receivedAt: isoDate.optional(),
  accountIndex: z.number().int().min(0).max(9).optional(),
  url: z.string().trim().max(2000).optional(),
  webUrl: z.string().trim().max(2000).optional(),
  desktopUrl: z.string().trim().max(2000).optional(),
  mobileUrl: z.string().trim().max(2000).optional(),
});

export const taskInput = z.object({
  sourceKey: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  bucket: z.string().trim().max(60),
  reason: z.string().trim().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  dueAt: isoDate.nullish(),
  estimateMinutes: z.number().int().min(1).max(6000).optional(),
  delegateTo: z.string().trim().max(160).optional(),
  position: z.number().int().min(0).max(10000).optional(),
  pinned: z.boolean().optional(),
  source: sourceInput.optional(),
  links: z.array(linkInput).max(8).optional(),
  draft: draftInput.optional(),
});

export type TaskInput = z.infer<typeof taskInput>;
/** The shape callers send, before Zod coerces dates. Use this for literals. */
export type TaskInputRaw = z.input<typeof taskInput>;

export const syncInput = z.object({
  tasks: z.array(taskInput).max(300),
  /**
   * "window" is the one the daily run wants: whatever the agent did not re-send
   * this run gets cleared out, so the list is genuinely rewritten rather than
   * endlessly appended to. Pinned tasks and anything you added yourself survive.
   */
  replace: z.enum(["window", "none"]).default("window"),
  windowDays: z.number().int().min(1).max(365).optional(),
  runId: z.string().trim().max(60).optional(),
  client: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(2000).optional(),
  /** Preview the outcome without writing anything. */
  dryRun: z.boolean().default(false),
  /** Recreate tasks even if you already cleared them. Use sparingly. */
  force: z.boolean().default(false),
  /** Push a notification once the new list is in. */
  notify: z.boolean().optional(),
});

export type SyncInput = z.infer<typeof syncInput>;

/**
 * Every task needs a stable identity so the same email does not become five
 * tasks over five days. Preference order:
 *   1. what the agent explicitly set
 *   2. provider + external id  (the real thing)
 *   3. provider + RFC-822 message id
 *   4. a hash of the normalised title, so even id-less tasks dedupe sanely
 */
export function deriveSourceKey(input: TaskInput): string {
  if (input.sourceKey) return input.sourceKey.slice(0, 300);

  const provider = normalizeProvider(input.source?.provider);
  const type = (input.source?.type ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const externalId = input.source?.externalId?.trim();
  if (externalId) return `${provider}:${type || "item"}:${externalId}`.slice(0, 300);

  const messageId = input.source?.messageId?.trim();
  if (messageId) return `${provider}:msgid:${messageId.replace(/[<>]/g, "")}`.slice(0, 300);

  const normalizedTitle = input.title.toLowerCase().replace(/\s+/g, " ").trim();
  const hash = createHash("sha1").update(`${provider}|${normalizedTitle}`).digest("hex").slice(0, 16);
  return `agent:title:${hash}`;
}

/** Normalises the loose shape agents send into exactly what the DB wants. */
export function normalizeTaskInput(input: TaskInput) {
  return {
    ...input,
    bucket: normalizeBucket(input.bucket),
    sourceKey: deriveSourceKey(input),
    provider: normalizeProvider(input.source?.provider),
  };
}

export const updateTaskInput = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(4000).nullish(),
  bucket: z.string().trim().max(60).optional(),
  status: z.enum(["open", "completed", "dismissed", "snoozed", "delegated"]).optional(),
  reason: z.string().trim().max(500).nullish(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  dueAt: isoDate.nullish(),
  snoozedUntil: isoDate.nullish(),
  estimateMinutes: z.number().int().min(1).max(6000).nullish(),
  delegateTo: z.string().trim().max(160).nullish(),
  pinned: z.boolean().optional(),
  position: z.number().int().min(0).max(10000).optional(),
  note: z.string().trim().max(500).optional(),
});

export const settingsInput = z.object({
  rollingWindowDays: z.number().int().min(1).max(365).optional(),
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  digestEnabled: z.boolean().optional(),
  urgentPushEnabled: z.boolean().optional(),
  remindersEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  linkPreference: z.enum(["auto", "app", "web"]).optional(),
  showDrafts: z.boolean().optional(),
  requestDrafts: z.boolean().optional(),
  showReasons: z.boolean().optional(),
  autoArchiveDays: z.number().int().min(0).max(365).optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  defaultView: z.enum(["focus", "board", "list"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

/** Turn a ZodError into something an agent can act on rather than guess at. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ")
    .slice(0, 1000);
}
