"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import { alternateFor, browserUrlFor, chooseUrl, isMobilePlatform, type LinkPreference, type LinkTarget } from "@/lib/deeplinks";
import { isGmailMobileWebLink } from "@/lib/mail-links";
import { usePlatform } from "@/hooks/usePlatform";
import { isNative, openExternal } from "@/lib/client/native";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  target: LinkTarget;
  accent?: string;
  preference?: LinkPreference;
  variant?: "primary" | "secondary" | "draft";
  icon?: React.ReactNode;
  hint?: string;
  /** Opening is an intent, never evidence of sending/completing a task. */
  onOpened?: () => void;
}

export function OpenButton({ label, target, accent, preference = "auto", variant = "primary", icon, hint, onOpened }: Props) {
  const { platform, ready } = usePlatform();
  const [state, setState] = useState<"idle" | "opening" | "stuck">("idle");
  const cleanup = useRef<() => void>(() => {});
  const url = chooseUrl(target, platform, preference);
  const alternate = alternateFor(target, url, platform);
  const browserUrl = browserUrlFor(target, platform);
  const web = browserUrl && /^https?:/i.test(browserUrl) ? browserUrl : null;
  const gmailBrowser = isMobilePlatform(platform) && isGmailMobileWebLink(url);
  const mailbox = gmailBrowser && url ? new URL(url).searchParams.get("authuser") : null;

  useEffect(() => () => cleanup.current(), []);

  function open(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!ready) { event.preventDefault(); return; }
    cleanup.current();
    onOpened?.();
    setState("idle");
    // Anchors preserve click activation and work with popup blockers.
    if (/^https?:/i.test(href)) {
      if (isNative()) {
        event.preventDefault();
        setState("opening");
        void openExternal(href).then(handled => setState(handled ? "idle" : "stuck")).catch(() => setState("stuck"));
      }
      return;
    }

    event.preventDefault();
    setState("opening");
    const settle = (next: "idle" | "stuck") => { cleanup.current(); setState(next); };
    const onHidden = () => { if (document.visibilityState === "hidden") settle("idle"); };
    const onPageHide = () => settle("idle");
    cleanup.current = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    const timer = setTimeout(() => settle(document.visibilityState === "visible" ? "stuck" : "idle"), 2600);
    // The same watcher is needed inside Capacitor: assigning location does not
    // prove the native app accepted the URL or found the requested conversation.
    try { window.location.href = href; } catch { settle("stuck"); }
  }

  if (!url) return null;
  return <div className="space-y-1.5">
    <a href={url} target={/^https?:/i.test(url) ? "_blank" : undefined} rel="noopener noreferrer"
      onClick={event => open(event, url)} aria-disabled={!ready} aria-label={label}
      className={cn("group inline-flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition active:scale-[0.985]", variant === "primary" ? "text-white" : variant === "draft" ? "border-2 border-dashed" : "border")}
      style={variant === "primary" ? { background: accent ?? "var(--text)" } : { borderColor: accent ?? "var(--line-strong)", color: accent ?? "var(--text)", background: "var(--card)" }}>
      <span className="flex min-w-0 items-center gap-2.5">{icon ?? <ExternalLink className="size-[18px] shrink-0" />}<span className="truncate text-left">{label}</span></span>
      {state === "opening" ? <Loader2 className="size-[18px] shrink-0 animate-spin" /> : <ArrowUpRight className="size-[18px] shrink-0" />}
    </a>
    {hint ? <p className="px-1 text-[12px]" style={{ color: "var(--text-3)" }}>{hint}</p> : null}
    {gmailBrowser ? <p className="px-1 text-[12px]" style={{ color: "var(--text-3)" }}>
      Opens in your browser{mailbox ? ` · ${mailbox}` : ""}. Gmail’s phone app cannot reliably open a selected conversation.
    </p> : null}
    {alternate ? <a href={alternate.url} target={alternate.kind === "web" ? "_blank" : undefined} rel="noopener noreferrer"
      onClick={event => open(event, alternate.url)} className="block px-1 text-[12.5px] font-semibold underline underline-offset-2" style={{ color: "var(--text-3)" }}>
      {alternate.kind === "app" ? "Open in the app instead" : "Open in the browser instead"}
    </a> : null}
    {state === "stuck" ? <div role="status" className="px-1 text-[13px]" style={{ color: "var(--text-2)" }}>
      {web ? <a href={web} target="_blank" rel="noopener noreferrer" className="font-semibold underline" onClick={() => setState("idle")}>If the app did not open, use the browser</a> : "If nothing opened, check that your email app is installed."}
    </div> : null}
  </div>;
}
