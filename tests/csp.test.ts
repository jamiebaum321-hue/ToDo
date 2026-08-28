import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * The Content-Security-Policy is the one piece of configuration that can break
 * a whole feature while every unit test still passes, because nothing in the
 * app reads it — the browser does.
 *
 * The OAuth consent form posts to /api/oauth/approve, which 303s to the
 * assistant's callback on another origin, and Chromium checks form-action
 * against that redirect. Under a blanket "form-action 'self'" it refuses the
 * submission outright: Allow access silently does nothing and no authorization
 * code is ever issued. These tests pin the shape that makes the flow work, and
 * pin the strictness everywhere else so widening it stays deliberate.
 */

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  const all = await nextConfig.headers!();
  return all as HeaderRule[];
}

/**
 * Next matches `source` with path-to-regexp, which is not a dependency here.
 * Only two shapes are used for the rules that carry a CSP — a literal path, and
 * one raw regex group — so model those rather than pull in a matcher whose
 * version could drift from Next's. The behaviour this stands in for was checked
 * against a running production build, route by route.
 */
function matches(source: string, path: string): boolean {
  const body = source.includes("(")
    ? source
    : source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\/:path\\\*$/, "(?:/.*)?");
  return new RegExp(`^${body}$`).test(path);
}

/** Every CSP a browser would apply to `path` — Next sends all matching rules. */
async function policiesFor(path: string): Promise<string[]> {
  return (await rules())
    .filter((rule) => matches(rule.source, path))
    .flatMap((rule) => rule.headers)
    .filter((h) => h.key.toLowerCase() === "content-security-policy")
    .map((h) => h.value);
}

function directive(policy: string, name: string): string {
  const found = policy.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return found ?? "";
}

describe("content security policy", () => {
  const ordinary = ["/", "/login", "/signup", "/connect", "/settings", "/activity", "/terms"];

  it("sends exactly one policy per page", async () => {
    // Two matching rules would both be sent, and the browser enforces the
    // intersection — which is how a route-specific relaxation silently fails.
    for (const path of [...ordinary, "/oauth/authorize"]) {
      expect(await policiesFor(path), path).toHaveLength(1);
    }
  });

  it("keeps form-action locked to the app on every ordinary page", async () => {
    for (const path of ordinary) {
      const [policy] = await policiesFor(path);
      expect(directive(policy, "form-action"), path).toBe("form-action 'self'");
    }
  });

  it("lets the consent screen hand the code back to the assistant", async () => {
    const [policy] = await policiesFor("/oauth/authorize");
    const formAction = directive(policy, "form-action");

    // https for a hosted assistant, loopback for a desktop one — the same two
    // cases redirectUriAllowed() accepts, and nothing wider.
    expect(formAction).toContain("https:");
    expect(formAction).toContain("http://localhost:*");
    expect(formAction).toContain("http://127.0.0.1:*");
    expect(formAction).not.toContain("http:*");
  });

  it("relaxes nothing but form-action on the consent screen", async () => {
    const [consent] = await policiesFor("/oauth/authorize");
    const [ordinaryPolicy] = await policiesFor("/login");

    const strip = (p: string) =>
      p.split(";").map((d) => d.trim()).filter((d) => !d.startsWith("form-action ")).sort();

    expect(strip(consent)).toEqual(strip(ordinaryPolicy));
  });

  it("still forbids the things that make a page dangerous", async () => {
    for (const path of [...ordinary, "/oauth/authorize"]) {
      const [policy] = await policiesFor(path);
      expect(directive(policy, "object-src"), path).toBe("object-src 'none'");
      expect(directive(policy, "base-uri"), path).toBe("base-uri 'self'");
      expect(directive(policy, "frame-ancestors"), path).toBe("frame-ancestors 'self'");
    }
  });
});
