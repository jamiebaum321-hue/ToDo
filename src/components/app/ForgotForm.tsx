"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Alert, AuthShell, Field, SubmitButton, postJson } from "./AuthShell";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/forgot", { email });
      setSent(true);
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
          {/* Deliberately non-committal: saying whether an account exists would
              turn this form into a way to test whether someone uses ToDo. */}
          <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            If <span style={{ color: "var(--text-2)" }}>{email}</span> has an account, a reset link is on its way. It
            expires in an hour.
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
          Reset your password
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
          We will email you a link to choose a new one.
        </p>

        <div className="mt-6">
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@work.com" autoComplete="email" required autoFocus />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <SubmitButton busy={busy}>Send the link</SubmitButton>

        <p className="mt-5 text-center text-[13.5px] font-bold">
          <Link href="/login" className="underline underline-offset-4" style={{ color: "var(--text-3)" }}>
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
