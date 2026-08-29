"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
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
import { Doodle } from "@/components/Doodle";

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

function Board() {
  const { board, tasks, counts, selected, select, act, removeTask, refresh, loading } = useTodo();
  const params = useSearchParams();

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

  // There is no view toggle: the view follows the chips. "All" is the board —
  // the shape of the whole week — and narrowing to one bucket is a list,
  // because a single column of columns is just a list wearing a costume.
  // Cleared items read as a flat list too; done work has no pipeline.
  const boardView = filter === null && !showDone;

  return (
    <PageShell counts={counts} wide={boardView}>
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
        <div className="flex items-center gap-3">
          <Doodle name={showDone ? "my-tasks-2" : "today"} size={38} style={{ color: "var(--text-2)" }} />
          <div>
          <h1 className="text-[27px] font-extrabold leading-none tracking-tight" style={{ color: "var(--text)" }}>
            {showDone ? "Cleared" : total > 0 ? "Today" : "All clear"}
          </h1>
          <p className="mt-2 text-[13.5px] font-semibold" style={{ color: "var(--text-3)" }}>
            {today}
          </p>
          </div>
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
          <Chip active={filter === null} dimmed={filter !== null} onClick={() => setFilter(null)} count={total}>
            All
          </Chip>
          {BUCKETS.map((b) => {
            const vars = bucketVars(b.key);
            const Icon = BUCKET_ICON[b.key];
            return (
              <Chip
                key={b.key}
                active={filter === b.key}
                dimmed={filter !== null && filter !== b.key}
                onClick={() => setFilter(filter === b.key ? null : b.key)}
                count={counts[b.key] ?? 0}
                accent={vars.accent}
                tint={vars.tint}
                icon={<Icon className="size-[13px]" strokeWidth={2.8} />}
              >
                {/* The full label, the same words the columns and the sheet
                    use. Two names for one bucket just makes people wonder
                    whether they are looking at the same thing. */}
                {b.label}
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

      {/* Home is the board; a chip is a zoom. Keying on the filter remounts
          this container, so the board fades into the bucket's list and back
          instead of hard-cutting — and the chips above keep every bucket's
          real count visible, just dimmed, so a glance never reads as
          "everything else is empty". A search keeps whichever view is up:
          on the board the matches stay sorted into their columns. */}
      <div key={`${filter ?? "all"}:${showDone ? "done" : "open"}:${query ? "q" : ""}`} className="fade-swap">
        {visible.length === 0 && total === 0 && !showDone ? (
          <FirstRunEmpty connected={(board?.connections ?? 0) > 0} hasEverSynced={Boolean(board?.lastRun)} />
        ) : visible.length === 0 ? (
          <EmptyState
            doodle={query ? "search" : "my-tasks-2"}
            title={query ? "No match" : showDone ? "Nothing cleared yet" : "This one is empty"}
            body={query ? "Try a different word." : showDone ? "Things you finish will collect here." : "Nothing in this bucket right now."}
          />
        ) : boardView ? (
          <BucketBoard tasks={visible} showReason={settings?.showReasons ?? true} />
        ) : (
          <TaskList tasks={visible} showReason={settings?.showReasons ?? true} />
        )}
      </div>

      {/* Done toggle */}
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="rounded-full px-4 py-2 text-[13px] font-bold transition"
          style={{ background: "var(--bg-alt)", color: "var(--text-3)" }}
        >
          {showDone ? "Back to your tasks" : "See what you cleared"}
        </button>
      </div>

      {selected ? (
        <TaskSheet
          task={selected}
          linkPreference={settings?.linkPreference ?? "auto"}
          team={board?.team ?? []}
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
  dimmed,
  onClick,
  count,
  accent,
  tint,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  /** A filter is on and it is not this one. Fade, but keep the count readable. */
  dimmed?: boolean;
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-extrabold transition-all duration-300 active:scale-95"
      style={{
        background: active ? (tint ?? "var(--text)") : "transparent",
        color: active ? (accent ?? "var(--bg)") : "var(--text-3)",
        border: `1.5px solid ${active ? (accent ?? "var(--text)") : "var(--line)"}`,
        opacity: dimmed ? 0.5 : 1,
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
/**
 * Three genuinely different empty lists, and telling them apart matters: being
 * told to go and connect an assistant you connected a minute ago reads as the
 * app not having noticed.
 */
function FirstRunEmpty({ connected, hasEverSynced }: { connected: boolean; hasEverSynced: boolean }) {
  if (hasEverSynced) return <EmptyState />;

  return (
    <div className="rounded-[var(--radius-card)] px-6 py-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <div className="mx-auto w-fit">
        <Logo size={104} />
      </div>
      <h3 className="mt-5 text-[20px] font-extrabold" style={{ color: "var(--text)" }}>
        {connected ? "Connected — nothing swept yet" : "Your list is empty — for now"}
      </h3>
      <p className="mx-auto mt-2 max-w-[40ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        {connected
          ? "Your assistant can reach this list. Ask it to sweep your mail and calendar now, or set the morning run and it will fill this in by itself."
          : "Connect Claude or ChatGPT and it will read your mail, calendar and chat, then fill this in every morning with what actually needs you."}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        {/* The squiggle arrow from the brand set, pointing at the one thing
            worth doing on an empty first run. */}
        <Doodle
          name="over-here"
          className="anim-wave hidden sm:block"
          style={{ width: 84, height: 46, color: "var(--text-3)" }}
        />
        <Link
          href="/connect"
          className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-extrabold transition active:scale-[0.98]"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          {connected ? "Set the morning run" : "Connect your assistant"}
        </Link>
      </div>
    </div>
  );
}
