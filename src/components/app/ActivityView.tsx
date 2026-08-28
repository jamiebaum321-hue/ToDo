"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck, Sparkles } from "lucide-react";
import { relativeLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { MobileHeader, PageShell } from "./Shell";
import { EmptyState } from "./TaskList";

interface Run {
  id: string;
  at: string;
  client: string | null;
  source: string;
  status: string;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
  summary: string | null;
  skippedDetail: { title: string; reason: string }[];
}

interface Handled {
  sourceKey: string;
  title: string | null;
  action: string;
  at: string;
}

const ACTION_LABEL: Record<string, string> = {
  completed: "Done",
  dismissed: "Dismissed",
  delegated: "Handed off",
  snoozed: "Snoozed",
  not_relevant: "Not relevant",
};

export function ActivityView({
  counts,
  runs,
  handled,
}: {
  counts: Record<string, number>;
  runs: Run[];
  handled: Handled[];
}) {
  const [tab, setTab] = useState<"runs" | "handled">("runs");

  return (
    <PageShell counts={counts}>
      <MobileHeader subtitle="Activity" />

      <div className="mb-5 hidden lg:block">
        <h1 className="text-[27px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          Activity
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          Every sweep your assistant has run, and everything it has been told not to raise again.
        </p>
      </div>

      <div className="mb-4 flex gap-1.5">
        <Tab active={tab === "runs"} onClick={() => setTab("runs")}>
          Runs
        </Tab>
        <Tab active={tab === "handled"} onClick={() => setTab("handled")}>
          Already handled
          {handled.length ? <span className="tabular ml-1.5 opacity-70">{handled.length}</span> : null}
        </Tab>
      </div>

      {tab === "runs" ? (
        runs.length ? (
          <ul className="space-y-2.5">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No runs yet"
            body="Once your assistant sweeps your connectors, each run shows up here with what it changed."
          />
        )
      ) : handled.length ? (
        <>
          <p className="mb-3 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "var(--tint-done)", color: "var(--text-2)" }}>
            <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} style={{ color: "var(--accent-done)" }} />
            <span>
              These are the items you have cleared. Your assistant reads this list before every run, so an email you
              never replied to will not come back as a task just because it is still sitting in your inbox.
            </span>
          </p>
          <ul className="space-y-1.5">
            {handled.map((h) => (
              <li
                key={h.sourceKey}
                className="flex items-center gap-3 rounded-xl px-3.5 py-3"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold" style={{ color: "var(--text)" }}>
                    {h.title ?? h.sourceKey}
                  </p>
                  <p className="truncate text-[12px] font-semibold" style={{ color: "var(--text-3)" }}>
                    {h.sourceKey}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold"
                  style={{ background: "var(--bg-alt)", color: "var(--text-2)" }}
                >
                  {ACTION_LABEL[h.action] ?? h.action}
                </span>
                <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                  {relativeLabel(new Date(h.at))}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="Nothing cleared yet"
          body="As you tick things off, they land here — and your assistant stops suggesting them."
        />
      )}
    </PageShell>
  );
}

function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const hasDetail = run.skippedDetail.length > 0 || Boolean(run.summary);

  return (
    <li className="rounded-[var(--radius-card)] p-4" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-quick)", color: "var(--accent-quick)" }}>
          <Sparkles className="size-4" strokeWidth={2.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-extrabold" style={{ color: "var(--text)" }}>
            {run.client ?? "Your assistant"}
            <span className="ml-2 text-[12.5px] font-semibold" style={{ color: "var(--text-3)" }}>
              {relativeLabel(new Date(run.at))}
            </span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] font-bold">
            <Stat value={run.created} label="added" tone="var(--accent-done)" />
            <Stat value={run.updated} label="updated" />
            <Stat value={run.removed} label="cleared" />
            {run.skipped > 0 ? <Stat value={run.skipped} label="skipped as done" tone="var(--accent-delegate)" /> : null}
          </div>
        </div>
        {hasDetail ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Hide detail" : "Show detail"}
            className="grid size-8 shrink-0 place-items-center rounded-lg"
            style={{ color: "var(--text-3)" }}
          >
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} strokeWidth={2.8} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line-2)" }}>
          {run.summary ? (
            <p className="mb-2 text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
              {run.summary}
            </p>
          ) : null}
          {run.skippedDetail.length ? (
            <>
              <p className="mb-1.5 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Refused — you had already handled these
              </p>
              <ul className="space-y-1">
                {run.skippedDetail.map((s, i) => (
                  <li key={i} className="text-[13px]" style={{ color: "var(--text-2)" }}>
                    <span className="font-bold">{s.title}</span>{" "}
                    <span style={{ color: "var(--text-3)" }}>— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span style={{ color: tone ?? "var(--text-3)" }}>
      <span className="tabular">{value}</span> {label}
    </span>
  );
}

function Tab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-2 text-[13px] font-extrabold transition"
      style={{
        background: active ? "var(--text)" : "transparent",
        color: active ? "var(--bg)" : "var(--text-3)",
        border: `1.5px solid ${active ? "var(--text)" : "var(--line)"}`,
      }}
    >
      {children}
    </button>
  );
}
