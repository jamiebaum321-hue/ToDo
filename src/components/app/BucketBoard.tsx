"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { TaskDTO } from "@/lib/client/types";
import { BUCKETS } from "@/lib/buckets";
import { TaskCard } from "./TaskCard";
import { bucketVars, BUCKET_ICON } from "./icons";
import { useTodo } from "@/hooks/useTodo";

/**
 * The home view: four columns on a wide screen, four stacked sections on a
 * phone. The board shows the shape of the whole week; tapping a bucket chip
 * above it zooms into that bucket as a plain list, and "All" zooms back out.
 */
export function BucketBoard({ tasks, showReason }: { tasks: TaskDTO[]; showReason: boolean }) {
  const { select, act, clearBucket } = useTodo();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {BUCKETS.map((bucket) => {
        const items = tasks.filter((t) => t.bucket === bucket.key);
        const vars = bucketVars(bucket.key);
        const Icon = BUCKET_ICON[bucket.key];
        const canClear = bucket.key === "delete" && items.length > 0;

        return (
          <section
            key={bucket.key}
            className="flex min-h-[180px] flex-col rounded-[var(--radius-card)] p-3"
            style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
          >
            <header className="mb-3 flex items-start gap-2 px-1 pt-1">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: vars.tint, color: vars.accent }}>
                <Icon className="size-[15px]" strokeWidth={2.8} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-extrabold leading-tight" style={{ color: "var(--text)" }}>
                  {bucket.label}
                </h2>
                <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--text-3)" }}>
                  {bucket.blurb}
                </p>
              </div>
              <span className="tabular shrink-0 rounded-full px-2 py-0.5 text-[12px] font-extrabold" style={{ background: "var(--card)", color: "var(--text-2)" }}>
                {items.length}
              </span>
            </header>

            {items.length ? (
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
            ) : (
              <p className="px-1 py-6 text-center text-[13px] font-semibold" style={{ color: "var(--text-3)" }}>
                Empty
              </p>
            )}

            {canClear ? (
              <button
                type="button"
                onClick={() => {
                  if (confirming === bucket.key) {
                    clearBucket(bucket.key);
                    setConfirming(null);
                  } else {
                    setConfirming(bucket.key);
                    setTimeout(() => setConfirming((c) => (c === bucket.key ? null : c)), 4000);
                  }
                }}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-extrabold transition"
                style={{
                  background: confirming === bucket.key ? "var(--accent-urgent)" : "transparent",
                  color: confirming === bucket.key ? "#fff" : "var(--text-3)",
                  border: `1px solid ${confirming === bucket.key ? "var(--accent-urgent)" : "var(--line)"}`,
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={2.6} />
                {confirming === bucket.key ? `Yes — clear all ${items.length}` : "Clear them all"}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
