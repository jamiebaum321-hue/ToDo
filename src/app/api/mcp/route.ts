import { handleMcpGet, handleMcpOptions, handleMcpPost } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleMcpPost(req);
}

export async function GET(req: Request) {
  return handleMcpGet(req);
}

/** Session teardown. This server is stateless, so there is nothing to tear down. */
export async function DELETE() {
  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return handleMcpOptions();
}
