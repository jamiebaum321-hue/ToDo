"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerNativePush, wireNativeNavigation, isNative } from "@/lib/client/native";

/**
 * Inside the iOS and Android shells: route notification taps and universal
 * links to the right screen, and register for push once the user is signed in.
 * Does nothing at all in a browser.
 */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;

    let dispose: (() => void) | undefined;
    void wireNativeNavigation((path) => router.push(path)).then((fn) => {
      dispose = fn;
    });

    // Only re-registers if permission was already granted — this never puts a
    // permission prompt in front of someone who has not asked for one.
    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const permission = await PushNotifications.checkPermissions();
        if (permission.receive === "granted") await registerNativePush();
      } catch {
        /* plugin unavailable */
      }
    })();

    return () => dispose?.();
  }, [router]);

  return null;
}
