"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BUCKETS } from "@/lib/buckets";
import { bucketVars } from "./icons";

/** The split layout every auth screen sits in: brand on the left, form on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]" style={{ background: "var(--bg)" }}>
      <section className="relative hidden flex-col justify-center px-14 lg:flex" style={{ background: "var(--bg-alt)" }}>
        <Link href="/">
          <Logo size={128} priority />
        </Link>
        <h1 className="mt-8 max-w-[13ch] text-[52px] font-extrabold leading-[0.98] tracking-tight" style={{ color: "var(--text)" }}>
          Everything you owe someone.
        </h1>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          Your Claude or ChatGPT subscription reads every inbox, calendar and chat you have connected, then files what
          is left into four buckets — and each one is a single tap from done.
        </p>

        <ul className="mt-9 space-y-2.5">
          {BUCKETS.map((b) => {
            const vars = bucketVars(b.key);
            return (
              <li key={b.key} className="flex items-baseline gap-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: vars.accent }} />
                <span className="text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
                  {b.label}
                </span>
                <span className="text-[14px]" style={{ color: "var(--text-3)" }}>
                  {b.blurb}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Logo size={88} priority />
            <p className="mt-3 text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
              ToDo
            </p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[12px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold outline-none transition"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
      />
      {hint ? (
        <span className="mt-1 block px-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Alert({ tone, children }: { tone: "error" | "ok" | "info"; children: React.ReactNode }) {
  const style =
    tone === "error"
      ? { background: "var(--tint-urgent)", color: "var(--accent-urgent)" }
      : tone === "ok"
        ? { background: "var(--tint-done)", color: "var(--accent-done)" }
        : { background: "var(--bg-alt)", color: "var(--text-2)" };

  return (
    <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold leading-relaxed" style={style} role="status">
      {children}
    </p>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15.5px] font-extrabold transition active:scale-[0.99] disabled:opacity-50"
      style={{ background: "var(--text)", color: "var(--bg)" }}
    >
      {busy ? (
        <span className="size-[18px] animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

export async function postJson<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "That did not work."), { data, status: res.status });
  return data as T;
}
