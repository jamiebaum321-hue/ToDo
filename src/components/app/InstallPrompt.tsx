"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { usePlatform } from "@/hooks/usePlatform";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "todo-install-dismissed";

/**
 * Installing matters more here than for most web apps: on iOS the Push API is
 * only available to a home-screen install, so "add to home screen" is the
 * difference between getting notified and not.
 */
export function InstallPrompt({ hidden = false }: { hidden?: boolean } = {}) {
  const { platform, standalone, ready } = usePlatform();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode; the banner just comes back next session */
    }
  };

  // A sheet or dialog owns the bottom of the screen while it is open.
  if (!ready || standalone || dismissed || hidden) return null;

  const isIos = platform === "ios";
  if (!isIos && !deferred) return null;

  return (
    <div
      className="animate-rise fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-[55] flex items-center gap-3 rounded-2xl px-4 py-3 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:max-w-[380px]"
      style={{ background: "var(--card)", border: "1px solid var(--line)", boxShadow: "var(--shadow-lift)" }}
      role="complementary"
    >
      <Logo size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold" style={{ color: "var(--text)" }}>
          Install ToDo
        </p>
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-3)" }}>
          {isIos ? (
            <>
              Tap <Share className="inline size-3" strokeWidth={2.8} /> then “Add to Home Screen” — notifications need it.
            </>
          ) : (
            "Get it on your home screen with notifications."
          )}
        </p>
      </div>

      {!isIos && deferred ? (
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
            close();
          }}
          className="shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-extrabold"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Install
        </button>
      ) : null}

      <button type="button" onClick={close} aria-label="Dismiss" className="shrink-0" style={{ color: "var(--text-3)" }}>
        <X className="size-4" strokeWidth={2.8} />
      </button>
    </div>
  );
}
