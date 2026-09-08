"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plug, Trash2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/client/api";
import { MobileHeader, PageShell } from "./Shell";
import { dailyTriagePrompt } from "@/lib/mcp/prompts";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const CLIENTS = [
  { key: "claude", label: "Claude" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "cli", label: "Claude Code" },
  { key: "json", label: "Config file" },
] as const;

export function ConnectView({ counts, tokens: initialTokens }: { counts: Record<string, number>; tokens: TokenRow[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<(typeof CLIENTS)[number]["key"]>("claude");
  const [origin, setOrigin] = useState("");

  // The MCP URL has to be the origin the user actually reaches this app on,
  // which only the browser knows.
  useEffect(() => setOrigin(window.location.origin), []);

  const mcpUrl = `${origin || "https://your-todo-app.com"}/api/mcp`;
  const secret = fresh ?? "todo_••••••••••••••••••••••••";
  const oauthClient = client === "claude" || client === "chatgpt";

  const createToken = async () => {
    setBusy(true);
    try {
      const res = await api.createToken(`${CLIENTS.find((c) => c.key === client)?.label ?? "MCP"} connection`);
      setFresh(res.token);
      setTokens((prev) => [{ ...res.record, lastUsedAt: null }, ...prev]);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await api.revokeToken(id);
    setTokens((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <PageShell counts={counts}>
      <MobileHeader subtitle="Connect your assistant" />

      <div className="mb-6 hidden lg:block">
        <h1 className="text-[27px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          Connect your assistant
        </h1>
        <p className="mt-2 max-w-[56ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          Connect your Claude or ChatGPT subscription, run your first sweep, then schedule it for each morning.
          Your assistant can update the list and see what you have already cleared.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CLIENTS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setClient(c.key)}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-extrabold transition"
            style={{
              background: client === c.key ? "var(--text)" : "transparent",
              color: client === c.key ? "var(--bg)" : "var(--text-3)",
              border: `1.5px solid ${client === c.key ? "var(--text)" : "var(--line)"}`,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* OAuth clients: paste a URL, sign in, allow. Nothing else. ------- */}
      {oauthClient ? (
        <Step n={1} title="Add it to your assistant">
          {client === "claude" ? (
            <Instructions
              steps={[
                "Open Claude → Settings → Connectors → Add custom connector.",
                "Name it ToDo, paste the server URL below, and press Add.",
                "Claude opens ToDo in a new tab — sign in if asked, press Allow access, and you are connected. There is no token to paste.",
              ]}
            >
              <Labelled label="Server URL" value={mcpUrl} mono />
            </Instructions>
          ) : (
            <Instructions
              steps={[
                "In ChatGPT on the web, open Settings → Security and login and enable Developer mode.",
                "Open Plugins, press +, and create an app named ToDo using the server URL below and OAuth authentication.",
                "Sign in to ToDo and press Allow access. Finish creating the app, then select ToDo in the chat's Developer mode tools. There is no token to paste.",
              ]}
            >
              <Labelled label="Server URL" value={mcpUrl} mono />
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                Some workspaces show Apps → Create instead. Availability and write actions depend on your account
                and workspace settings. See the{" "}
                <a href="https://developers.openai.com/api/docs/guides/developer-mode" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
                  ChatGPT setup guide
                </a>.
              </p>
            </Instructions>
          )}
        </Step>
      ) : (
        <>
          <Step n={1} title="Make a connection token">
            {fresh ? (
              <div className="rounded-2xl p-3.5" style={{ background: "var(--tint-quick)", border: "1px solid var(--accent-quick)" }}>
                <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold" style={{ color: "var(--accent-quick)" }}>
                  <TriangleAlert className="size-3.5" strokeWidth={2.8} />
                  Copy it now — it is not shown again
                </p>
                <CopyRow value={fresh} mono />
              </div>
            ) : (
              <button
                type="button"
                onClick={createToken}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[14.5px] font-extrabold transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                {busy ? <Loader2 className="size-[17px] animate-spin" strokeWidth={2.8} /> : <KeyRound className="size-[17px]" strokeWidth={2.8} />}
                Create a token
              </button>
            )}
          </Step>

          <Step n={2} title="Add it to your assistant">
            {client === "cli" ? (
              <Instructions steps={["Run this once in a terminal. It stores the connection for every project."]}>
                <Labelled
                  label="Command"
                  value={`claude mcp add --transport http todo ${mcpUrl} --header "Authorization: Bearer ${secret}"`}
                  mono
                />
              </Instructions>
            ) : (
              <Instructions steps={["Drop this into your client's MCP config file and restart it."]}>
                <Labelled
                  label="mcp.json"
                  mono
                  value={JSON.stringify(
                    {
                      mcpServers: {
                        todo: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${secret}` } },
                      },
                    },
                    null,
                    2,
                  )}
                />
              </Instructions>
            )}
          </Step>
        </>
      )}

      {/* The schedule ---------------------------------------------------- */}
      <Step n={oauthClient ? 2 : 3} title="Run once, then set the morning schedule">
        <p className="mb-3 text-[14px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          First, paste the prompt below into a chat with ToDo and your mail, calendar, and chat apps enabled.
          Check that your list updates and a prepared reply opens in the right conversation. Then reuse the prompt
          in a scheduled task for 7:00 am in your assistant.
        </p>
        <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          The schedule runs in your assistant. Its app access and action permissions determine what it can prepare;
          a run may pause if it needs your approval. Check the first scheduled result before relying on it each day.
        </p>
        <CopyBlock value={dailyTriagePrompt({ windowDays: "14" })} label="Copy the run prompt" />
      </Step>

      {/* Every live connection, however it was made ----------------------- */}
      <section className="mb-5 rounded-[var(--radius-card)] p-4 sm:p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
        <h2 className="mb-1 text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
          Connections
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          An assistant you approve with Allow access appears here on its own, next to any tokens you made by hand.
          Revoking one cuts that assistant off immediately.
        </p>
        {tokens.length > 0 ? (
          <ul className="space-y-1.5">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
              >
                <Plug className="size-4 shrink-0" strokeWidth={2.6} style={{ color: "var(--text-3)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
                    {t.name}
                  </p>
                  <p className="text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                    {t.prefix}… ·{" "}
                    {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(t.id)}
                  aria-label={`Revoke ${t.name}`}
                  className="grid size-8 place-items-center rounded-lg transition active:scale-90"
                  style={{ color: "var(--accent-urgent)" }}
                >
                  <Trash2 className="size-4" strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-3)" }}>
            Nothing connected yet.
          </p>
        )}
      </section>

      <p className="mt-8 px-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        A connection is as good as your list — anyone holding one can read and rewrite it. Signing in through Claude or
        ChatGPT never shows you a token at all; the ones above exist for command-line and config-file setups, where the
        header is the right place for them. Revoke anything above at any time and it stops working immediately.
      </p>
    </PageShell>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-[var(--radius-card)] p-4 sm:p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <h2 className="mb-3 flex items-center gap-2.5 text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
        <span className="tabular grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold" style={{ background: "var(--text)", color: "var(--bg)" }}>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Instructions({ steps, children }: { steps: string[]; children: React.ReactNode }) {
  return (
    <div>
      <ol className="mb-3 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            <span className="tabular shrink-0 font-extrabold" style={{ color: "var(--text-3)" }}>
              {i + 1}.
            </span>
            {s}
          </li>
        ))}
      </ol>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Labelled({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 px-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </p>
      <CopyRow value={value} mono={mono} />
    </div>
  );
}

function CopyRow({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}>
      <code
        className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-[12.5px] leading-relaxed"
        style={{ color: "var(--text-2)", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          await copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        aria-label="Copy"
        className="grid size-8 shrink-0 place-items-center rounded-lg transition active:scale-90"
        style={{ background: "var(--card)", color: copied ? "var(--accent-done)" : "var(--text-3)" }}
      >
        {copied ? <Check className="size-4" strokeWidth={3} /> : <Copy className="size-4" strokeWidth={2.5} />}
      </button>
    </div>
  );
}

function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98]"
          style={{ background: copied ? "var(--accent-done)" : "var(--text)", color: copied ? "#fff" : "var(--bg)" }}
        >
          {copied ? <Check className="size-4" strokeWidth={3} /> : <Copy className="size-4" strokeWidth={2.6} />}
          {copied ? "Copied" : label}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-2xl px-4 py-2.5 text-[14px] font-bold"
          style={{ border: "1px solid var(--line)", color: "var(--text-2)" }}
        >
          {open ? "Hide it" : "Read it first"}
        </button>
      </div>
      {open ? (
        <pre
          className="mt-3 max-h-[340px] overflow-auto rounded-2xl p-4 text-[12px] leading-relaxed"
          style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)", color: "var(--text-2)", whiteSpace: "pre-wrap" }}
        >
          {value}
        </pre>
      ) : null}
    </div>
  );
}

/** navigator.clipboard needs a secure context; fall back so http:// installs still work. */
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const el = document.createElement("textarea");
    el.value = value;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}
