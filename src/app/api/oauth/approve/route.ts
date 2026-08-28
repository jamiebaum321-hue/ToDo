import { getSessionUser } from "@/lib/auth";
import { makeCode, readGrant } from "@/lib/oauth";

export const dynamic = "force-dynamic";

function plain(text: string, status: number) {
  return new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/**
 * Where the consent form lands. The hidden `grant` field is a signed blob the
 * authorize page minted for this user and this client, so nothing here trusts
 * the form beyond its signature — and the session cookie (SameSite=Lax, never
 * sent on a cross-site POST) proves the click came from the signed-in owner.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const grant = readGrant(String(form.get("grant") ?? ""));
  if (!grant) {
    return plain("This authorization request has expired. Go back to your assistant and connect again.", 400);
  }

  const user = await getSessionUser();
  if (!user || user.id !== grant.uid) {
    return plain("Your session changed while approving. Go back to your assistant and connect again.", 403);
  }

  const to = new URL(grant.redirectUri);
  if (String(form.get("decision")) === "allow") {
    to.searchParams.set("code", makeCode(user.id, grant.clientId, grant.redirectUri, grant.challenge, grant.scope));
  } else {
    to.searchParams.set("error", "access_denied");
  }
  if (grant.state) to.searchParams.set("state", grant.state);
  return Response.redirect(to.toString(), 303);
}
