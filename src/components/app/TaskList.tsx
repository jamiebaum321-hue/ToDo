"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import type { TaskDTO } from "@/lib/client/types";
import { BUCKETS } from "@/lib/buckets";
import { Logo } from "@/components/Logo";
import { TaskCard } from "./TaskCard";
import { bucketVars, BUCKET_ICON } from "./icons";
import { useTodo } from "@/hooks/useTodo";

/** The focus view: everything in one column, in the order you should work it. */
export function TaskList({ tasks, showReason }: { tasks: TaskDTO[]; showReason: boolean }) {
  const { select, act } = useTodo();

  const groups = useMemo(
    () =>
      BUCKETS.map((bucket) => ({
        bucket,
        items: tasks.filter((t) => t.bucket === bucket.key),
      })).filter((g) => g.items.length > 0),
    [tasks],
  );

  if (!tasks.length) return <EmptyState />;

  return (
    <div className="space-y-7">
      {groups.map(({ bucket, items }) => {
        const vars = bucketVars(bucket.key);
        const Icon = BUCKET_ICON[bucket.key];
        return (
          <section key={bucket.key}>
            <header className="mb-2.5 flex items-baseline gap-2.5 px-1">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wider" style={{ color: vars.accent }}>
                <Icon className="size-[14px]" strokeWidth={2.8} />
                {bucket.label}
              </span>
              <span className="tabular text-[13px] font-bold" style={{ color: "var(--text-3)" }}>
                {items.length}
              </span>
            </header>
            <ul className="space-y-2">
              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  showReason={showReason}
                  onOpen={(t) => select(t.id)}
                  onComplete={(t) => act(t, t.status === "open" ? "complete" : "reopen")}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title = "Nothing waiting on you",
  body = "When your assistant runs its sweep, whatever needs you will land here.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <Logo size={92} className="opacity-90" />
      <h3 className="mt-5 text-[19px] font-extrabold" style={{ color: "var(--text)" }}>
        {title}
      </h3>
      <p className="mt-1.5 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        {body}
      </p>
      <span className="mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold" style={{ background: "var(--bg-alt)", color: "var(--text-3)" }}>
        <Sparkles className="size-3.5" strokeWidth={2.6} />
        Inbox zero
      </span>
    </div>
  );
}
