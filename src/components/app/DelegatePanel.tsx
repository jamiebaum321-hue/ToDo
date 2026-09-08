"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import type { TaskDTO } from "@/lib/tasks";
import type { TeamMemberDTO } from "@/lib/team";
import type { LinkPreference } from "@/lib/deeplinks";
import { delegationTarget } from "@/lib/client/delegate";
import { OpenButton } from "./OpenButton";

export function DelegatePanel({ task, team, preference, onDelegate }: {
  task: TaskDTO; team: TeamMemberDTO[]; preference: LinkPreference;
  onDelegate: (task: TaskDTO, to: string | null) => void;
}) {
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamMemberDTO | null>(null);
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [extra, setExtra] = useState<TeamMemberDTO | null>(null);
  const people = [...team, ...(extra ? [extra] : [])];

  return <div className="space-y-3">
    <p className="text-[13px]" style={{ color: "var(--text-2)" }}>Choose a person to open their email. Your task stays here until you have sent it.</p>
    {people.map(person => {
      const member = { ...person, email: emails[person.name] ?? person.email };
      const action = delegationTarget(task, member);
      return action ? <OpenButton key={person.id}
        label={person.name} target={action.target} preference={preference} variant="secondary"
        icon={<Mail className="size-[18px]" />}
        hint={`${member.email} · ${action.saved ? "Saved draft" : "Prefilled email"} in ${action.providerLabel}`}
        onOpened={() => setSelected(person.name)}
      /> : <button key={person.id} type="button" className="w-full rounded-xl border px-3 py-3 text-left font-bold"
        onClick={() => { setEditing(person); setAddress(""); setError(null); }}>
        {person.name} · Add email
      </button>;
    })}
    {selected ? <div className="rounded-xl p-3" style={{ background: "var(--tint-delegate)" }}>
      <p className="mb-2 text-[13px]">Once your email to {selected} is sent:</p>
      <button type="button" className="w-full rounded-xl px-3 py-3 font-bold text-white"
        style={{ background: "var(--accent-delegate)" }} onClick={() => onDelegate(task, selected)}>
        I’ve sent it — mark handed off
      </button>
    </div> : null}
    {editing ? <form className="space-y-2" onSubmit={async event => {
      event.preventDefault();
      setSaving(true); setError(null);
      try {
        const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editing.name, email: address.trim(), function: editing.function, level: editing.level, note: editing.note ?? "" }) });
        if (!response.ok) throw new Error("The address could not be saved. Please try again.");
        setEmails(previous => ({ ...previous, [editing.name]: address.trim() }));
        setEditing(null);
      } catch (err) { setError(err instanceof Error ? err.message : "The address could not be saved."); }
      finally { setSaving(false); }
    }}>
      <label className="block text-[13px]">Email for {editing.name}
        <input autoFocus required type="email" value={address} onChange={e => setAddress(e.target.value)}
          className="mt-1 w-full rounded-xl border px-3 py-2" style={{ color: "var(--text)", background: "var(--card)" }} />
      </label>
      {error ? <p role="alert" className="text-[13px]">{error}</p> : null}
      <button disabled={saving} className="rounded-xl border px-3 py-2 font-bold" type="submit">{saving ? "Saving…" : "Save email"}</button>
    </form> : <form className="space-y-2" onSubmit={e => {
      e.preventDefault();
      const email = other.trim();
      setExtra({ id: `email:${email}`, name: email, email, function: "other", functionLabel: "", level: "member", levelLabel: "", note: null });
      setOther("");
    }}>
      <label className="block text-[13px]">Someone else
        <input type="email" required value={other} onChange={e => setOther(e.target.value)} placeholder="Email address"
          className="mt-1 w-full rounded-xl border px-3 py-2" style={{ color: "var(--text)", background: "var(--card)" }} />
      </label>
      <button className="rounded-xl border px-3 py-2 font-bold" type="submit">Use this person</button>
    </form>}
  </div>;
}
