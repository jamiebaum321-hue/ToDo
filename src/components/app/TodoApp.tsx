"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Columns3, Plus, RefreshCw, Rows3, Search, Sparkles, X } from "lucide-react";
import type { BoardPayload } from "@/lib/client/types";
import { BUCKETS } from "@/lib/buckets";
import { relativeLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TodoProvider, useTodo } from "@/hooks/useTodo";
import { MobileHeader, PageShell } from "./Shell";
import { TaskList, EmptyState } from "./TaskList";
import { BucketBoard } from "./BucketBoard";
import { TaskSheet } from "./TaskSheet";
import { Toasts } from "./Toasts";
import { QuickAdd } from "./QuickAdd";
import { ServiceWorkerRegistrar } from "./ServiceWorker";
import { NativeBridge } from "./NativeBridge";
import { InstallPrompt } from "./InstallPrompt";
import { bucketVars, BUCKET_ICON } from "./icons";
import { Logo } from "@/components/Logo";

export function TodoApp({ initial }: { initial: BoardPayload }) {
  return (
    <TodoProvider initial={initial}>
      <Board />
      <Toasts />
      <ServiceWorkerRegistrar />
      <NativeBridge />
    </TodoProvider>
  );
}

type View = "focus" | "board";

function Board() {
  const { board, tasks, counts, selected, select, act, removeTask, refresh, loading } = useTodo();
  const params = useSearchParams();

  const [view, setView] = useState<View>((board?.settings.defaultView as View) ?? "focus");
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // A notification tap arrives as /?task=<id> — open straight to that card.
  useEffect(() => {
    const id = params.get("task");
    if (id) select(id);
  }, [params, select]);

  const settings = board?.settings;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => (showDone ? t.status !== "open" : t.status === "open"))
      .filter((t) => (filter ? t.bucket === filter : true))
      .filter((t) =>
        q
          ? [t.title, t.description, t.source.subject, t.source.from].some((v) => v?.toLowerCase().includes(q))
          : true,
      );
  }, [tasks, filter, query, showDone]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <PageShell counts={counts} wide={view === "board"}>
      <MobileHeader
        subtitle={total > 0 ? `${total} waiting · ${today}` : today}
        right={
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add a task"
            className="grid size-10 shrink-0 place-items-center rounded-full text-white transition active:scale-90"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            <Plus className="size-5" strokeWidth={3} />
          </button>
        }
      />

      {/* Desktop title row */}
      <div className="mb-5 hidden items-end justify-between lg:flex">
        <div>
          <h1 className="text-[27px] font-extrabold leading-none tracking-tight" style={{ color: "var(--text)" }}>
            {showDone ? "Cleared" : total > 0 ? "Today" : "All clear"}
          </h1>
          <p className="mt-2 text-[13.5px] font-semibold" style={{ color: "var(--text-3)" }}>
            {today}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98]"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          <Plus className="size-[17px]" strokeWidth={3} />
          Add a task
        </button>
      </div>

      {/* Last run strip — proof the loop is working. */}
      {board?.lastRun && !showDone ? <LastRunStrip run={board.lastRun} onRefresh={refresh} busy={loading} /> : null}

      {/* Controls */}
      <div className="mb-4 flex items-center gap-2">
        <div className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-0.5">
          <Chip active={filter === null} onClick={() => setFilter(null)} count={total}>
            All
          </Chip>
          {BUCKETS.map((b) => {
            const vars = bucketVars(b.key);
            const Icon = BUCKET_ICON[b.key];
            return (
              <Chip
                key={b.key}
                active={filter === b.key}
                onClick={() => setFilter(filter === b.key ? null : b.key)}
                count={counts[b.key] ?? 0}
                accent={vars.accent}
                tint={vars.tint}
                icon={<Icon className="size-[13px]" strokeWidth={2.8} />}
              >
                {b.short}
              </Chip>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSearching((v) => !v)}
          aria-label="Search"
          className="grid size-9 shrink-0 place-items-center rounded-xl transition active:scale-90"
          style={{ background: searching ? "var(--bg-alt)" : "transparent", border: "1px solid var(--line)", color: "var(--text-2)" }}
        >
          <Search className="size-4" strokeWidth={2.6} />
        </button>

        <button
          type="button"
          onClick={() => setView(view === "focus" ? "board" : "focus")}
          aria-label={view === "focus" ? "Switch to the board" : "Switch to the list"}
          className="hidden size-9 shrink-0 place-items-center rounded-xl transition active:scale-90 sm:grid"
          style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
        >
          {view === "focus" ? <Columns3 className="size-4" strokeWidth={2.6} /> : <Rows3 className="size-4" strokeWidth={2.6} />}
        </button>
      </div>

      {searching ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--bg-alt)", border: "1px solid var(--line)" }}>
          <Search className="size-4 shrink-0" strokeWidth={2.6} style={{ color: "var(--text-3)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, people, subjects…"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold outline-none"
            style={{ color: "var(--text)" }}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear" style={{ color: "var(--text-3)" }}>
              <X className="size-4" strokeWidth={2.8} />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* The list */}
      {visible.length === 0 && total === 0 && !showDone ? (
        <FirstRunEmpty hasEverSynced={Boolean(board?.lastRun)} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={query ? "No match" : showDone ? "Nothing cleared yet" : "This one is empty"}
          body={query ? "Try a different word." : showDone ? "Things you finish will collect here." : "Nothing in this bucket right now."}
        />
      ) : view === "board" && !showDone ? (
        <BucketBoard tasks={visible} showReason={settings?.showReasons ?? true} />
      ) : (
        <TaskList tasks={visible} showReason={settings?.showReasons ?? true} />
      )}

      {/* Done toggle */}
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="rounded-full px-4 py-2 text-[13px] font-bold transition"
          style={{ background: "var(--bg-alt)", color: "var(--text-3)" }}
        >
          {showDone ? "Back to the list" : "See what you cleared"}
        </button>
      </div>

      {selected ? (
        <TaskSheet
          task={selected}
          linkPreference={settings?.linkPreference ?? "auto"}
          onClose={() => select(null)}
          onComplete={(t) => act(t, t.status === "open" ? "complete" : "reopen")}
          onSnooze={(t, until) => act(t, "snooze", { until: until.toISOString() })}
          onDelegate={(t, to) => act(t, "delegate", { to })}
          onMove={(t, bucket) => act(t, "move", { bucket })}
          onPin={(t) => act(t, "pin")}
          onDelete={(t) => removeTask(t)}
        />
      ) : null}

      <QuickAdd open={adding} onClose={() => setAdding(false)} />
      <InstallPrompt hidden={Boolean(selected) || adding} />
    </PageShell>
  );
}

function Chip({
  children,
  active,
  onClick,
  count,
  accent,
  tint,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
  accent?: string;
  tint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-extrabold transition active:scale-95"
      style={{
        background: active ? (tint ?? "var(--text)") : "transparent",
        color: active ? (accent ?? "var(--bg)") : "var(--text-3)",
        border: `1.5px solid ${active ? (accent ?? "var(--text)") : "var(--line)"}`,
      }}
    >
      {icon}
      {children}
      <span className="tabular opacity-70">{count}</span>
    </button>
  );
}

function LastRunStrip({
  run,
  onRefresh,
  busy,
}: {
  run: NonNullable<BoardPayload["lastRun"]>;
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="mb-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
      style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
    >
      <Sparkles className="size-4 shrink-0" strokeWidth={2.6} style={{ color: "var(--accent-quick)" }} />
      <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug" style={{ color: "var(--text-3)" }}>
        <span style={{ color: "var(--text-2)" }}>{run.client ?? "Your assistant"}</span> swept{" "}
        {relativeLabel(new Date(run.at))} · {run.created} added
        {run.removed > 0 ? `, ${run.removed} cleared` : ""}
        {run.skipped > 0 ? (
          <>
            ,{" "}
            <span title="Items it tried to raise again that you had already handled">
              {run.skipped} skipped as already done
            </span>
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh"
        className="grid size-7 shrink-0 place-items-center rounded-lg transition active:scale-90"
        style={{ color: "var(--text-3)" }}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} strokeWidth={2.8} />
      </button>
    </div>
  );
}

/** Before the first sync there is nothing to show, so show the way in instead. */
function FirstRunEmpty({ hasEverSynced }: { hasEverSynced: boolean }) {
  if (hasEverSynced) return <EmptyState />;

  return (
    <div className="rounded-[var(--radius-card)] px-6 py-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <div className="mx-auto w-fit">
        <Logo size={104} />
      </div>
      <h3 className="mt-5 text-[20px] font-extrabold" style={{ color: "var(--text)" }}>
        Your list is empty — for now
      </h3>
      <p className="mx-auto mt-2 max-w-[40ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        Connect Claude or ChatGPT and it will read your mail, calendar and chat, then fill this in every morning with
        what actually needs you.
      </p>
      <Link
        href="/connect"
        className="mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-extrabold transition active:scale-[0.98]"
        style={{ background: "var(--text)", color: "var(--bg)" }}
      >
        Connect your assistant
      </Link>
    </div>
  );
}
