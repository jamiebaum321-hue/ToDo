"use client";

import { useEffect, useState } from "react";
import { detectPlatform, type Platform } from "@/lib/deeplinks";
import { nativeInfo } from "@/lib/client/native";

/**
 * Platform is only knowable in the browser, so the first render deliberately
 * says "unknown" on both server and client. Anything that changes with platform
 * has to tolerate that one frame, or hydration breaks.
 */
export function usePlatform(): { platform: Platform; standalone: boolean; ready: boolean } {
  const [state, setState] = useState<{ platform: Platform; standalone: boolean; ready: boolean }>({
    platform: "unknown",
    standalone: false,
    ready: false,
  });

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    const native = nativeInfo();
    const platform = native.native && native.platform !== "web" ? native.platform : detectPlatform(navigator.userAgent);
    setState({ platform, standalone: standalone || native.native, ready: true });
  }, []);

  return state;
}
