import { getActor, type Actor } from "./auth";

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return json({ error: message, ...extra }, { status: 400 });
}

export function notFound(message = "Not found") {
  return json({ error: message }, { status: 404 });
}

export function unauthorized(message = "Sign in to continue") {
  return json({ error: message }, { status: 401 });
}

/** Every protected route funnels through here. */
export async function withActor(
  req: Request,
  handler: (actor: Actor) => Promise<Response>,
): Promise<Response> {
  const actor = await getActor(req);
  if (!actor) return unauthorized();
  try {
    return await handler(actor);
  } catch (err: any) {
    console.error("[api]", err);
    return json({ error: err?.message ?? "Something went wrong" }, { status: 500 });
  }
}

export async function readJson<T = any>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
