import { CORS_HEADERS, makeClientId, oauthConfigured } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 dynamic client registration, statelessly: the client_id we hand
 * back is a signed blob carrying the client's name and redirect URIs, so
 * there is no clients table to fill with abandoned registrations. Anyone can
 * register — that is how the spec works — but a registration grants nothing:
 * tokens only exist after a signed-in user presses Allow.
 */
export async function POST(req: Request) {
  if (!oauthConfigured()) {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "OAuth is not configured on this server." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string" && u.length < 500).slice(0, 8)
    : [];
  if (uris.length === 0) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const name =
    typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 60) : "MCP client";

  return Response.json(
    {
      client_id: makeClientId(name, uris),
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201, headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
