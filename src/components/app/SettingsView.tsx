"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, LogOut, Loader2, Send, Smartphone } from "lucide-react";
import { api } from "@/lib/client/api";
import { usePush } from "@/hooks/usePush";
import { MobileHeader, PageShell } from "./Shell";
import { Logo } from "@/components/Logo";

interface SettingsShape {
  rollingWindowDays: number;
  digestTime: string;
  digestEnabled: boolean;
  urgentPushEnabled: boolean;
  remindersEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  linkPreference: string;
  showDrafts: boolean;
  requestDrafts: boolean;
  showReasons: boolean;
  autoArchiveDays: number;
  theme: string;
  defaultView: string;
  timezone: string;
}

export function SettingsView({
  counts,
  initial,
  user,
  push,
}: {
  counts: Record<string, number>;
  initial: SettingsShape;
  user: { name: string | null; email: string };
  push: { configured: boolean; publicKey: string | null; devices: number };
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const pushState = usePush(push.publicKey);

  const save = async (patch: Partial<SettingsShape>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    try {
      await api.saveSettings(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Put the old value back rather than showing a lie.
      setSettings(initial);
    }
  };

  // Theme is applied straight away so the choice is visible, not just stored.
  useEffect(() => {
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      localStorage.setItem("todo-theme", settings.theme);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  return (
    <PageShell counts={counts}>
      <MobileHeader subtitle="Settings" />

      <div className="mb-6 hidden items-center justify-between lg:flex">
        <h1 className="text-[27px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          Settings
        </h1>
        {saved ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--accent-done)" }}>
            <Check className="size-4" strokeWidth={3} />
            Saved
          </span>
        ) : null}
      </div>

      {/* Notifications ------------------------------------------------- */}
      <Card title="Notifications" blurb="Push works on your phone and your desktop, wherever you are signed in.">
        {!push.configured ? (
          <Note>
            Push is not configured on this server. Run <Code>npm run gen:vapid</Code>, put the two keys in your
            environment, and restart.
          </Note>
        ) : pushState.state === "needs-install" ? (
          <Note>
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Smartphone className="size-3.5" strokeWidth={2.8} />
              Add ToDo to your Home Screen first
            </span>
            <br />
            iPhone and iPad only allow notifications for installed apps. Tap Share, then Add to Home Screen, and open
            ToDo from there.
          </Note>
        ) : pushState.state === "unsupported" ? (
          <Note>This browser does not support push notifications.</Note>
        ) : pushState.state === "denied" ? (
          <Note>
            Notifications are blocked for this site. Turn them back on in your browser settings, then reload.
          </Note>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (pushState.state === "on" ? pushState.disable() : pushState.enable())}
              disabled={pushState.state === "working"}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-50"
              style={
                pushState.state === "on"
                  ? { border: "1px solid var(--line-strong)", color: "var(--text-2)" }
                  : { background: "var(--text)", color: "var(--bg)" }
              }
            >
              {pushState.state === "working" ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2.8} />
              ) : pushState.state === "on" ? (
                <BellOff className="size-4" strokeWidth={2.6} />
              ) : (
                <Bell className="size-4" strokeWidth={2.6} />
              )}
              {pushState.state === "on" ? "Turn off on this device" : "Turn on for this device"}
            </button>

            {pushState.state === "on" ? (
              <button
                type="button"
                onClick={async () => {
                  setTesting(true);
                  const ok = await pushState.test();
                  setTestResult(ok ? "Sent — check your devices." : null);
                  setTesting(false);
                  setTimeout(() => setTestResult(null), 3000);
                }}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
                style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
              >
                {testing ? <Loader2 className="size-4 animate-spin" strokeWidth={2.8} /> : <Send className="size-4" strokeWidth={2.5} />}
                Send a test
              </button>
            ) : null}
          </div>
        )}

        {pushState.error ? (
          <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--accent-urgent)" }}>
            {pushState.error}
          </p>
        ) : null}
        {testResult ? (
          <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--accent-done)" }}>
            {testResult}
          </p>
        ) : null}

        <div className="mt-4 space-y-1">
          <Toggle label="Morning digest" hint="One push with what the day holds." value={settings.digestEnabled} onChange={(v) => save({ digestEnabled: v })} />
          {settings.digestEnabled ? (
            <TimeRow label="Digest time" value={settings.digestTime} onChange={(v) => save({ digestTime: v })} />
          ) : null}
          <Toggle label="Due-soon reminders" hint="A nudge an hour before something is due." value={settings.remindersEnabled} onChange={(v) => save({ remindersEnabled: v })} />
          <Toggle label="Quiet hours" hint="Hold everything except genuinely urgent pushes." value={settings.quietHoursEnabled} onChange={(v) => save({ quietHoursEnabled: v })} />
          {settings.quietHoursEnabled ? (
            <div className="grid grid-cols-2 gap-2">
              <TimeRow label="From" value={settings.quietHoursStart} onChange={(v) => save({ quietHoursStart: v })} />
              <TimeRow label="Until" value={settings.quietHoursEnd} onChange={(v) => save({ quietHoursEnd: v })} />
            </div>
          ) : null}
        </div>
      </Card>

      {/* The agent ------------------------------------------------------ */}
      <Card title="What your assistant does" blurb="These are read by the agent at the start of every run.">
        <Choice
          label="Rolling window"
          hint="How far back and forward each sweep looks."
          value={String(settings.rollingWindowDays)}
          options={[
            { value: "7", label: "7 days" },
            { value: "14", label: "14 days" },
            { value: "30", label: "30 days" },
          ]}
          onChange={(v) => save({ rollingWindowDays: Number(v) })}
        />
        <Toggle
          label="Write draft replies"
          hint="Ask the agent to draft the easy responses and park them in your drafts."
          value={settings.requestDrafts}
          onChange={(v) => save({ requestDrafts: v })}
        />
        <Toggle
          label="Show the draft button"
          hint="Adds “See your draft” to any task that has one waiting."
          value={settings.showDrafts}
          onChange={(v) => save({ showDrafts: v })}
        />
        <Toggle
          label="Show why it was filed"
          hint="One line under each task explaining the bucket."
          value={settings.showReasons}
          onChange={(v) => save({ showReasons: v })}
        />
      </Card>

      {/* Opening links --------------------------------------------------- */}
      <Card title="Opening things" blurb="Where the “Open in Outlook” buttons take you.">
        <Choice
          label="Prefer"
          value={settings.linkPreference}
          options={[
            { value: "auto", label: "Auto" },
            { value: "app", label: "The app" },
            { value: "web", label: "The browser" },
          ]}
          onChange={(v) => save({ linkPreference: v })}
          hint="Auto uses the installed app on phones and desktops, and the browser everywhere else."
        />
      </Card>

      {/* Appearance ------------------------------------------------------ */}
      <Card title="Appearance">
        <Choice
          label="Theme"
          value={settings.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(v) => save({ theme: v })}
        />
        <Choice
          label="Opens on"
          value={settings.defaultView}
          options={[
            { value: "focus", label: "The list" },
            { value: "board", label: "The board" },
          ]}
          onChange={(v) => save({ defaultView: v })}
        />
        <Choice
          label="Keep cleared tasks"
          value={String(settings.autoArchiveDays)}
          options={[
            { value: "1", label: "A day" },
            { value: "7", label: "A week" },
            { value: "30", label: "A month" },
            { value: "0", label: "Forever" },
          ]}
          onChange={(v) => save({ autoArchiveDays: Number(v) })}
        />
      </Card>

      {/* Account ---------------------------------------------------------- */}
      <Card title="Account">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
              {user.name ?? user.email}
            </p>
            <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text-3)" }}>
              {user.email} · {settings.timezone}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api.logout();
            router.replace("/login");
            router.refresh();
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: "1px solid var(--line)", color: "var(--accent-urgent)" }}
        >
          <LogOut className="size-4" strokeWidth={2.6} />
          Sign out
        </button>
      </Card>
    </PageShell>
  );
}

