"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { detectPlatform } from "@/lib/deeplinks";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on" | "working";

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePush(publicKey: string | null) {
  const [state, setState] = useState<PushState>("off");
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;

    // iOS only exposes the Push API to a home-screen install. Saying so beats a
    // toggle that silently does nothing.
    if (detectPlatform() === "ios" && !standalone) {
      setState("needs-install");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  const enable = useCallback(async () => {
    if (!publicKey) {
      setError("This server has no push keys configured yet.");
      return;
    }
    setState("working");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        }));

      await api.subscribePush(sub.toJSON() as PushSubscriptionJSON, detectPlatform());
      setState("on");
    } catch (err: any) {
      setError(err?.message ?? "Could not turn notifications on.");
      setState("off");
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err: any) {
      setError(err?.message ?? "Could not turn notifications off.");
      await evaluate();
    }
  }, [evaluate]);

  const test = useCallback(async () => {
    setError(null);
    try {
      await api.testPush();
      return true;
    } catch (err: any) {
      setError(err?.message ?? "That did not send.");
      return false;
    }
  }, []);

  return { state, error, enable, disable, test, refresh: evaluate };
}
