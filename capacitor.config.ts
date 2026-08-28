import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shells.
 *
 * ToDo is a server-rendered app with API routes, so there is no static bundle
 * to ship inside the binary — the shells load the deployed site. What makes
 * them worth submitting rather than a bookmark is what they add on top:
 * notifications through APNs and FCM (iOS gives web push only to home-screen
 * installs, and never to a WKWebView), a native splash and status bar, and
 * universal links that open a task straight from a notification.
 *
 * Set CAP_SERVER_URL at build time to point a build at staging.
 */
const server = process.env.CAP_SERVER_URL || "https://tasks2do.app";

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID || "com.todoapp.inbox",
  appName: "ToDo",
  // Nothing is copied into the binary; `webDir` still has to exist for the CLI.
  webDir: "native/www",

  server: {
    url: server,
    // The app is served over TLS in every real deployment.
    cleartext: false,
    // Anything not on this origin opens in the system browser instead of the
    // webview — tapping "Open in Outlook" must hand off to the real app.
    allowNavigation: [new URL(server).host, "www." + new URL(server).host],
  },

  ios: {
    contentInset: "always",
    // The cream from the logo, so there is no white flash behind the app.
    backgroundColor: "#F5EFE3",
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: "#F5EFE3",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#F5EFE3",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: false,
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#F5EFE3",
    },
    PushNotifications: {
      // Shown while the app is in the foreground too; a task that needs you
      // now should not be silent because the app happens to be open.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
