import type { Prisma, Task } from "@prisma/client";
import { prisma } from "./db";
import { normalizeBucket } from "./buckets";
import { normalizeProvider } from "./providers";
import { deriveLinkTarget, defaultLabel, hasAnyUrl } from "./deeplinks";
import { listTeam, resolveDelegate, type TeamMemberDTO } from "./team";
import { SUPPRESSION_REASON, suppressionMap } from "./suppression";
import { stringifyTags } from "./tasks";
import { deriveSourceKey, type SyncInput, type TaskInput } from "./validation";

export interface SyncSkipped {
  sourceKey: string;
  title: string;
  action: string;
  reason: string;
  handledAt: string;
}

export interface SyncResult {
  runId: string | null;
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  skipped: number;
  /** The whole point: what the app refused to recreate, and why. */
  skippedTasks: SyncSkipped[];
  removedTasks: { id: string; title: string; bucket: string }[];
  /**
   * Tasks handed to somebody who is not on the roster any more. Reported rather
   * than rejected — the name may be a real person outside the team, and losing
   * a genuine task over a stale name would be the worse failure.
   */
  unknownDelegates: { title: string; delegateTo: string }[];
  createdTasks: { id: string; title: string; bucket: string }[];
  counts: Record<string, number>;
  message: string;
}

/** Build the link rows for a task, deriving whatever URLs we can. */
function buildLinkRows(input: TaskInput): Prisma.TaskLinkCreateWithoutTaskInput[] {
  const rows: Prisma.TaskLinkCreateWithoutTaskInput[] = [];
  const source = input.source;
  const sourceProvider = normalizeProvider(source?.provider);

  // The headline button. Even when the agent sends no `links` at all, if it gave
  // us a message id or a URL we can still put "Open in Outlook" on the card —
  // which is the single most important control in the whole app.
  if (source) {
    const target = deriveLinkTarget({
      provider: sourceProvider,
      externalId: source.externalId,
      messageId: source.messageId,
      threadId: source.threadId,
      account: source.account,
      accountIndex: source.accountIndex,
      kind: source.type ?? "message",
      web: source.webUrl ?? source.url,
      desktop: source.desktopUrl,
      mobile: source.mobileUrl,
    });
    if (hasAnyUrl(target)) {
      rows.push({
        kind: "source",
        label: defaultLabel(sourceProvider, "source"),
        provider: sourceProvider,
        webUrl: target.web ?? null,
        desktopUrl: target.desktop ?? null,
        mobileUrl: target.mobile ?? null,
        isPrimary: true,
        position: 0,
      });
    }
  }

  for (const [i, link] of (input.links ?? []).entries()) {
    const provider = normalizeProvider(link.provider ?? source?.provider);
    const target = deriveLinkTarget({
      provider,
      externalId: link.externalId,
      messageId: link.messageId,
      threadId: link.threadId ?? source?.threadId,
      account: link.account ?? source?.account,
      accountIndex: link.accountIndex ?? source?.accountIndex,
      passcode: link.passcode,
      kind: link.kind === "draft" ? "draft" : link.kind === "calendar" ? "event" : "message",
      web: link.web,
      desktop: link.desktop,
      mobile: link.mobile,
    });
    if (!hasAnyUrl(target)) continue;

    // Skip a duplicate of the source button we already added.
    if (rows.length > 0 && rows[0].webUrl && rows[0].webUrl === target.web && link.kind === "source") continue;

    rows.push({
      kind: link.kind,
      label: link.label ?? defaultLabel(provider, link.kind),
      provider,
      webUrl: target.web ?? null,
      desktopUrl: target.desktop ?? null,
      mobileUrl: target.mobile ?? null,
      isPrimary: link.primary ?? rows.length === 0,
      position: i + 1,
    });
  }

  return rows;
}

function buildDraftRow(input: TaskInput): Prisma.DraftCreateWithoutTaskInput | null {
  const d = input.draft;
  if (!d) return null;
  const provider = normalizeProvider(d.provider ?? input.source?.provider);
  const target = deriveLinkTarget({
    provider,
    externalId: d.externalId,
    account: input.source?.account,
    accountIndex: input.source?.accountIndex,
    kind: "draft",
    web: d.web ?? d.url,
    desktop: d.desktop,
    mobile: d.mobile,
  });
  if (!hasAnyUrl(target) && !d.body) return null;

  return {
    provider,
    kind: d.kind,
    subject: d.subject ?? null,
    body: d.body ?? null,
    externalId: d.externalId ?? null,
    webUrl: target.web ?? null,
    desktopUrl: target.desktop ?? null,
    mobileUrl: target.mobile ?? null,
  };
}

