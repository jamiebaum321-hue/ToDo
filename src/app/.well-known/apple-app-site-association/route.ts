export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Universal Links for iOS.
 *
 * Apple fetches this to learn which paths the app may open instead of Safari.
 * It must be served over HTTPS, without a redirect, as application/json —
 * which is why it is a route handler rather than a static file: Next would
 * otherwise serve it with the wrong content type.
 *
 * Set APPLE_APP_ID to "<TeamID>.<BundleID>", e.g. "AB12CD34EF.com.todoapp.inbox".
 */
export async function GET() {
  const appId = process.env.APPLE_APP_ID;

  // Serving an empty association is worse than serving none: iOS caches it.
  if (!appId) {
    return new Response(JSON.stringify({ error: "APPLE_APP_ID is not configured" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      applinks: {
        details: [
          {
            appIDs: [appId],
            components: [
              // Everything except the auth pages, which should stay in the
              // browser so password managers and email links behave normally.
              { "/": "/verify*", exclude: true },
              { "/": "/reset*", exclude: true },
              { "/": "/api/*", exclude: true },
              { "/": "/*" },
            ],
          },
        ],
      },
      webcredentials: { apps: [appId] },
    }),
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}
