export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * App Links for Android.
 *
 * Android checks this to decide whether the app may handle links to this
 * domain without asking. The fingerprint is the SHA-256 of the signing
 * certificate — take it from Play Console → Setup → App signing, not from your
 * local keystore, or links will work in debug and silently stop after release.
 */
export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || process.env.CAP_APP_ID;
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (!packageName || fingerprints.length === 0) {
    return new Response(JSON.stringify([]), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
      },
    ]),
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}
