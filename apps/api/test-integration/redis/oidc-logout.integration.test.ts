import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import { createOidcSigningKeys } from "@iam/oidc";
import { createOidcInventory, createOidcMaintenance } from "@iam/oidc/maintenance";
import { createOidcRedisTestScope } from "@iam/oidc/testing";
import { afterEach, describe, expect, it } from "bun:test";
import { fixture, signingKeys } from "./oidc.fixture";

const fixtures: Array<Awaited<ReturnType<typeof fixture>>> = [];
afterEach(async () => {
  const results = await Promise.allSettled(fixtures.splice(0).map(f => f.close()));
  const failures = results.flatMap(r => (r.status === "rejected" ? [r.reason] : []));
  if (failures.length)
    throw new AggregateError(failures, "Logout fixture cleanup failed");
});
async function setup() {
  const f = await fixture(undefined, true);
  fixtures.push(f);
  await f.setClient(value => ({
    ...value,
    ssoConfig:
      value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
        ? { ...value.ssoConfig, postLogoutRedirectUris: ["https://rp.example/logout?kept=yes"] }
        : value.ssoConfig,
  }));
  await f.login();
  const authorization = await f.authorize({ scope: "openid" });
  const code = new URL(authorization.headers.get("Location")!).searchParams.get("code")!;
  const tokenResponse = await f.request("/oidc/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: f.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://rp.example/callback",
      code_verifier: "v".repeat(43),
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const tokens: { id_token: string; access_token: string } = await tokenResponse.json();
  const rootToken = f.cookies.get("global_session")!;
  const parameters = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      id_token_hint: tokens.id_token,
      client_id: f.clientId,
      post_logout_redirect_uri: "https://rp.example/logout?kept=yes",
      state: "state&<\"=",
      ...extra,
    });
  return Object.assign(f, { tokens, rootToken, logoutParameters: parameters });
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function begin(f: Fixture, parameters = f.logoutParameters(), post = false) {
  const response = await f.request(
    post ? "/oidc/session/end" : `/oidc/session/end?${parameters}`,
    post
      ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: parameters }
      : {},
  );
  const html = await response.text();
  return { response, html, xsrf: /name="xsrf" value="([^"]+)"/u.exec(html)?.[1] ?? "" };
}
async function confirm(f: Fixture, xsrf: string, yes = true, extra: Record<string, string> = {}) {
  return await f.request("/oidc/session/end/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ xsrf, ...(yes ? { logout: "yes" } : {}), ...extra }),
  });
}
async function rootStatus(f: Fixture, token = f.rootToken) {
  return await f.operations.run(
    async operation => (await f.kernel.forOperation(operation).resolveUserSession(token)).status,
  );
}
async function use(f: Fixture) {
  return await f.request("/oidc/me", { headers: { Authorization: `Bearer ${f.tokens.access_token}` } });
}

