"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock, FolderInput, Forward, Mail, PenLine, Pin, Trash2, X } from "lucide-react";
import type { TaskDTO } from "@/lib/client/types";
import type { LinkPreference } from "@/lib/deeplinks";
import { relativeLabel } from "@/lib/time";
import { cn, displayName } from "@/lib/utils";
import { bucketVars, BUCKET_ICON, PROVIDER_ICON } from "./icons";
import { OpenButton } from "./OpenButton";
import { BUCKETS } from "@/lib/buckets";
import type { TeamMemberDTO } from "@/lib/team";
import { delegateMailto } from "@/lib/client/delegate";

interface Props {
  task: TaskDTO;
  linkPreference: LinkPreference;
  onClose: () => void;
  onComplete: (task: TaskDTO) => void;
  onSnooze: (task: TaskDTO, until: Date) => void;
  onDelegate: (task: TaskDTO, to: string | null) => void;
  team: TeamMemberDTO[];
  onMove: (task: TaskDTO, bucket: string) => void;
  onPin: (task: TaskDTO) => void;
  onDelete: (task: TaskDTO) => void;
}

const SNOOZE_OPTIONS = [
  { label: "Later today", hours: 4 },
  { label: "Tomorrow", hours: 24 },
  { label: "This weekend", hours: 24 * 3 },
  { label: "Next week", hours: 24 * 7 },
];

