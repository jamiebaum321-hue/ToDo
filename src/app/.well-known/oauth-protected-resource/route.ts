import { baseUrl, CORS_HEADERS } from "@/lib/oauth";

/** RFC 9728: tells an MCP client which authorization server guards /api/mcp. */
export function GET() {
  const base = baseUrl();
  return Response.json(
    {
      resource: base + "/api/mcp",
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      scopes_supported: ["tasks:read", "tasks:write", "notify"],
    },
    { headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
