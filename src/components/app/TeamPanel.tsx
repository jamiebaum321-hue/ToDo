"use client";

import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { TEAM_FUNCTIONS, TEAM_LEVELS, type TeamMemberDTO } from "@/lib/team";

/**
 * Who work can be handed to.
 *
 * This is not an address book — it is what makes the `delegate` bucket mean
 * something. An assistant that knows Julie runs marketing and can decide inside
 * it will file "book the venue" to her; one that knows nobody can only say
 * "someone else could do this", which is not a decision anyone can act on.
 * The roster goes out with every run, so what is typed here changes what the
 * agent writes.
 */
export function TeamPanel({ initial }: { initial: TeamMemberDTO[] }) {
  const [team, setTeam] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fn, setFn] = useState<string>("operations");
  const [level, setLevel] = useState<string>("member");
  const [note, setNote] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setFn("operations");
    setLevel("member");
    setNote("");
    setError(null);
  };

  const add = async () => {
    if (!name.trim()) return setError("They need a name.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, function: fn, level, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not save.");
      setTeam(body.team);
      setAdding(false);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setTeam((await res.json()).team);
  };

  return (
    <section
      className="mb-4 rounded-[var(--radius-card)] p-4 sm:p-5"
      style={{ background: "var(--card)", border: "1px solid var(--line)" }}
    >
      <h2 className="flex items-center gap-2 text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
        <Users className="size-[17px]" strokeWidth={2.4} />
        Your team
      </h2>
      <p className="mb-3 mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        Who your assistant is allowed to hand work to. It reads this on every run, so someone listed here can be named
        on a task in the Delegate bucket — and with nobody listed, it will not put anything there.
      </p>

      {team.length > 0 ? (
        <ul className="mb-3 space-y-1.5">
          {team.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
              style={{ background: "var(--bg-alt)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold" style={{ color: "var(--text)" }}>
                  {m.name}
                  {m.email ? (
                    <span className="ml-2 font-semibold" style={{ color: "var(--text-3)" }}>
                      {m.email}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[12.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                  {m.functionLabel} · {m.levelLabel}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                aria-label={`Remove ${m.name}`}
                className="shrink-0 rounded-lg p-2 transition active:scale-90"
                style={{ color: "var(--accent-urgent)" }}
              >
                <Trash2 className="size-4" strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-xl px-3.5 py-3 text-[13px]" style={{ background: "var(--bg-alt)", color: "var(--text-3)" }}>
          Nobody yet. Until you add someone, your assistant has nowhere to hand work to.
        </p>
      )}

      {adding ? (
        <div className="space-y-2.5 rounded-xl p-3.5" style={{ background: "var(--bg-alt)" }}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Name" value={name} onChange={setName} placeholder="Julie Alvarez" autoFocus />
            <Field label="Email (optional)" value={email} onChange={setEmail} placeholder="julie@company.com" type="email" />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Select label="What they look after" value={fn} onChange={setFn} options={TEAM_FUNCTIONS.map((f) => ({ value: f.key, label: f.label }))} />
            <Select label="How much they decide" value={level} onChange={setLevel} options={TEAM_LEVELS.map((l) => ({ value: l.key, label: l.label }))} />
          </div>

          <Field
            label="Anything the agent should know (optional)"
            value={note}
            onChange={setNote}
            placeholder="Runs the Larchmont studio"
          />

          {error ? (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--accent-urgent)" }}>
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={busy}
              className="rounded-xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-60"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              {busy ? "Saving…" : "Add to the team"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                reset();
              }}
              className="rounded-xl px-4 py-2.5 text-[14px] font-bold"
              style={{ color: "var(--text-3)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--text)" }}
        >
          <Plus className="size-[16px]" strokeWidth={3} />
          Add someone
        </button>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-2.5 text-[14.5px] font-semibold outline-none"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-2.5 text-[14.5px] font-semibold outline-none"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