export function TaskSheet({
  task,
  linkPreference,
  onClose,
  onComplete,
  onSnooze,
  onDelegate,
  team,
  onMove,
  onPin,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<"none" | "snooze" | "move" | "delegate">("none");
  const [delegateTo, setDelegateTo] = useState(task.delegateTo ?? "");
  /** Whose address we are asking for, and the address itself, plus what we saved. */
  const [askEmail, setAskEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const vars = bucketVars(task.bucket);
  const BucketIcon = BUCKET_ICON[task.bucket] ?? BUCKET_ICON.delete;
  const ProviderIcon = PROVIDER_ICON[task.source.provider ?? "other"] ?? PROVIDER_ICON.other;
  const who = displayName(task.source.from);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (menu === "none" ? onClose : () => setMenu("none"))();
    };
    document.addEventListener("keydown", onKey);
    // Stop the list scrolling underneath the sheet.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menu, onClose]);

  const sourceLink = task.links.find((l) => l.kind === "source") ?? task.links[0] ?? null;
  const extraLinks = task.links.filter((l) => l !== sourceLink && l.kind !== "draft");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade"
        style={{ background: "var(--overlay)", backdropFilter: "blur(3px)" }}
      />

      <div
        className="animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] sm:max-w-[560px] sm:rounded-[var(--radius-sheet)]"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-sheet)" }}
      >
        {/* Grab handle — the affordance that says "this is a sheet". */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full" style={{ background: "var(--line-strong)" }} />
        </div>

        <header className="flex items-start gap-3 px-5 pb-3 pt-4">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold"
            style={{ background: vars.tint, color: vars.accent }}
          >
            <BucketIcon className="size-[13px]" strokeWidth={2.8} />
            {BUCKETS.find((b) => b.key === task.bucket)?.label ?? "Task"}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onPin(task)}
            aria-label={task.pinned ? "Unpin" : "Pin to the top"}
            className="grid size-8 place-items-center rounded-full transition active:scale-90"
            style={{ background: task.pinned ? "var(--bg-alt)" : "transparent", color: "var(--text-3)" }}
          >
            <Pin className={cn("size-4", task.pinned && "rotate-45")} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full transition active:scale-90"
            style={{ background: "var(--bg-alt)", color: "var(--text-2)" }}
          >
            <X className="size-4" strokeWidth={2.8} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <h2 className="text-[22px] font-extrabold leading-[1.22] tracking-tight" style={{ color: "var(--text)" }}>
            {task.title}
          </h2>

          {task.description ? (
            <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>
              {task.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold">
            {task.dueAt ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{
                  background: new Date(task.dueAt) < new Date() ? "var(--accent-urgent)" : "var(--bg-alt)",
                  color: new Date(task.dueAt) < new Date() ? "#fff" : "var(--text-2)",
                }}
              >
                <Clock className="size-[13px]" strokeWidth={2.6} />
                Due {relativeLabel(new Date(task.dueAt))}
              </span>
            ) : null}
            {task.estimateMinutes ? (
              <span className="rounded-full px-2.5 py-1 tabular" style={{ background: "var(--bg-alt)", color: "var(--text-2)" }}>
                ~{task.estimateMinutes} min
              </span>
            ) : null}
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-full px-2.5 py-1" style={{ background: "var(--bg-alt)", color: "var(--text-3)" }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Where it came from ------------------------------------------- */}
          {task.source.provider && task.source.provider !== "manual" ? (
            <div
              className="mt-4 rounded-2xl px-4 py-3"
              style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
            >
              <div className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                <ProviderIcon className="size-[13px]" strokeWidth={2.6} />
                {task.source.chip}
                {task.source.receivedAt ? <span className="font-semibold normal-case tracking-normal">· {relativeLabel(new Date(task.source.receivedAt))}</span> : null}
              </div>
              {who ? (
                <p className="mt-1.5 text-[14px] font-bold" style={{ color: "var(--text)" }}>
                  {who}
                </p>
              ) : null}
              {task.source.subject ? (
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--text-2)" }}>
                  {task.source.subject}
                </p>
              ) : null}
              {task.source.snippet ? (
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                  “{task.source.snippet}”
                </p>
              ) : null}
            </div>
          ) : null}

          {/* The buttons that finish the job ------------------------------ */}
          <div className="mt-4 space-y-2.5">
            {sourceLink ? (
              <OpenButton
                label={sourceLink.label}
                target={{ web: sourceLink.web, desktop: sourceLink.desktop, mobile: sourceLink.mobile }}
                // Outlook blue for Outlook, Gmail red for Gmail. The bucket
                // colour would put a red "danger" button on every urgent task.
                accent={sourceLink.accent}
                preference={linkPreference}
                icon={<ProviderIcon className="size-[18px] shrink-0" strokeWidth={2.4} />}
              />
            ) : null}

            {task.draft ? (
              <div className="space-y-2">
                <OpenButton
                  label={`See your draft in ${task.draft.providerLabel}`}
                  target={{ web: task.draft.web, desktop: task.draft.desktop, mobile: task.draft.mobile }}
                  accent="var(--accent-delegate)"
                  preference={linkPreference}
                  variant="draft"
                  icon={<PenLine className="size-[18px] shrink-0" strokeWidth={2.4} />}
                  hint="Written for you already — read it, then send."
                />
                {task.draft.body ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowDraft((v) => !v)}
                      className="inline-flex items-center gap-1 px-1 text-[13px] font-bold"
                      style={{ color: "var(--text-3)" }}
                    >
                      <ChevronDown className={cn("size-4 transition", showDraft && "rotate-180")} strokeWidth={2.6} />
                      {showDraft ? "Hide the draft" : "Preview the draft"}
                    </button>
                    {showDraft ? (
                      <div
                        className="mt-2 rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed"
                        style={{ background: "var(--bg-alt)", color: "var(--text-2)", border: "1px solid var(--line-2)" }}
                      >
                        {task.draft.subject ? (
                          <p className="mb-1.5 font-bold" style={{ color: "var(--text)" }}>
                            {task.draft.subject}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{task.draft.body}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {extraLinks.map((link) => (
              <OpenButton
                key={link.id}
                label={link.label}
                target={{ web: link.web, desktop: link.desktop, mobile: link.mobile }}
                preference={linkPreference}
                variant="secondary"
              />
            ))}
          </div>

          {task.reason ? (
            <p className="mt-4 px-1 text-[12.5px] italic leading-relaxed" style={{ color: "var(--text-3)" }}>
              Filed here because: {task.reason}
            </p>
          ) : null}

          {/* Sub-menus ---------------------------------------------------- */}
          {menu === "snooze" ? (
            <MenuCard title="Come back to it">
              {SNOOZE_OPTIONS.map((opt) => (
                <MenuRow
                  key={opt.label}
                  onClick={() => {
                    onSnooze(task, new Date(Date.now() + opt.hours * 3600e3));
                    setMenu("none");
                  }}
                >
                  {opt.label}
                </MenuRow>
              ))}
            </MenuCard>
          ) : null}

          {menu === "move" ? (
            <MenuCard title="Move to">
              {BUCKETS.filter((b) => b.key !== task.bucket).map((b) => (
                <MenuRow
                  key={b.key}
                  onClick={() => {
                    onMove(task, b.key);
                    setMenu("none");
                  }}
                >
                  {b.label}
                </MenuRow>
              ))}
            </MenuCard>
          ) : null}

          {menu === "delegate" ? (
            <MenuCard title="Hand it to">
              {/* Your team first — typing a name you already listed is busywork,
                  and a name that matches the roster is one the agent knows.
                  Someone with an email on file gets the full hand-off: the
                  task is marked delegated AND a ready-to-send email opens in
                  the user's own mail client, thread link included. Someone
                  without one gets asked for it here rather than silently
                  doing half the job — the first live team had exactly one
                  member, no address, so "delegate now" opened nothing. */}
              {team.length > 0 ? (
                <>
                  <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                    {team.map((m) => {
                      const member = emails[m.name] ? { ...m, email: emails[m.name] } : m;
                      const mailto = delegateMailto(task, member);
                      const cls = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition active:scale-95";
                      const sty = { background: "var(--tint-delegate)", color: "var(--accent-delegate)" } as const;
                      return mailto ? (
                        <a
                          key={m.id}
                          href={mailto}
                          onClick={() => {
                            onDelegate(task, m.name);
                            setMenu("none");
                          }}
                          className={cls}
                          style={sty}
                        >
                          <Mail className="size-[13px]" strokeWidth={2.6} />
                          {m.name}
                          <span className="ml-0.5 font-semibold opacity-70">{m.functionLabel}</span>
                        </a>
                      ) : (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setAskEmail(askEmail === m.name ? null : m.name);
                            setEmailDraft("");
                          }}
                          className={cls}
                          style={{ ...sty, outline: askEmail === m.name ? "2px solid var(--accent-delegate)" : undefined }}
                        >
                          {m.name}
                          <span className="ml-0.5 font-semibold opacity-70">{m.functionLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {askEmail ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const person = team.find((t) => t.name === askEmail);
                        const address = emailDraft.trim();
                        if (!person || !address) return;
                        setSaving(true);
                        try {
                          // Upserts by name, so this fills the gap on the
                          // roster the agent reads too — not just this sheet.
                          await fetch("/api/team", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: person.name,
                              email: address,
                              function: person.function,
                              level: person.level,
                              note: person.note ?? "",
                            }),
                          });
                          setEmails((prev) => ({ ...prev, [person.name]: address }));
                          const mailto = delegateMailto(task, { ...person, email: address });
                          onDelegate(task, person.name);
                          setAskEmail(null);
                          setMenu("none");
                          if (mailto) window.location.href = mailto;
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="mb-2 px-1"
                    >
                      <p className="pb-1.5 text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                        No email on file for {askEmail}. Add one and the hand-off email opens straight away — it is
                        saved to your team, so next time is one tap.
                      </p>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          type="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder={`email for ${askEmail}`}
                          className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold outline-none"
                          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
                        />
                        <button
                          type="submit"
                          disabled={saving}
                          className="rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
                          style={{ background: "var(--accent-delegate)" }}
                        >
                          {saving ? "Saving…" : "Save & write it"}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const name = askEmail;
                          setAskEmail(null);
                          setMenu("none");
                          onDelegate(task, name);
                        }}
                        className="mt-1.5 text-[12px] font-bold underline underline-offset-2"
                        style={{ color: "var(--text-3)" }}
                      >
                        Just mark it delegated
                      </button>
                    </form>
                  ) : (
                    <p className="mb-2 px-1 text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                      An envelope means they have an email on file — choosing them also drafts the hand-off email for
                      you, with the thread linked.
                    </p>
                  )}
                </>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onDelegate(task, delegateTo.trim() || null);
                  setMenu("none");
                }}
                className="flex gap-2 px-1 pb-1"
              >
                <input
                  value={delegateTo}
                  onChange={(e) => setDelegateTo(e.target.value)}
                  placeholder="Name or email"
                  className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold outline-none"
                  style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
                />
                <button
                  type="submit"
                  className="rounded-xl px-4 py-2.5 text-[14px] font-bold text-white"
                  style={{ background: "var(--accent-delegate)" }}
                >
                  Hand off
                </button>
              </form>
            </MenuCard>
          ) : null}
        </div>

        {/* Action bar. Two tiers, not one squeeze: Done gets the full width
            it deserves, and the four quieter verbs share the row beneath it
            with their names visible — cramming five controls into one line
            left them all too small to hit and too anonymous to learn. */}
        <footer
          className="safe-bottom flex flex-col gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--line)", background: "var(--card-alt)" }}
        >
          <button
            type="button"
            onClick={() => onComplete(task)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.98]"
            style={{ background: "var(--accent-done)" }}
          >
            <Check className="size-[18px]" strokeWidth={3.2} />
            Done
          </button>

          <div className="grid grid-cols-4 gap-2">
            <SheetAction label="Snooze" active={menu === "snooze"} onClick={() => setMenu(menu === "snooze" ? "none" : "snooze")}>
              <Clock className="size-[18px]" strokeWidth={2.5} />
            </SheetAction>
            <SheetAction label="Delegate" active={menu === "delegate"} onClick={() => setMenu(menu === "delegate" ? "none" : "delegate")}>
              <Forward className="size-[18px]" strokeWidth={2.5} />
            </SheetAction>
            <SheetAction label="Move" active={menu === "move"} onClick={() => setMenu(menu === "move" ? "none" : "move")}>
              <FolderInput className="size-[18px]" strokeWidth={2.5} />
            </SheetAction>
            <SheetAction label="Delete" onClick={() => onDelete(task)} danger>
              <Trash2 className="size-[18px]" strokeWidth={2.5} />
            </SheetAction>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SheetAction({
  label,
  children,
  onClick,
  active,
  danger,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 transition active:scale-95"
      style={{
        background: active ? "var(--bg-alt)" : "transparent",
        border: "1px solid var(--line)",
        color: danger ? "var(--accent-urgent)" : "var(--text-2)",
      }}
    >
      {children}
      <span className="text-[11px] font-bold leading-none">{label}</span>
    </button>
  );
}

function MenuCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-rise mt-4 rounded-2xl p-2" style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}>
      <p className="px-2 pb-1 pt-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function MenuRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl px-3 py-2.5 text-left text-[14.5px] font-bold transition hover:opacity-70"
      style={{ color: "var(--text)" }}
    >
      {children}
    </button>
  );
}
