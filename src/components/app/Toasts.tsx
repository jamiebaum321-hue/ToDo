"use client";

import { Undo2, X } from "lucide-react";
import { useTodo } from "@/hooks/useTodo";
import { Doodle } from "@/components/Doodle";

/**
 * Anchored above the tab bar on mobile and bottom-left on desktop, so it never
 * covers the thing you just tapped.
 */
export function Toasts() {
  const { toasts, dismissToast } = useTodo();
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:items-start"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-rise pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl px-4 py-3 shadow-[var(--shadow-lift)]"
          style={{
            background: toast.tone === "error" ? "var(--accent-urgent)" : "var(--text)",
            color: toast.tone === "error" ? "#fff" : "var(--bg)",
          }}
        >
          {toast.tone !== "error" ? (
            <Doodle name="okay-hand" className="anim-pop shrink-0" style={{ width: 25, height: 26 }} />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                dismissToast(toast.id);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-extrabold"
              style={{ background: "rgba(255,255,255,.16)" }}
            >
              <Undo2 className="size-3.5" strokeWidth={3} />
              Undo
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 transition hover:opacity-100"
          >
            <X className="size-4" strokeWidth={3} />
          </button>
        </div>
      ))}
    </div>
  );
}
