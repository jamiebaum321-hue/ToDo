"use client";

import { useEffect } from "react";

/**
 * Registers the worker on every load. Push subscription is a separate, explicit
 * step in Settings — installing the worker early just means offline and the
 * install prompt work before anyone opts into notifications.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration should cost nothing; the app works without it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
