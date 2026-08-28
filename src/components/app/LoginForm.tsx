"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BUCKETS } from "@/lib/buckets";
import { bucketVars } from "./icons";

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "setup">(firstRun ? "setup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "setup" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "setup"
            ? {
                email,
                password,
                name: name || undefined,
                // The browser knows the timezone; the digest depends on it.
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }
            : { email, password },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "That did not work.");
      router.replace(mode === "setup" ? "/connect" : "/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]" style={{ background: "var(--bg)" }}>
      {/* Brand side */}
      <section className="relative hidden flex-col justify-center px-14 lg:flex" style={{ background: "var(--bg-alt)" }}>
        <Logo size={128} priority />
        <h1 className="mt-8 max-w-[13ch] text-[52px] font-extrabold leading-[0.98] tracking-tight" style={{ color: "var(--text)" }}>
          Everything you owe someone.
        </h1>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          Your Claude or ChatGPT subscription reads every inbox, calendar and chat you have connected, then files what is
          left into four buckets — and each one is a single tap from done.
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

      {/* Form side */}
      <section className="flex items-center justify-center px-5 py-12">
        <form onSubmit={submit} className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Logo size={96} priority />
            <h1 className="mt-4 text-[28px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
              ToDo
            </h1>
            <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
              Agent-filled task inbox
            </p>
          </div>

          <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            {mode === "setup" ? "Set up your ToDo" : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
            {mode === "setup" ? "One account, yours. This closes once it is made." : "Sign in to pick up your list."}
          </p>

          <div className="mt-6 space-y-2.5">
            {mode === "setup" ? (
              <Field label="Your name" value={name} onChange={setName} placeholder="Jamie" autoComplete="name" />
            ) : null}
            <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@work.com" autoComplete="email" required />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder={mode === "setup" ? "At least 8 characters" : "••••••••"}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              required
            />
          </div>

          {error ? (
            <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold" style={{ background: "var(--tint-urgent)", color: "var(--accent-urgent)" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15.5px] font-extrabold transition active:scale-[0.99] disabled:opacity-50"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            {busy ? <Loader2 className="size-[18px] animate-spin" strokeWidth={2.8} /> : null}
            {mode === "setup" ? "Create my ToDo" : "Sign in"}
            {!busy ? <ArrowRight className="size-[18px]" strokeWidth={3} /> : null}
          </button>

          {!firstRun ? null : (
            <button
              type="button"
              onClick={() => setMode(mode === "setup" ? "signin" : "setup")}
              className="mt-4 w-full text-[13.5px] font-bold underline underline-offset-4"
              style={{ color: "var(--text-3)" }}
            >
              {mode === "setup" ? "I already have an account" : "Set up a new ToDo"}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
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
        className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold outline-none transition"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
      />
    </label>
  );
}
