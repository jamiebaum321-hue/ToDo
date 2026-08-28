import { baseUrl, CORS_HEADERS } from "@/lib/oauth";

/**
 * RFC 8414 authorization server metadata. MCP clients — Claude, ChatGPT —
 * discover the authorize, token and registration endpoints from here, which
 * is what turns "paste a URL" into "sign in and press Allow".
 */
export function GET() {
  const base = baseUrl();
  return Response.json(
    {
      issuer: base,
      authorization_endpoint: base + "/oauth/authorize",
      token_endpoint: base + "/api/oauth/token",
      registration_endpoint: base + "/api/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["tasks:read", "tasks:write", "notify"],
    },
    { headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
