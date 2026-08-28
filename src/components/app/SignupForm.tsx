"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MailCheck } from "lucide-react";
import { Alert, AuthShell, Field, SubmitButton, postJson } from "./AuthShell";

export function SignupForm({ firstRun }: { firstRun: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ pending: boolean; mailUnconfigured?: boolean }>("/api/auth/register", {
        email,
        password,
        name: name || undefined,
        // The browser knows the timezone, and the morning digest depends on it.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (res.pending) {
        setSent(true);
      } else {
        router.replace("/connect");
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message ?? "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl" style={{ background: "var(--tint-done)", color: "var(--accent-done)" }}>
            <MailCheck className="size-7" strokeWidth={2.6} />
          </div>
          <h2 className="mt-5 text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            Check your email
          </h2>
          <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            We sent a confirmation link to <span style={{ color: "var(--text-2)" }}>{email}</span>. Click it and your
            ToDo is ready. The link expires in 24 hours.
          </p>
          <Link href="/login" className="mt-6 inline-block text-[13.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-3)" }}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          {firstRun ? "Set up your ToDo" : "Create your account"}
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
          {firstRun ? "This is a fresh install — the first account is yours." : "Free, and takes about a minute."}
        </p>

        <div className="mt-6 space-y-2.5">
          <Field label="Your name" value={name} onChange={setName} placeholder="Jamie" autoComplete="name" autoFocus />
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@work.com" autoComplete="email" required />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="At least 10 characters"
            autoComplete="new-password"
            required
            hint="Length matters more than punctuation. A short phrase beats a mangled word."
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <SubmitButton busy={busy}>
          Create my ToDo
          {!busy ? <ArrowRight className="size-[18px]" strokeWidth={3} /> : null}
        </SubmitButton>

        <p className="mt-4 text-center text-[12px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>

        <p className="mt-4 text-center text-[13.5px] font-bold">
          <Link href="/login" className="underline underline-offset-4" style={{ color: "var(--text-3)" }}>
            I already have an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