describe("OIDC candidate logout HTTP and real Redis", () => {
  it.each([false, true])("keeps default logout navigation relative when confirmed=%s", async (yes) => {
    const f = await setup();
    const start = await begin(f, new URLSearchParams());
    expect(start.response.status).toBe(200);
    expect(start.html).toContain("action=\"/oidc/session/end/confirm\"");
    const response = await confirm(f, start.xsrf, yes);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/oidc/session/end/success");
    const status = await rootStatus(f);
    expect(status).toBe(yes ? "terminated" : "resolved");
    const landing = await f.request(response.headers.get("Location")!);
    expect(landing.status).toBe(200);
  });
  it.each([false, true])(
    "accepts GET/form POST=%s, confirms with safe state redirect during Maintenance and terminates only request root",
    async (post) => {
      const f = await setup();
      const otherRoot = await f.login();
      f.cookies.set("global_session", f.rootToken);
      const start = await begin(f, f.logoutParameters(), post);
      expect(start.response.status).toBe(200);
      expect(start.html).toContain("No, stay signed in");
      expect(start.html).not.toContain(f.tokens.id_token);
      expect(start.response.headers.get("Cache-Control")).toBe("no-store");
      expect(start.response.headers.getSetCookie().join(";")).toContain("HttpOnly");
      expect(start.response.headers.getSetCookie().join(";")).toContain("SameSite=Lax");
      expect(start.response.headers.getSetCookie().join(";")).toContain("Path=/oidc/session/end");
      await f.setClient(value => ({ ...value, status: ClientStatus.Maintenance }));
      f.state.permission = "disabled";
      const before = f.state.reads;
      const response = await confirm(f, start.xsrf);
      expect(response.status).toBe(303);
      const target = new URL(response.headers.get("Location")!);
      expect(target.origin).toBe("https://rp.example");
      expect(target.searchParams.get("kept")).toBe("yes");
      expect(target.searchParams.get("state")).toBe("state&<\"=");
      expect(f.state.reads).toBe(before);
      expect(f.cookies.get("global_session")).toBe("");
      expect(await rootStatus(f)).toBe("terminated");
      expect(await rootStatus(f, otherRoot)).toBe("resolved");
      await f.setClient(value => ({ ...value, status: ClientStatus.Enable }));
      f.state.permission = "enabled";
      expect((await use(f)).status).toBe(401);
      expect(f.reports).toContainEqual(
        expect.objectContaining({
          event: "oidc_logout_effect",
          revocation: expect.objectContaining({ status: "terminated" }),
        }),
      );
    },
  );
  it("cancel consumes only the confirmation, preserves root/relationship/Token and returns accepted state", async () => {
    const f = await setup();
    const before = await f.oidcState.snapshot();
    const start = await begin(f);
    const oldCookies = new Map(f.cookies);
    const response = await confirm(f, start.xsrf, false);
    expect(response.status).toBe(303);
    expect(response.headers.getSetCookie().some(value => value.startsWith("global_session="))).toBe(false);
    expect(f.cookies.get("global_session")).toBe(f.rootToken);
    expect(await rootStatus(f)).toBe("resolved");
    expect((await use(f)).status).toBe(200);
    expect(await f.oidcState.snapshot()).toEqual(before);
    f.cookies.clear();
    oldCookies.forEach((value, key) => f.cookies.set(key, value));
    expect((await confirm(f, start.xsrf)).status).toBe(400);
    expect(await rootStatus(f)).toBe("resolved");
  });
  it("uses the root at confirm rather than the root shown by the confirmation page", async () => {
    const f = await setup();
    const start = await begin(f);
    const replacement = await f.login();
    const response = await confirm(f, start.xsrf);
    expect(response.status).toBe(303);
    expect(await rootStatus(f)).toBe("resolved");
    expect(await rootStatus(f, replacement)).toBe("terminated");
    expect((await use(f)).status).toBe(200);
  });
  it("allows already observed UserInfo to finish but rejects new derived access after root termination even without child index", async () => {
    const f = await setup();
    const start = await begin(f);
    const token = await f.oidcState.readToken(f.tokens.access_token);
    await f.scope.forgetChildIndex(token!.userSessionId);
    f.scope.afterNext("resolveClient", async () => {
      const response = await confirm(f, start.xsrf);
      expect(response.status).toBe(303);
    });
    const inFlight = await use(f);
    expect(inFlight.status).toBe(200);
    expect((await use(f)).status).toBe(401);
    expect(await rootStatus(f)).toBe("terminated");
    // A fresh authorization must not silently reuse the old root.
    f.cookies.set("global_session", f.rootToken);
    const next = await f.authorize({ prompt: "none" });
    expect(new URL(next.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
  });
  it.each(["hint", "client", "redirect", "no-hint", "duplicate"])(
    "rejects unsafe %s locally without root effects",
    async (caseName) => {
      const f = await setup();
      const params = f.logoutParameters();
      if (caseName === "hint")
        params.set("id_token_hint", "invalid");
      if (caseName === "client")
        params.set("client_id", "other-client");
      if (caseName === "redirect")
        params.set("post_logout_redirect_uri", "https://evil.example");
      if (caseName === "no-hint")
        params.delete("id_token_hint");
      if (caseName === "duplicate")
        params.append("state", "other");
      const start = await begin(f, params);
      expect(start.response.status).toBe(400);
      expect(start.response.headers.get("Location")).toBeNull();
      expect(JSON.parse(start.html).error).toBe("invalid_request");
      expect(start.response.headers.getSetCookie()).toEqual([]);
      expect(await rootStatus(f)).toBe("resolved");
    },
  );
  it.each(["xsrf", "browser", "handle", "expiry"])(
    "rejects %s mismatch/replay without consuming another valid flow",
    async (caseName) => {
      const f = await setup();
      const start = await begin(f);
      const cookies = new Map(f.cookies);
      if (caseName === "browser")
        f.cookies.set("oidc_logout_binding", "b".repeat(43));
      if (caseName === "handle")
        f.cookies.set("oidc_logout_request", "c".repeat(43));
      if (caseName === "expiry")
        await f.oidcState.patchLogout(f.cookies.get("oidc_logout_request")!, { expiresAt: 1 });
      const response = await confirm(f, caseName === "xsrf" ? "a".repeat(43) : start.xsrf);
      expect(response.status).toBe(400);
      expect(await rootStatus(f)).toBe("resolved");
      cookies.forEach((value, key) => f.cookies.set(key, value));
      if (caseName !== "expiry")
        expect((await confirm(f, start.xsrf, false)).status).toBe(303);
    },
  );
  it.each(["root", "configuration", "state", "corrupt"])(
    "preserves recoverable cookies on %s unavailability",
    async (caseName) => {
      const f = await setup();
      const start = await begin(f);
      if (caseName === "root")
        f.scope.failNext("resolveUser");
      if (caseName === "configuration")
        f.state.clientFailure = true;
      if (caseName === "state")
        f.oidcState.failNext("logout");
      if (caseName === "corrupt")
        await f.oidcState.patchLogout(f.cookies.get("oidc_logout_request")!, { state: 123 });
      const response = await confirm(f, start.xsrf);
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(f.cookies.get("global_session")).toBe(f.rootToken);
      f.state.clientFailure = false;
      expect(await rootStatus(f)).toBe("resolved");
    },
  );
  it.each([false, true])(
    "reports revocation uncertainty after execution=%s without claiming logout or clearing cookies",
    async (after) => {
      const f = await setup();
      const start = await begin(f);
      f.scope.failNext("revoke", after);
      const response = await confirm(f, start.xsrf);
      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await rootStatus(f)).toBe(after ? "terminated" : "resolved");
      expect(f.reports).toContainEqual(
        expect.objectContaining({
          event: "oidc_logout_effect",
          revocation: expect.objectContaining({ status: "unknown" }),
        }),
      );
    },
  );
  it("clears an explicitly missing root, supports subjectless auto-submit and preserves accepted redirect after edits", async () => {
    const f = await setup();
    f.cookies.set("global_session", "missing");
    const start = await begin(f);
    expect(start.response.status).toBe(200);
    expect(start.html).toContain("document.forms[0].submit()");
    expect(f.cookies.get("global_session")).toBe("");
    await f.setClient(value => ({
      ...value,
      ssoConfig:
        value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
          ? { ...value.ssoConfig, postLogoutRedirectUris: [] }
          : value.ssoConfig,
    }));
    const response = await confirm(f, start.xsrf);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("Location")!).origin).toBe("https://rp.example");
  });
  it("accepts expired hints from current/previous server keys; rejects wrong issuer, audience, signature and algorithms", async () => {
    const f = await setup();
    const claims = {
      iss: "https://iam.example/oidc",
      aud: f.clientId,
      sub: f.subjectIdentifier,
      exp: 1,
      iat: 0,
    };
    expect(
      (await begin(f, f.logoutParameters({ id_token_hint: await f.signing.sign(claims) }))).response.status,
    ).toBe(200);
    const other = createOidcSigningKeys({ currentJwkJson: signingKeys("untrusted") });
    for (const hint of [
      await f.signing.sign({ ...claims, iss: "https://evil.example" }),
      await f.signing.sign({ ...claims, aud: "other" }),
      await other.sign(claims),
      `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.x`,
    ]) {
      expect((await begin(f, f.logoutParameters({ id_token_hint: hint }))).response.status).toBe(400);
    }
    const current = signingKeys();
    const previous = signingKeys("previous");
    const keys = createOidcSigningKeys({ currentJwkJson: current, previousJwkJson: previous });
    const hint = await createOidcSigningKeys({ currentJwkJson: previous }).sign(claims);
    expect(await keys.verifyLogoutHint(hint, claims.iss)).toEqual({
      clientId: f.clientId,
      subjectIdentifier: f.subjectIdentifier,
    });
  });
  it("maintains logout inventory without TTL and preserves unknown/non-target records with independent verification", async () => {
    const f = await setup();
    await begin(f);
    await f.oidcState.removeLogoutTtl(f.cookies.get("oidc_logout_request")!);
    await f.oidcState.addUnknown();
    const maintenance = createOidcMaintenance(f.oidcState.redis, f.oidcState.namespace);
    expect((await maintenance.inventory({ clientId: randomUUID() })).matching).toBe(0);
    const before = await maintenance.inventory({ clientId: f.clientId });
    expect(before.matching).toBe(2);
    expect(before.unknown).toBe(1);
    const applied = await maintenance.apply({ clientId: f.clientId });
    expect(applied.removed).toBe(2);
    const independent = await createOidcRedisTestScope(process.env.IAM_API_TEST_REDIS_URL!);
    try {
      expect(
        (
          await createOidcInventory(independent.redis, f.oidcState.namespace).inventory({
            clientId: f.clientId,
          })
        ).matching,
      ).toBe(0);
    }
    finally {
      await independent.close();
    }
    expect((await f.oidcState.snapshot()).length).toBe(1);
  });
});