/* --- small building blocks ------------------------------------------- */

function Card({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-card)] p-4 sm:p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <h2 className="text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      {blurb ? (
        <p className="mb-3 mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          {blurb}
        </p>
      ) : (
        <div className="mb-2" />
      )}
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold" style={{ color: "var(--text)" }}>
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--text-3)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className="relative h-[26px] w-[46px] shrink-0 rounded-full transition"
        style={{ background: value ? "var(--accent-done)" : "var(--line-strong)" }}
      >
        <span
          className="absolute top-[3px] size-5 rounded-full bg-white shadow transition-all"
          style={{ left: value ? 23 : 3 }}
        />
      </span>
    </button>
  );
}

function Choice({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="px-1 py-2.5">
      <p className="text-[14.5px] font-bold" style={{ color: "var(--text)" }}>
        {label}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--text-3)" }}>
          {hint}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-full px-3.5 py-2 text-[13px] font-extrabold transition active:scale-95"
            style={{
              background: value === o.value ? "var(--text)" : "transparent",
              color: value === o.value ? "var(--bg)" : "var(--text-3)",
              border: `1.5px solid ${value === o.value ? "var(--text)" : "var(--line)"}`,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-1 py-2.5">
      <span className="text-[14.5px] font-bold" style={{ color: "var(--text)" }}>
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular rounded-xl px-3 py-2 text-[14px] font-bold outline-none"
        style={{ background: "var(--bg-alt)", border: "1px solid var(--line)", color: "var(--text)" }}
      />
    </label>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "var(--bg-alt)", color: "var(--text-2)" }}>
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded px-1.5 py-0.5 text-[12.5px]" style={{ background: "var(--card)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      {children}
    </code>
  );
}
