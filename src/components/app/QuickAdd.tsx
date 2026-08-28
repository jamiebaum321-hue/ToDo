"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { BUCKETS } from "@/lib/buckets";
import { bucketVars } from "./icons";
import { useTodo } from "@/hooks/useTodo";

/** For the things the agent could not have known about — said out loud, in a corridor. */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createTask } = useTodo();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bucket, setBucket] = useState<string>("urgent_important");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
    else {
      setTitle("");
      setDescription("");
      setBucket("urgent_important");
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask({ title: title.trim(), description: description.trim() || undefined, bucket });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade" style={{ background: "var(--overlay)" }} />

      <form
        onSubmit={submit}
        className="animate-sheet relative w-full rounded-t-[var(--radius-sheet)] p-5 sm:max-w-[500px] sm:rounded-[var(--radius-sheet)]"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-sheet)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold" style={{ color: "var(--text)" }}>
            Add a task
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full" style={{ background: "var(--bg-alt)", color: "var(--text-2)" }}>
            <X className="size-4" strokeWidth={2.8} />
          </button>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          maxLength={300}
          className="w-full rounded-2xl px-4 py-3.5 text-[16px] font-bold outline-none"
          style={{ background: "var(--bg-alt)", border: "1px solid var(--line)", color: "var(--text)" }}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any detail worth remembering (optional)"
          rows={2}
          maxLength={4000}
          className="mt-2.5 w-full resize-none rounded-2xl px-4 py-3 text-[14.5px] outline-none"
          style={{ background: "var(--bg-alt)", border: "1px solid var(--line)", color: "var(--text-2)" }}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {BUCKETS.map((b) => {
            const vars = bucketVars(b.key);
            const active = bucket === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setBucket(b.key)}
                className="rounded-full px-3 py-2 text-[13px] font-extrabold transition"
                style={{
                  background: active ? vars.tint : "transparent",
                  color: active ? vars.accent : "var(--text-3)",
                  border: `1.5px solid ${active ? vars.accent : "var(--line)"}`,
                }}
              >
                {b.short}
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={!title.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.99] disabled:opacity-40"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          <Plus className="size-[18px]" strokeWidth={3} />
          Add it
        </button>
      </form>
    </div>
  );
}
