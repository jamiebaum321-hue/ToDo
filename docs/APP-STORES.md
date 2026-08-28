# Shipping the iOS and Android apps

The native projects in `ios/` and `android/` are Capacitor shells around the
deployed web app. They exist because of what they add on top of a browser tab:

- **Notifications on iOS.** Safari gives web push only to a home-screen install
  and never inside a WKWebView, so a native build has to use APNs. Both shells
  go through Firebase, which forwards to APNs for iOS.
- **Universal links.** A notification tap opens the exact task, in the app.
- **Native chrome.** Splash screen, status bar, and hand-off to the real
  Outlook or Gmail app when you tap "Open in".

## Read this first

Three things cannot be done from this repository and are not optional:

| What | Why | Cost |
| --- | --- | --- |
| **A Mac with Xcode** | iOS builds and uploads only work on macOS. There is no cross-compiler and no CI shortcut that avoids it. | a Mac |
| **Apple Developer Program** | Required to sign, test on a device, or submit. | $99/year |
| **Google Play Developer** | Required to publish on Android. | $25 once |

And one risk worth naming before you spend that money:

> **App Store Review Guideline 4.2 — Minimum Functionality.** Apple rejects apps
> that are "simply a repackaged website". This app has a real case — push
> notifications, offline behaviour, universal links, native hand-off to Outlook
> and Gmail — but it is a judgement call by a reviewer, and a rejection here is
> common for wrapper apps. Google Play is far more permissive.
>
> If it is rejected, the usual fix is to move more of the experience native:
> a home-screen widget, a share extension that captures a task from any app, or
> offline task viewing. Budget for that possibility rather than being surprised.

## Setup, in order

### 1. Point the shells at your deployment

```bash
export CAP_SERVER_URL="https://tasks2do.app"
export CAP_APP_ID="com.yourcompany.todo"     # must match both stores
npx cap sync
```

`CAP_SERVER_URL` must be the production URL over HTTPS. The shells load the
live site; they do not bundle it.

### 2. Firebase, for notifications

One Firebase project covers both platforms.

1. Create a project at <https://console.firebase.google.com>.
2. Add an **Android app** with your package name → download
   `google-services.json` → put it in `android/app/`.
3. Add an **iOS app** with your bundle id → download `GoogleService-Info.plist`
   → add it to the Xcode project (drag into `App/App`, "Copy items if needed").
4. In **Project settings → Cloud Messaging**, upload your **APNs auth key**
   (`.p8` from the Apple Developer portal). Without this, iOS notifications
   silently never arrive.
5. **Project settings → Service accounts → Generate new private key.** Put that
   JSON into the server's `FCM_SERVICE_ACCOUNT` environment variable, inline or
   base64-encoded.

Both config files are gitignored — they carry project identifiers and belong to
your deployment, not to this repository.

### 3. Universal links and app links

Set these on the server so the two association files serve correctly:

```
APPLE_APP_ID="TEAMID.com.yourcompany.todo"
ANDROID_PACKAGE_NAME="com.yourcompany.todo"
ANDROID_CERT_FINGERPRINTS="AB:CD:...:EF"
```

The Android fingerprint must come from **Play Console → Setup → App signing**,
not your local keystore — Google re-signs your upload, so a local fingerprint
works in debug and then silently stops working in production.

Then in Xcode: **Signing & Capabilities** → add **Associated Domains** →
`applinks:tasks2do.app`, and add **Push Notifications** and
**Background Modes → Remote notifications**.

### 4. Build

```bash
npx cap sync
npx cap open ios       # Xcode: set team, bump version, Product → Archive
npx cap open android   # Android Studio: Build → Generate Signed Bundle
```

## What the stores will ask for

Both stores require a **privacy policy URL** and, for accounts, a
**data-deletion route**. Both exist:

- `https://your-domain.com/privacy`
- `https://your-domain.com/terms`
- Account deletion: **Settings → Account → Delete my account**, in-app and
  immediate. Apple Guideline 5.1.1(v) requires exactly this.

### Apple privacy labels

Declare honestly. This app collects, all **linked to the user** and **not used
for tracking**:

| Category | What | Purpose |
| --- | --- | --- |
| Contact info | Email address | Account, notifications |
| User content | Tasks, and the sender/subject/snippet your assistant copies from your mail and calendar | App functionality |
| Identifiers | Account id, push token | App functionality |
| Diagnostics | None | — |
| Usage data | None | — |

There is no advertising identifier, no analytics SDK, and no third-party
tracker in the build. Say so.

### Play Data Safety

Same content. Declare data **is** encrypted in transit, users **can** request
deletion, and deletion is available in-app. Link the deletion route above.

### Store listing

- **Name:** ToDo
- **Subtitle:** Agent-filled task inbox
- **Category:** Productivity
- **Screenshots:** the app in light and dark, on a phone. `docs/screenshots/`
  has the current UI; the stores need device-frame sizes.
- **Age rating:** 4+ / Everyone.
- **Description:** lead with the loop — your assistant fills the list, you
  clear it, and clearing it teaches the assistant what not to raise again.
  Be explicit that an AI subscription (Claude or ChatGPT) is required, or
  reviewers will flag the app as non-functional when they open it cold.

> Reviewers get an empty list unless you give them a way in. Provide a demo
> account in App Review notes with tasks already in it, and explain that the
> list is normally filled over MCP by the user's own assistant.

## Keeping them in step

The shells load the live site, so shipping web changes updates both apps with
no resubmission. You only need a new build when native config changes — the
server URL, a plugin, an icon, or a permission.
