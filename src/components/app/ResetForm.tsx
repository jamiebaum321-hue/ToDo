"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AuthShell, Field, SubmitButton, postJson } from "./AuthShell";

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/reset", { token, password });
      // The reset signs them in, so go straight to the list.
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <div className="text-center">
          <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            That link is incomplete
          </h2>
          <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            Ask for a fresh reset link and try again.
          </p>
          <Link href="/forgot" className="mt-6 inline-block text-[13.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-3)" }}>
            Send a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          Choose a new password
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--text-3)" }}>
          Everywhere else you are signed in will be signed out.
        </p>

        <div className="mt-6 space-y-2.5">
          <Field
            label="New password"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="At least 10 characters"
            autoComplete="new-password"
            required
            autoFocus
          />
          <Field label="Again" value={confirm} onChange={setConfirm} type="password" autoComplete="new-password" required />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <SubmitButton busy={busy}>Set my new password</SubmitButton>
      </form>
    </AuthShell>
  );
}
