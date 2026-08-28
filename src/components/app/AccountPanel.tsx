"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, LogOut, Monitor, Smartphone, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import { relativeLabel } from "@/lib/time";

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
  lastSeenAt: string;
  createdAt: string;
}

/** "Chrome on macOS" out of a user-agent string — enough to recognise a device. */
function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

export function AccountPanel({ user }: { user: { name: string | null; email: string; timezone: string } }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [open, setOpen] = useState<"none" | "password" | "email" | "delete">("none");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const loadSessions = async () => {
    const res = await fetch("/api/account/sessions");
    if (res.ok) setSessions((await res.json()).sessions ?? []);
  };
  useEffect(() => {
    loadSessions();
  }, []);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "That did not work.");
      return data;
    } catch (err: any) {
      setMessage({ tone: "error", text: err?.message ?? "That did not work." });
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 rounded-[var(--radius-card)] p-4 sm:p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <h2 className="text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
        Account
      </h2>

      <div className="mt-3 flex items-center gap-3">
        <Logo size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
            {user.name ?? user.email}
          </p>
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text-3)" }}>
            {user.email} · {user.timezone}
          </p>
        </div>
      </div>

      {message ? (
        <p
          className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-bold"
          style={
            message.tone === "ok"
              ? { background: "var(--tint-done)", color: "var(--accent-done)" }
              : { background: "var(--tint-urgent)", color: "var(--accent-urgent)" }
          }
        >
          {message.text}
        </p>
      ) : null}

      {/* --- actions ------------------------------------------------------ */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Secondary onClick={() => setOpen(open === "password" ? "none" : "password")}>
          <KeyRound className="size-4" strokeWidth={2.5} />
          Change password
        </Secondary>
        <Secondary onClick={() => setOpen(open === "email" ? "none" : "email")}>Change email</Secondary>
        <a
          href="/api/account/export"
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
        >
          <Download className="size-4" strokeWidth={2.5} />
          Export my data
        </a>
      </div>

      {open === "password" ? (
        <Panel title="Change password">
          <Input value={current} onChange={setCurrent} type="password" placeholder="Current password" autoComplete="current-password" />
          <Input value={next} onChange={setNext} type="password" placeholder="New password (10+ characters)" autoComplete="new-password" />
          <Primary
            busy={busy}
            onClick={async () => {
              const ok = await call("/api/account/password", "POST", { current, next });
              if (ok) {
                setMessage({ tone: "ok", text: "Password changed. Every other device has been signed out." });
                setOpen("none");
                setCurrent("");
                setNext("");
                loadSessions();
              }
            }}
          >
            Change it
          </Primary>
        </Panel>
      ) : null}

      {open === "email" ? (
        <Panel title="Change email">
          <p className="px-1 pb-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            We will send a confirmation link to the new address. Nothing changes until you click it.
          </p>
          <Input value={newEmail} onChange={setNewEmail} type="email" placeholder="new@address.com" autoComplete="email" />
          <Input value={current} onChange={setCurrent} type="password" placeholder="Your password" autoComplete="current-password" />
          <Primary
            busy={busy}
            onClick={async () => {
              const ok = await call("/api/account/email", "POST", { email: newEmail, password: current });
              if (ok) {
                setMessage({ tone: "ok", text: "Check the new address for a confirmation link." });
                setOpen("none");
                setNewEmail("");
                setCurrent("");
              }
            }}
          >
            Send the link
          </Primary>
        </Panel>
      ) : null}

      {/* --- signed-in devices -------------------------------------------- */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h3 className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            Signed in on
          </h3>
          {sessions.length > 1 ? (
            <button
              type="button"
              onClick={async () => {
                const ok = await call("/api/account/sessions", "DELETE", { all: true });
                if (ok) {
                  setMessage({ tone: "ok", text: "Signed out everywhere else." });
                  loadSessions();
                }
              }}
              className="text-[12.5px] font-bold underline underline-offset-2"
              style={{ color: "var(--text-3)" }}
            >
              Sign out everywhere else
            </button>
          ) : null}
        </div>

        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
              style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
            >
              {/iPhone|iPad|Android/.test(s.userAgent ?? "") ? (
                <Smartphone className="size-4 shrink-0" strokeWidth={2.4} style={{ color: "var(--text-3)" }} />
              ) : (
                <Monitor className="size-4 shrink-0" strokeWidth={2.4} style={{ color: "var(--text-3)" }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
                  {describeDevice(s.userAgent)}
                  {s.current ? (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: "var(--tint-done)", color: "var(--accent-done)" }}>
                      this device
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                  {s.ip ? `${s.ip} · ` : ""}active {relativeLabel(new Date(s.lastSeenAt))}
                </p>
              </div>
              {!s.current ? (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await call("/api/account/sessions", "DELETE", { id: s.id });
                    if (ok) loadSessions();
                  }}
                  className="shrink-0 text-[12.5px] font-bold underline underline-offset-2"
                  style={{ color: "var(--accent-urgent)" }}
                >
                  End
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* --- sign out / delete --------------------------------------------- */}
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--line-2)" }}>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
        >
          <LogOut className="size-4" strokeWidth={2.6} />
          Sign out
        </button>

        <button
          type="button"
          onClick={() => setOpen(open === "delete" ? "none" : "delete")}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: "1px solid var(--accent-urgent)", color: "var(--accent-urgent)" }}
        >
          <TriangleAlert className="size-4" strokeWidth={2.6} />
          Delete my account
        </button>
      </div>

      {open === "delete" ? (
        <Panel title="Delete your account" danger>
          <p className="px-1 pb-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            This removes your account, every task, every connection token and everything your assistant has written.
            It happens immediately and cannot be undone. Export your data first if you want a copy.
          </p>
          <Input value={deletePassword} onChange={setDeletePassword} type="password" placeholder="Your password" autoComplete="current-password" />
          <Input value={deleteConfirm} onChange={setDeleteConfirm} placeholder="Type DELETE to confirm" />
          <button
            type="button"
            disabled={busy || deleteConfirm !== "DELETE"}
            onClick={async () => {
              const ok = await call("/api/account", "DELETE", { password: deletePassword, confirm: deleteConfirm });
              if (ok) {
                router.replace("/login");
                router.refresh();
              }
            }}
            className="mt-1 w-full rounded-xl py-3 text-[14.5px] font-extrabold text-white transition disabled:opacity-40"
            style={{ background: "var(--accent-urgent)" }}
          >
            Delete everything, permanently
          </button>
        </Panel>
      ) : null}
    </section>
  );
}

/* --- small pieces ------------------------------------------------------- */

function Panel({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="animate-rise mt-3 space-y-2 rounded-2xl p-3"
      style={{ background: "var(--bg-alt)", border: `1px solid ${danger ? "var(--accent-urgent)" : "var(--line-2)"}` }}
    >
      <p className="px-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: danger ? "var(--accent-urgent)" : "var(--text-3)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="w-full rounded-xl px-3.5 py-2.5 text-[14px] font-semibold outline-none"
      style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
    />
  );
}

function Primary({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full rounded-xl py-2.5 text-[14px] font-extrabold transition disabled:opacity-50"
      style={{ background: "var(--text)", color: "var(--bg)" }}
    >
      {children}
    </button>
  );
}

function Secondary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
      style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
    >
      {children}
    </button>
  );
}
