import { issueApiToken } from "@/lib/auth";
import { CORS_HEADERS, oauthConfigured, pkceMatches, readClient, readCode } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function failure(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...CORS_HEADERS, "cache-control": "no-store" } },
  );
}

/**
 * The token endpoint. A valid, PKCE-verified authorization code is exchanged
 * for a normal ApiToken — the same kind a user creates by hand — so every
 * OAuth connection shows up in Settings and can be revoked like any other.
 * The token has no expiry, which is why no refresh_token is issued.
 */
export async function POST(req: Request) {
  if (!oauthConfigured()) return failure("invalid_request", "OAuth is not configured on this server.", 500);

  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
    } catch {
      return failure("invalid_request", "The request body is not valid JSON.");
    }
  } else {
    params = new URLSearchParams(await req.text());
  }

  if (params.get("grant_type") !== "authorization_code") {
    return failure("unsupported_grant_type", "Only authorization_code is supported.");
  }

  const code = readCode(params.get("code") ?? "");
  if (!code) return failure("invalid_grant", "The authorization code is invalid or has expired.");

  const clientId = params.get("client_id");
  if (clientId && clientId !== code.clientId) {
    return failure("invalid_grant", "client_id does not match the one the code was issued to.");
  }
  const client = readClient(code.clientId);
  if (!client) return failure("invalid_client", "Unknown client.", 401);

  const redirectUri = params.get("redirect_uri");
  if (redirectUri && redirectUri !== code.redirectUri) {
    return failure("invalid_grant", "redirect_uri does not match the one the code was issued to.");
  }

  const verifier = params.get("code_verifier") ?? "";
  if (!verifier || !pkceMatches(verifier, code.challenge)) {
    return failure("invalid_grant", "PKCE verification failed.");
  }

  const { record, token } = await issueApiToken(code.uid, client.name + " (OAuth)");
  return Response.json(
    {
      access_token: token,
      token_type: "bearer",
      scope: record.scopes.split(",").map((s) => s.trim()).join(" "),
    },
    { headers: { ...CORS_HEADERS, "cache-control": "no-store" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
