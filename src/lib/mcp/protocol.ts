/**
 * A small, dependency-free implementation of the MCP wire format.
 *
 * Everything MCP needs over HTTP is JSON-RPC 2.0 plus a handful of method
 * names, and doing it directly means the endpoint is a plain Next.js route
 * handler with no transport shim between the request and the database.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = {
  name: "todo",
  title: "ToDo",
  version: "1.0.0",
} as const;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function fail(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined || req.id === null;
}

export function negotiateVersion(requested?: string): string {
  if (requested && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) return requested;
  return LATEST_PROTOCOL_VERSION;
}

/** MCP tool results are a content array; text is what every client can read. */
export function textResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

/**
 * Tools answer with a one-line summary a human can read in the transcript,
 * followed by the full JSON payload for the model to actually work from.
 */
export function dataResult(summary: string, data: unknown) {
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }],
    isError: false,
  };
}

export function errorResult(message: string) {
  return textResult(message, true);
}
