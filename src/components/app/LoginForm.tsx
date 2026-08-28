"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MailCheck } from "lucide-react";
import { Alert, AuthShell, Field, SubmitButton, postJson } from "./AuthShell";

export function LoginForm({ firstRun, signupsOpen }: { firstRun: boolean; signupsOpen: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsVerification(false);
    try {
      await postJson("/api/auth/login", { email, password });
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      if (err?.data?.needsVerification) setNeedsVerification(true);
      setError(err?.message ?? "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResent(false);
    await postJson("/api/auth/resend", { email }).catch(() => {});
    setResent(true);
  };

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          {firstRun ? "Set up your ToDo" : "Welcome back"}
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
          {firstRun ? "This is a fresh install — the first account is yours." : "Sign in to pick up your list."}
        </p>

        <div className="mt-6 space-y-2.5">
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@work.com" autoComplete="email" required autoFocus />
          <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="••••••••••" autoComplete="current-password" required />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        {needsVerification ? (
          resent ? (
            <Alert tone="ok">
              <MailCheck className="mr-1.5 inline size-4" strokeWidth={2.8} />
              Sent. Check your inbox, including spam.
            </Alert>
          ) : (
            <button type="button" onClick={resend} className="mt-2 w-full text-[13.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-2)" }}>
              Resend the confirmation email
            </button>
          )
        ) : null}

        <SubmitButton busy={busy}>
          Sign in
          {!busy ? <ArrowRight className="size-[18px]" strokeWidth={3} /> : null}
        </SubmitButton>

        <div className="mt-5 flex flex-col gap-2 text-center text-[13.5px] font-bold">
          <Link href="/forgot" className="underline underline-offset-4" style={{ color: "var(--text-3)" }}>
            Forgot your password?
          </Link>
          {signupsOpen || firstRun ? (
            <Link href="/signup" className="underline underline-offset-4" style={{ color: "var(--text-3)" }}>
              {firstRun ? "Create the first account" : "Create an account"}
            </Link>
          ) : null}
        </div>
      </form>
    </AuthShell>
  );
}
