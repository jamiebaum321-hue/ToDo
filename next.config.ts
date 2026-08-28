import type { NextConfig } from "next";

/**
 * The site-wide policy. The app ships no third-party scripts, so it can be
 * tight: 'unsafe-inline' on styles is required by Next's inlined critical CSS,
 * and script-src keeps 'unsafe-inline' only for the pre-paint theme script,
 * which must run before hydration to avoid a flash.
 *
 * form-action is the one directive that varies by route, so it is a parameter.
 * Note that two matching header rules both apply and the browser enforces the
 * intersection, so the strict rule below has to *exclude* the consent page
 * rather than simply being overridden by it.
 */
function csp(formAction: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `form-action ${formAction}`,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    // The native shells load the app from their own origin.
    "connect-src 'self' https://fcm.googleapis.com capacitor://localhost http://localhost",
    "manifest-src 'self'",
    "worker-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Everything except the OAuth consent screen. */
const NOT_CONSENT = "/((?!oauth/authorize$).*)";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["web-push", "@prisma/client"],
  async headers() {
    return [
      {
        // The service worker must never be served stale, or push + offline
        // behaviour silently drifts from what is deployed.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // The MCP endpoint is called cross-origin by Claude / ChatGPT.
        source: "/api/mcp",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Accept",
          },
          { key: "Access-Control-Expose-Headers", value: "Mcp-Session-Id" },
        ],
      },
      {
        source: "/.well-known/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, MCP-Protocol-Version" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          {
            // Two years, preloadable. Only meaningful over HTTPS; browsers
            // ignore it on plain HTTP, so it is safe to send unconditionally.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // The consent screen is the one page that must post across origins: the
        // form goes to /api/oauth/approve, which 303s to the assistant's
        // callback, and Chromium checks form-action against that redirect too.
        // Under "form-action 'self'" the browser refuses the submission outright
        // — Allow access does nothing and no code is ever issued. Widened here
        // to exactly what redirectUriAllowed() accepts: any https callback, or
        // loopback for a desktop client.
        source: "/oauth/authorize",
        headers: [{ key: "Content-Security-Policy", value: csp("'self' https: http://localhost:* http://127.0.0.1:*") }],
      },
      {
        source: NOT_CONSENT,
        headers: [{ key: "Content-Security-Policy", value: csp("'self'") }],
      },
    ];
  },
};

export default nextConfig;
