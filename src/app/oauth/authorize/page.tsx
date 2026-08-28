import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthShell } from "@/components/app/AuthShell";
import { makeGrant, oauthConfigured, readClient, redirectUriAllowed } from "@/lib/oauth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Authorize access" };

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function Refused({ reason }: { reason: string }) {
  return (
    <AuthShell>
      <div>
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          That connection did not work
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          {reason}
        </p>
      </div>
    </AuthShell>
  );
}

/**
 * The OAuth consent screen. An MCP client sends the user here; once they are
 * signed in, a single Allow mints an authorization code and sends them back.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const state = one(sp.state);
  const challenge = one(sp.code_challenge);
  const method = one(sp.code_challenge_method) || "S256";
  const responseType = one(sp.response_type) || "code";
  const scope = one(sp.scope);

  if (!oauthConfigured()) {
    return <Refused reason="OAuth is not configured on this server, so it cannot authorize assistants." />;
  }
  const client = readClient(clientId);
  if (!client) {
    return <Refused reason="This request is not from a registered client. Go back to your assistant and start the connection again." />;
  }
  if (!redirectUri || !redirectUriAllowed(redirectUri, client)) {
    return <Refused reason="The return address does not match what this client registered, so the request was refused." />;
  }
  if (responseType !== "code") {
    return <Refused reason="Only the authorization code flow is supported." />;
  }
  if (!challenge || method !== "S256") {
    return <Refused reason="This client did not send a PKCE challenge, so the request was refused." />;
  }

  const user = await getSessionUser();
  if (!user) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) params.set(key, one(value));
    redirect("/login?next=" + encodeURIComponent("/oauth/authorize?" + params.toString()));
  }

  const grant = makeGrant({
    uid: user.id,
    clientId,
    clientName: client.name,
    redirectUri,
    challenge,
    scope,
    state,
  });

  return (
    <AuthShell>
      <form method="POST" action="/api/oauth/approve">
        <h2 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          Connect {client.name}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          {client.name} is asking for access to the list that belongs to {user.email}. Allowing it lets this assistant:
        </p>

        <ul className="mt-4 space-y-2">
          <li className="flex items-baseline gap-2.5 text-[14px]" style={{ color: "var(--text-2)" }}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--text-3)" }} />
            Read every task on your list
          </li>
          <li className="flex items-baseline gap-2.5 text-[14px]" style={{ color: "var(--text-2)" }}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--text-3)" }} />
            Add, complete, snooze and remove tasks
          </li>
          <li className="flex items-baseline gap-2.5 text-[14px]" style={{ color: "var(--text-2)" }}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--text-3)" }} />
            Send you notifications about them
          </li>
        </ul>

        <input type="hidden" name="grant" value={grant} />

        <button
          type="submit"
          name="decision"
          value="allow"
          className="mt-6 w-full rounded-2xl px-4 py-3 text-[15px] font-extrabold transition active:scale-[0.98]"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Allow access
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="mt-2.5 w-full rounded-2xl px-4 py-3 text-[15px] font-bold"
          style={{ border: "1px solid var(--line)", color: "var(--text-2)", background: "transparent" }}
        >
          Cancel
        </button>

        <p className="mt-5 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          The connection shows up under Connect your assistant, and you can revoke it there at any time.
        </p>
      </form>
    </AuthShell>
  );
}