function taskFields(input: TaskInput, runId: string | null, team: TeamMemberDTO[] = []) {
  const source = input.source;
  return {
    title: input.title,
    description: input.description ?? null,
    bucket: normalizeBucket(input.bucket),
    reason: input.reason ?? null,
    confidence: input.confidence ?? null,
    tags: stringifyTags(input.tags ?? []),
    dueAt: input.dueAt ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    // "julie" and "julie@company.com" both mean Julie Alvarez; store the name
    // she is actually listed under so the app and the agent agree.
    delegateTo: input.delegateTo ? (resolveDelegate(input.delegateTo, team)?.name ?? input.delegateTo) : null,
    sourceProvider: normalizeProvider(source?.provider),
    sourceType: source?.type ?? null,
    sourceExternalId: source?.externalId ?? source?.messageId ?? null,
    sourceAccount: source?.account ?? null,
    sourceFrom: source?.from ?? null,
    sourceSubject: source?.subject ?? null,
    sourceSnippet: source?.snippet ?? null,
    sourceReceivedAt: source?.receivedAt ?? null,
    lastRunId: runId,
  };
}

/** Did anything the user would actually notice change? */
function isUnchanged(existing: Task, fields: ReturnType<typeof taskFields>): boolean {
  return (
    existing.title === fields.title &&
    (existing.description ?? null) === fields.description &&
    existing.bucket === fields.bucket &&
    (existing.reason ?? null) === fields.reason &&
    (existing.dueAt?.getTime() ?? null) === (fields.dueAt?.getTime() ?? null) &&
    (existing.delegateTo ?? null) === fields.delegateTo &&
    existing.tags === fields.tags
  );
}

/**
 * Write the agent's list.
 *
 * The contract with the agent is: send everything you think I should do in the
 * window; anything you leave out is assumed stale and cleared; anything I have
 * already handled is refused and reported back to you so you stop suggesting it.
 */
