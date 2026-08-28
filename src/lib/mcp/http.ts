import { prisma } from "../db";
import { sha256 } from "../crypto";
import type { Actor } from "../auth";
import { handleMessage } from "./server";
import { ERROR_CODES, fail, LATEST_PROTOCOL_VERSION } from "./protocol";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function unauthorized(detail: string) {
  return new Response(
    JSON.stringify(
      fail(null, ERROR_CODES.INVALID_REQUEST, detail, {
        hint: "Create a connection token in ToDo → Settings → Connect your assistant, then send it as `Authorization: Bearer <token>`.",
      }),
    ),
    {
      status: 401,
      headers: {
        ...JSON_HEADERS,
        "www-authenticate": 'Bearer realm="ToDo MCP", error="invalid_token"',
      },
    },
  );
}

/**
 * Resolve the caller.
 *
 * A bearer header is the right way to do this. Some MCP clients only let you
 * paste a URL, though, so a token in the path or query is accepted as well —
 * documented, with the caveat that URLs turn up in logs and history.
 */
async function resolveActor(req: Request, pathToken?: string): Promise<Actor | null> {
  let token: string | undefined;

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  if (bearer) token = bearer[1].trim();

  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get("key") ?? url.searchParams.get("token") ?? undefined;
  }
  if (!token && pathToken) token = pathToken;
  if (!token) return null;

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return {
    user: record.user,
    via: "token",
    tokenId: record.id,
    scopes: record.scopes.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

function wantsSse(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/event-stream") && !accept.includes("application/json");
}

function sseResponse(payload: unknown) {
  const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}

export async function handleMcpPost(req: Request, pathToken?: string): Promise<Response> {
  const actor = await resolveActor(req, pathToken);
  if (!actor) return unauthorized("Missing or invalid connection token.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(fail(null, ERROR_CODES.PARSE_ERROR, "Request body is not valid JSON.")), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const result = await handleMessage(body, actor);

  // Notifications get no body — 202 is what the transport spec asks for.
  if (result === null) return new Response(null, { status: 202 });

  if (wantsSse(req)) return sseResponse(result);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...JSON_HEADERS, "mcp-protocol-version": LATEST_PROTOCOL_VERSION },
  });
}

/**
 * The GET side of Streamable HTTP is for the server pushing messages to the
 * client unprompted. This server has nothing to say between requests, so it
 * declines — which the spec explicitly allows.
 */
export async function handleMcpGet(req: Request, pathToken?: string): Promise<Response> {
  const actor = await resolveActor(req, pathToken);
  if (!actor) return unauthorized("Missing or invalid connection token.");
  return new Response(
    JSON.stringify({ status: "ok", server: "todo", transport: "streamable-http", note: "POST JSON-RPC to this URL." }),
    { status: 200, headers: JSON_HEADERS },
  );
}

export function handleMcpOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Accept",
      "access-control-max-age": "86400",
    },
  });
}
