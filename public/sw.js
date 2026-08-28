/* ToDo service worker — offline shell + web push.
 * Bump CACHE when the shell changes; old caches are dropped on activate.
 */
const CACHE = "todo-v1";

/* Only things that are safe to serve from a cache with no session attached. */
const SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/mark-512.png",
  "/brand/mark-256.png",
  "/brand/mark-128.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing asset must not wedge the whole install.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* The task list is personal and changes constantly — never serve it stale. */
  if (url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((hit) => hit || Response.error())),
    );
  }
});

/* --- push ------------------------------------------------------------- */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "ToDo", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "ToDo";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-48.png",
    /* Same tag replaces rather than stacks, so a phone left alone all morning
       does not come back to nine copies of the digest. */
    tag: payload.tag || "todo",
    renotify: Boolean(payload.urgent),
    requireInteraction: Boolean(payload.urgent),
    data: { url: payload.url || "/", taskId: payload.taskId || null },
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
  };
  if (typeof payload.badge === "number" && self.navigator && self.navigator.setAppBadge) {
    self.navigator.setAppBadge(payload.badge).catch(() => undefined);
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      /* Reuse an open tab where we can — a second window is never what you meant. */
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