export async function syncTasks(
  userId: string,
  input: SyncInput,
  ctx: { tokenId?: string | null; source?: string; client?: string | null } = {},
): Promise<SyncResult> {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  const windowDays = input.windowDays ?? settings?.rollingWindowDays ?? 14;

  // Read fresh on every run, never from what the agent was told at connect
  // time — hiring and leaving is exactly the thing that goes stale.
  const team = await listTeam(userId);

  const suppressed: Awaited<ReturnType<typeof suppressionMap>> = input.force
    ? new Map()
    : await suppressionMap(userId);

  const run = input.dryRun
    ? null
    : await prisma.agentRun.create({
        data: {
          userId,
          tokenId: ctx.tokenId ?? null,
          source: ctx.source ?? "api",
          client: input.client ?? ctx.client ?? null,
          status: "running",
          windowDays,
          summary: input.summary ?? null,
        },
      });
  const runId = run?.id ?? null;
  const runStartedAt = run?.startedAt ?? new Date();

  const result: SyncResult = {
    runId,
    dryRun: input.dryRun,
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
    skippedTasks: [],
    removedTasks: [],
    unknownDelegates: [],
    createdTasks: [],
    counts: {},
    message: "",
  };

  const seenKeys = new Set<string>();

  for (const raw of input.tasks) {
    const sourceKey = deriveSourceKey(raw);

    // Two entries in one batch pointing at the same message: keep the first.
    if (seenKeys.has(sourceKey)) continue;
    seenKeys.add(sourceKey);

    const block = suppressed.get(sourceKey);
    if (block) {
      result.skipped += 1;
      result.skippedTasks.push({
        sourceKey,
        title: raw.title,
        action: block.action,
        reason: SUPPRESSION_REASON[block.action] ?? "already handled in the ToDo app",
        handledAt: block.at.toISOString(),
      });
      continue;
    }

    const fields = taskFields(raw, runId, team);

    // The instructions the assistant is holding were written when it connected,
    // so a name on them can be someone who has since left.
    if (raw.delegateTo && team.length > 0 && !resolveDelegate(raw.delegateTo, team)) {
      result.unknownDelegates.push({ title: raw.title, delegateTo: raw.delegateTo });
    }
    const links = buildLinkRows(raw);
    const draft = buildDraftRow(raw);

    const existing = await prisma.task.findUnique({ where: { userId_sourceKey: { userId, sourceKey } } });

    if (input.dryRun) {
      if (!existing) {
        result.created += 1;
        result.createdTasks.push({ id: "(dry-run)", title: fields.title, bucket: fields.bucket });
      } else if (isUnchanged(existing, fields)) {
        result.unchanged += 1;
      } else {
        result.updated += 1;
      }
      result.counts[fields.bucket] = (result.counts[fields.bucket] ?? 0) + 1;
      continue;
    }

    if (!existing) {
      const created = await prisma.task.create({
        data: {
          userId,
          sourceKey,
          origin: "agent",
          status: "open",
          pinned: raw.pinned ?? false,
          position: raw.position ?? 0,
          ...fields,
          links: links.length ? { create: links } : undefined,
          draft: draft ? { create: draft } : undefined,
        },
      });
      result.created += 1;
      result.createdTasks.push({ id: created.id, title: created.title, bucket: created.bucket });
      await prisma.taskEvent.create({
        data: { userId, taskId: created.id, type: "created", actor: "agent", payload: JSON.stringify({ runId, sourceKey }) },
      });
    } else {
      const unchanged = isUnchanged(existing, fields);

      // A snooze that has run out is fair game again. Anything you completed or
      // dismissed stays that way — the suppression check above normally catches
      // it, and this is the belt to that braces.
      const snoozeExpired =
        existing.status === "snoozed" && existing.snoozedUntil !== null && existing.snoozedUntil <= new Date();
      const nextStatus =
        existing.status === "completed" || existing.status === "dismissed"
          ? existing.status
          : snoozeExpired
            ? "open"
            : existing.status;

      await prisma.$transaction([
        prisma.taskLink.deleteMany({ where: { taskId: existing.id } }),
        prisma.task.update({
          where: { id: existing.id },
          data: {
            ...fields,
            status: nextStatus,
            snoozedUntil: snoozeExpired ? null : existing.snoozedUntil,
            // Pinning and manual ordering belong to you, not the agent.
            position: raw.position ?? existing.position,
            links: links.length ? { create: links } : undefined,
          },
        }),
        ...(draft
          ? [
              prisma.draft.upsert({
                where: { taskId: existing.id },
                create: { taskId: existing.id, ...draft },
                update: draft,
              }),
            ]
          : []),
      ]);

      if (unchanged) result.unchanged += 1;
      else result.updated += 1;
    }

    result.counts[fields.bucket] = (result.counts[fields.bucket] ?? 0) + 1;
  }

  // ---- clear out last run's list -------------------------------------------
  if (input.replace === "window" && !input.dryRun && runId) {
    const stale = await prisma.task.findMany({
      where: {
        userId,
        origin: "agent",
        status: "open",
        pinned: false,
        createdAt: { lt: runStartedAt },
        NOT: { lastRunId: runId },
      },
      select: { id: true, title: true, bucket: true, sourceKey: true },
    });

    if (stale.length) {
      // The event is written with a null taskId on purpose: the task row is about
      // to disappear and events cascade with it, and this record is the only
      // trace of what this morning's run cleared.
      await prisma.taskEvent.createMany({
        data: stale.map((t) => ({
          userId,
          taskId: null,
          type: "removed_by_run",
          actor: "agent",
          payload: JSON.stringify({ runId, task: t }),
        })),
      });
      await prisma.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
      result.removed = stale.length;
      result.removedTasks = stale.map((t) => ({ id: t.id, title: t.title, bucket: t.bucket }));
    }
  }

  const parts = [
    `${result.created} added`,
    `${result.updated} updated`,
    `${result.unchanged} unchanged`,
    `${result.removed} cleared`,
  ];
  if (result.skipped > 0) parts.push(`${result.skipped} skipped (already handled)`);
  result.message = parts.join(", ") + ".";

  if (result.unknownDelegates.length > 0) {
    const names = [...new Set(result.unknownDelegates.map((d) => d.delegateTo))];
    result.message +=
      ` ${result.unknownDelegates.length} task(s) were handed to someone not on the user's team (${names.join(", ")}).` +
      ` The team is now: ${team.map((m) => m.name).join(", ") || "empty"}.` +
      " Use those names, or leave delegateTo out.";
  }

  if (run) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        createdCount: result.created,
        updatedCount: result.updated,
        unchangedCount: result.unchanged,
        removedCount: result.removed,
        skippedCount: result.skipped,
        skippedDetail: result.skippedTasks.length ? JSON.stringify(result.skippedTasks) : null,
      },
    });
  }

  return result;
}
