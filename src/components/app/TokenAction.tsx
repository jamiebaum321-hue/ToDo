"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { AuthShell } from "./AuthShell";

/**
 * The landing page for a one-time email link: read the token from the URL,
 * spend it, and show what happened. Shared by email confirmation and the
 * email-change confirmation, which differ only in wording and endpoint.
 */
export function TokenAction({
  endpoint,
  method = "POST",
  working,
  successTitle,
  successBody,
  successHref,
  successCta,
}: {
  endpoint: string;
  method?: "POST" | "PATCH";
  working: string;
  successTitle: string;
  successBody: string;
  successHref: string;
  successCta: string;
}) {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);
  // React runs effects twice in development; spending a one-time token twice
  // would make the second call report "already used".
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token) {
      setState("error");
      setError("That link is missing its token. Ask for a new one.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(endpoint, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "That link did not work.");
        setState("ok");
      } catch (err: any) {
        setError(err?.message ?? "That link did not work.");
        setState("error");
      }
    })();
  }, [token, endpoint, method]);

  return (
    <AuthShell>
      <div className="text-center">
        {state === "working" ? (
          <>
            <span className="mx-auto block size-8 animate-spin rounded-full border-[3px] border-current border-t-transparent" style={{ color: "var(--text-3)" }} aria-hidden />
            <p className="mt-5 text-[15px] font-bold" style={{ color: "var(--text-2)" }}>
              {working}
            </p>
          </>
        ) : state === "ok" ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-2xl" style={{ background: "var(--tint-done)", color: "var(--accent-done)" }}>
              <CircleCheck className="size-7" strokeWidth={2.6} />
            </div>
            <h2 className="mt-5 text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
              {successTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              {successBody}
            </p>
            <Link
              href={successHref}
              className="mt-6 inline-block rounded-2xl px-5 py-3 text-[15px] font-extrabold"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              {successCta}
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-2xl" style={{ background: "var(--tint-urgent)", color: "var(--accent-urgent)" }}>
              <CircleX className="size-7" strokeWidth={2.6} />
            </div>
            <h2 className="mt-5 text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
              That link did not work
            </h2>
            <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              {error}
            </p>
            <Link href="/login" className="mt-6 inline-block text-[13.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-3)" }}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
