import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.CRON_SECRET = process.env.CRON_SECRET || "test-secret-for-oauth-tests";

const {
  makeClientId,
  readClient,
  makeCode,
  readCode,
  makeGrant,
  readGrant,
  pkceMatches,
  redirectUriAllowed,
  sign,
  verify,
} = await import("@/lib/oauth");

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

describe("oauth signing", () => {
  it("round-trips a signed payload", () => {
    const blob = sign({ hello: "world" });
    expect(verify<{ hello: string }>(blob)?.hello).toBe("world");
  });

  it("rejects a tampered payload", () => {
    const blob = sign({ role: "user" });
    const [body, sig] = [blob.slice(0, blob.lastIndexOf(".")), blob.slice(blob.lastIndexOf(".") + 1)];
    const forged = Buffer.from(JSON.stringify({ role: "admin" })).toString("base64url") + "." + sig;
    expect(verify(forged)).toBeNull();
    expect(verify(body)).toBeNull();
    expect(verify(body + ".AAAA")).toBeNull();
  });
});

describe("client registration blobs", () => {
  it("round-trips name and redirect uris", () => {
    const id = makeClientId("Claude", [CALLBACK]);
    const client = readClient(id);
    expect(client?.name).toBe("Claude");
    expect(client?.redirectUris).toEqual([CALLBACK]);
  });

  it("refuses arbitrary strings as client ids", () => {
    expect(readClient("not-a-client")).toBeNull();
    expect(readClient("")).toBeNull();
  });
});

describe("authorization codes", () => {
  it("round-trips and carries the challenge", () => {
    const id = makeClientId("Claude", [CALLBACK]);
    const code = readCode(makeCode("user1", id, CALLBACK, "challenge123", "tasks:read"));
    expect(code?.uid).toBe("user1");
    expect(code?.challenge).toBe("challenge123");
    expect(code?.redirectUri).toBe(CALLBACK);
  });

  it("rejects an expired code", () => {
    const expired = sign({
      t: "code",
      uid: "user1",
      clientId: "c",
      redirectUri: CALLBACK,
      challenge: "x",
      scope: "",
      exp: Date.now() - 1000,
      jti: "j",
    });
    expect(readCode(expired)).toBeNull();
  });

  it("does not accept a grant blob as a code", () => {
    const grant = makeGrant({
      uid: "user1",
      clientId: "c",
      clientName: "Claude",
      redirectUri: CALLBACK,
      challenge: "x",
      scope: "",
      state: "",
    });
    expect(readCode(grant)).toBeNull();
    expect(readGrant(grant)?.uid).toBe("user1");
  });
});

describe("pkce", () => {
  it("accepts the matching S256 verifier and only that", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier + "x", challenge)).toBe(false);
    expect(pkceMatches("", challenge)).toBe(false);
  });
});

describe("redirect uri allow-listing", () => {
  const client = readClient(makeClientId("Claude", [CALLBACK, "http://localhost:3000/cb", "http://evil.example/cb"]))!;

  it("allows exactly what was registered, https or localhost only", () => {
    expect(redirectUriAllowed(CALLBACK, client)).toBe(true);
    expect(redirectUriAllowed("http://localhost:3000/cb", client)).toBe(true);
    expect(redirectUriAllowed("http://evil.example/cb", client)).toBe(false);
    expect(redirectUriAllowed("https://claude.ai/other", client)).toBe(false);
  });
});
