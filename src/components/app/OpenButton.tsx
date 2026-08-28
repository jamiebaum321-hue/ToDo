"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowUpRight, ExternalLink, Loader2 } from "lucide-react";
import { chooseUrl, fallbackFor, type LinkPreference, type LinkTarget } from "@/lib/deeplinks";
import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  target: LinkTarget;
  accent?: string;
  preference?: LinkPreference;
  variant?: "primary" | "secondary" | "draft";
  icon?: React.ReactNode;
  hint?: string;
  onOpened?: () => void;
}

/**
 * The button that ends the task.
 *
 * On a phone it fires the Outlook or Gmail app; on a desktop it fires the
 * desktop client; in a browser it opens the web version. Custom schemes are the
 * awkward part: if the app is not installed the browser simply does nothing and
 * says nothing, so we watch for the page still being here a beat later and
 * offer the https link instead of leaving you staring at a dead button.
 */
export function OpenButton({
  label,
  target,
  accent,
  preference = "auto",
  variant = "primary",
  icon,
  hint,
  onOpened,
}: Props) {
  const { platform, ready } = usePlatform();
  const [state, setState] = useState<"idle" | "opening" | "stuck">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const url = chooseUrl(target, platform, preference);
  const webFallback = fallbackFor(target, url);
  const isNativeScheme = Boolean(url && !/^https?:/i.test(url));

  const open = useCallback(
    (href: string, native: boolean) => {
      onOpened?.();

      if (!native) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }

      // A custom scheme has to go through the current document; window.open on
      // one is blocked in most browsers.
      setState("opening");
      window.location.href = href;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // Still visible means the handoff did not happen — no app registered.
        setState(document.visibilityState === "visible" && webFallback ? "stuck" : "idle");
      }, 1400);
    },
    [onOpened, webFallback],
  );

  if (!url) return null;

  const base =
    "group inline-flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition active:scale-[0.985]";

  const styles =
    variant === "primary"
      ? "text-white shadow-[0_10px_24px_-14px_rgba(20,20,15,.7)]"
      : variant === "draft"
        ? "border-2 border-dashed"
        : "border";

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => open(url, isNativeScheme)}
        className={cn(base, styles)}
        style={
          variant === "primary"
            ? { background: accent ?? "var(--text)" }
            : variant === "draft"
              ? { borderColor: accent ?? "var(--accent-delegate)", color: accent ?? "var(--accent-delegate)", background: "transparent" }
              : { borderColor: "var(--line-strong)", color: "var(--text)", background: "var(--card)" }
        }
        aria-label={label}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ?? <ExternalLink className="size-[18px] shrink-0" strokeWidth={2.4} />}
          <span className="truncate text-left">{label}</span>
        </span>
        {state === "opening" ? (
          <Loader2 className="size-[18px] shrink-0 animate-spin" strokeWidth={2.6} />
        ) : (
          <ArrowUpRight
            className="size-[18px] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.6}
          />
        )}
      </button>

      {hint && state === "idle" ? (
        <p className="px-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          {hint}
        </p>
      ) : null}

      {state === "stuck" && webFallback ? (
        <button
          type="button"
          onClick={() => open(webFallback, false)}
          className="w-full rounded-xl px-3 py-2 text-[13px] font-semibold underline underline-offset-2"
          style={{ color: "var(--text-3)" }}
        >
          Nothing opened? Use the browser instead
        </button>
      ) : null}

      {/* Until we know the platform, the label is honest about being generic. */}
      {!ready ? <span className="sr-only">Determining the best app to open</span> : null}
    </div>
  );
}
