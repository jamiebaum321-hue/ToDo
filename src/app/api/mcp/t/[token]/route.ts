import { handleMcpGet, handleMcpOptions, handleMcpPost } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Token-in-the-URL variant, for MCP clients whose connector UI only accepts a
 * URL with no place to add a header. Same handler, same auth rules.
 */
type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return handleMcpPost(req, token);
}

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return handleMcpGet(req, token);
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return handleMcpOptions();
}
