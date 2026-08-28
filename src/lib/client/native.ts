/**
 * The bridge between the web app and the native shells.
 *
 * Everything here is a no-op in a browser. The plugins are imported lazily so
 * a plain web visit never downloads Capacitor at all — only a real native
 * session pays for it.
 */

export interface NativeInfo {
  native: boolean;
  platform: "ios" | "android" | "web";
}

export function nativeInfo(): NativeInfo {
  if (typeof window === "undefined") return { native: false, platform: "web" };

  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return { native: false, platform: "web" };

  const platform = cap.getPlatform?.();
  return { native: true, platform: platform === "ios" || platform === "android" ? platform : "web" };
}

export const isNative = () => nativeInfo().native;

/**
 * Ask for notification permission and hand the resulting APNs/FCM token to the
 * server. iOS gives web push only to home-screen installs and never inside a
 * WKWebView, so a native build has to take this path — it is the main reason
 * the shells are worth shipping at all.
 */
export async function registerNativePush(): Promise<{ ok: boolean; reason?: string }> {
  const info = nativeInfo();
  if (!info.native) return { ok: false, reason: "not_native" };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") return { ok: false, reason: "denied" };

    const token = await new Promise<string | null>((resolve) => {
      // If neither fires, the app should not hang waiting for a token.
      const timer = setTimeout(() => resolve(null), 15000);
      PushNotifications.addListener("registration", (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      PushNotifications.addListener("registrationError", () => {
        clearTimeout(timer);
        resolve(null);
      });
      PushNotifications.register();
    });

    if (!token) return { ok: false, reason: "no_token" };

    const res = await fetch("/api/push/native", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, platform: info.platform }),
    });
    if (!res.ok) return { ok: false, reason: "server_rejected" };

    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function unregisterNativePush(): Promise<void> {
  const info = nativeInfo();
  if (!info.native) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const delivered = await PushNotifications.getDeliveredNotifications();
    await PushNotifications.removeDeliveredNotifications(delivered);
    await PushNotifications.removeAllListeners();
    await fetch("/api/push/native", { method: "DELETE" });
  } catch {
    /* nothing useful to do if the plugin is missing */
  }
}

/**
 * Tapping a notification should land on the task it is about, and an
  * "Open in Outlook" button should hand off to the real Outlook app rather
 * than trying to render it inside the webview.
 */
export async function wireNativeNavigation(navigate: (path: string) => void): Promise<() => void> {
  const info = nativeInfo();
  if (!info.native) return () => {};

  try {
    const [{ PushNotifications }, { App }] = await Promise.all([
      import("@capacitor/push-notifications"),
      import("@capacitor/app"),
    ]);

    const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification?.data?.url;
      if (typeof url === "string" && url.startsWith("/")) navigate(url);
    });

    // Universal links and app links, e.g. https://todo.app/?task=abc
    const opened = await App.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        navigate(`${parsed.pathname}${parsed.search}`);
      } catch {
        /* not a URL we can route */
      }
    });

    return () => {
      tapped.remove();
      opened.remove();
    };
  } catch {
    return () => {};
  }
}

/**
 * Open an external link the native way.
 *
 * A custom scheme (ms-outlook://) has to leave the webview entirely, and an
 * https link belongs in the system browser rather than replacing the app.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isNative()) return false;

  try {
    if (!/^https?:/i.test(url)) {
      // Let the OS resolve the scheme to whichever app claims it.
      window.location.href = url;
      return true;
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
    return true;
  } catch {
    return false;
  }
}
