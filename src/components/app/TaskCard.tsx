"use client";

import { memo } from "react";
import { Check, Clock, PenLine, Pin } from "lucide-react";
import type { TaskDTO } from "@/lib/client/types";
import { relativeLabel } from "@/lib/time";
import { displayName } from "@/lib/utils";
import { bucketVars, PROVIDER_ICON } from "./icons";
import { cn } from "@/lib/utils";

interface Props {
  task: TaskDTO;
  showReason: boolean;
  onOpen: (task: TaskDTO) => void;
  onComplete: (task: TaskDTO) => void;
}

/**
 * One line of the list. The whole card opens the detail; only the circle
 * completes, so a thumb reaching for "done" never opens a sheet by mistake.
 */
export const TaskCard = memo(function TaskCard({ task, showReason, onOpen, onComplete }: Props) {
  const vars = bucketVars(task.bucket);
  const ProviderIcon = PROVIDER_ICON[task.source.provider ?? "other"] ?? PROVIDER_ICON.other;
  const done = task.status !== "open" && task.status !== "snoozed";
  const overdue = task.dueAt ? new Date(task.dueAt).getTime() < Date.now() : false;
  const who = displayName(task.source.from);

  return (
    <li
      className={cn(
        "group relative animate-rise overflow-hidden rounded-[var(--radius-card)] transition",
        done && "task-done opacity-55",
      )}
      style={{ background: "var(--card)", border: "1px solid var(--line)", boxShadow: "var(--shadow-card)" }}
    >
      {/* Bucket stripe: colour tells you which pile it is without reading. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3.5px]" style={{ background: vars.accent }} />

      <div className="flex items-start gap-3 py-3.5 pl-4 pr-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onComplete(task);
          }}
          aria-label={done ? `Put "${task.title}" back on the list` : `Mark "${task.title}" done`}
          aria-pressed={done}
          className={cn(
            "mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-full border-2 transition active:scale-90",
            done && "animate-pop",
          )}
          style={{
            borderColor: done ? "var(--accent-done)" : "var(--line-strong)",
            background: done ? "var(--accent-done)" : "transparent",
          }}
        >
          <Check
            className={cn("size-[15px] transition", done ? "text-white opacity-100" : "opacity-0 group-hover:opacity-25")}
            strokeWidth={3.4}
          />
        </button>

        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <div className="flex items-start gap-2">
            <h3 className="task-title relative min-w-0 flex-1 text-[15.5px] font-bold leading-snug" style={{ color: "var(--text)" }}>
              {task.title}
            </h3>
            {task.pinned ? (
              <Pin className="mt-1 size-3.5 shrink-0 rotate-45" strokeWidth={2.6} style={{ color: "var(--text-3)" }} />
            ) : null}
          </div>

          {showReason && task.reason ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug" style={{ color: "var(--text-3)" }}>
              {task.reason}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] font-semibold">
            {task.source.provider && task.source.provider !== "manual" ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                <ProviderIcon className="size-[13px]" strokeWidth={2.4} />
                <span className="max-w-[15ch] truncate">{who ?? task.source.chip}</span>
              </span>
            ) : null}

            {task.dueAt ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  color: overdue ? "#fff" : "var(--text-2)",
                  background: overdue ? "var(--accent-urgent)" : "var(--bg-alt)",
                }}
              >
                <Clock className="size-[12px]" strokeWidth={2.6} />
                {relativeLabel(new Date(task.dueAt))}
              </span>
            ) : null}

            {task.estimateMinutes ? (
              <span className="tabular" style={{ color: "var(--text-3)" }}>
                {task.estimateMinutes}m
              </span>
            ) : null}

            {task.delegateTo ? (
              <span className="max-w-[18ch] truncate" style={{ color: "var(--accent-delegate)" }}>
                → {task.delegateTo}
              </span>
            ) : null}

            {task.draft ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ color: "var(--accent-delegate)", background: "var(--tint-delegate)" }}
              >
                <PenLine className="size-[12px]" strokeWidth={2.6} />
                Draft ready
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </li>
  );
});
