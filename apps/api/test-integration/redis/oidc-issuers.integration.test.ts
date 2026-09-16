import type { OidcTokenResponse } from "@iam/oidc/wire";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { ClientSsoProtocol, OidcClientType } from "@iam/contracts";
import { expect, test } from "bun:test";
import { fixture } from "./oidc.fixture";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Entry = "internal" | "external";
const entries: Entry[] = ["internal", "external"];
const other = (entry: Entry): Entry => entry === "internal" ? "external" : "internal";
function basic(client: string, secret = "current secret:+") {
  return `Basic ${Buffer.from(`${encodeURIComponent(client)}:${encodeURIComponent(secret)}`).toString("base64")}`;
}
async function authorize(f: Fixture, entry: Entry, extra: Record<string, string> = {}) {
  const response = await f.request(`/oidc/auth?${f.parameters(extra)}`, {
    headers: { "X-IAM-Entry-Network": entry },
  });
  expect(response.status).toBe(303);
  const parameters = new URL(response.headers.get("Location")!).searchParams;
  expect(parameters.get("iss")).toBe(f.issuers[entry]);
  const code = parameters.get("code")!;
  const record = await f.oidcState.readCode(extra.client_id ?? f.clientId, code);
  if (!record)
    throw new Error("Expected Code");
  return { code, record, target: {
    kind: "clientSession" as const,
    id: record.clientSessionId,
    instance: record.clientSessionInstance,
    userSessionId: record.userSessionId,
    subjectIdentifier: f.subjectIdentifier,
    clientId: record.clientId,
  } };
}
async function exchange(
  f: Fixture,
  entry: Entry,
  code: string,
  extra: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return await f.request("/oidc/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-IAM-Entry-Network": entry, ...headers },
    body: new URLSearchParams({ client_id: f.clientId, grant_type: "authorization_code", code, redirect_uri: "https://rp.example/callback", code_verifier: "v".repeat(43), ...extra }),
  });
}
async function token(f: Fixture, entry: Entry, clientId = f.clientId) {
  const issued = await authorize(f, entry, { client_id: clientId });
  const response = await exchange(f, entry, issued.code, { client_id: clientId });
  expect(response.status).toBe(200);
  const value: OidcTokenResponse = await response.json();
  return { ...issued, value };
}
async function use(f: Fixture, entry: Entry, bearer: string) {
  return await f.request("/oidc/me", { headers: { "X-IAM-Entry-Network": entry, "Authorization": `Bearer ${bearer}` } });
}
async function root(f: Fixture) {
  return await f.operations.run(operation => f.kernel.forOperation(operation).resolveUserSession(f.cookies.get("global_session")!));
}
async function beginLogout(f: Fixture, entry: Entry, hint?: string) {
  const response = await f.request(`/oidc/session/end?${new URLSearchParams(hint ? { id_token_hint: hint } : {})}`, {
    headers: { "X-IAM-Entry-Network": entry },
  });
  const html = await response.text();
  return { response, xsrf: /name="xsrf" value="([^"]+)"/u.exec(html)?.[1] ?? "" };
}
async function confirm(f: Fixture, entry: Entry, xsrf: string, yes: boolean) {
  return await f.request("/oidc/session/end/confirm", {
    method: "POST",
    headers: { "X-IAM-Entry-Network": entry, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ xsrf, ...(yes ? { logout: "yes" } : {}) }),
  });
}

for (const entry of entries) {
  for (const confidential of [false, true]) {
    test(`${entry} issuer completes Discovery, shared-key Code/Token and UserInfo for ${confidential ? "Confidential" : "Public"}`, async () => {
      const f = await fixture(undefined, true);
      try {
        if (confidential) {
          await f.setClient(value => ({ ...value, ssoConfig: value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
            ? { ...value.ssoConfig, clientType: OidcClientType.Confidential }
            : null }));
        }
        await f.login();
        const metadataResponse = await f.request("/oidc/.well-known/openid-configuration", { headers: {
          "X-IAM-Entry-Network": entry,
          "Host": "attacker.example",
          "Forwarded": "host=attacker.example;proto=https",
        } });
        const metadata = await metadataResponse.json();
        expect(metadata).toMatchObject({ issuer: f.issuers[entry], authorization_endpoint: `${f.issuers[entry]}/auth`, token_endpoint: `${f.issuers[entry]}/token`, userinfo_endpoint: `${f.issuers[entry]}/me`, end_session_endpoint: `${f.issuers[entry]}/session/end`, jwks_uri: `${f.issuers[entry]}/jwks`, authorization_response_iss_parameter_supported: true });
        expect(metadataResponse.headers.get("Cache-Control")).toBe("no-store");
        const jwks = await f.request("/oidc/jwks", { headers: { "X-IAM-Entry-Network": entry } });
        const otherJwks = await f.request("/oidc/jwks", { headers: { "X-IAM-Entry-Network": other(entry) } });
        const keys = await jwks.json();
        const sharedKeys = await otherJwks.json();
        expect(keys).toEqual(sharedKeys);
        expect(keys.keys.map((key: { kid: string }) => key.kid).sort()).toEqual(["current", "previous"]);
        const issued = await authorize(f, entry, { nonce: "original-nonce", issuer: f.issuers[other(entry)] });
        const exchanged = await exchange(
          f,
          entry,
          issued.code,
          {},
          confidential ? { Authorization: basic(f.clientId) } : {},
        );
        expect(exchanged.status).toBe(200);
        const value: OidcTokenResponse = await exchanged.json();
        const claims = JSON.parse(Buffer.from(value.id_token.split(".")[1]!, "base64url").toString());
        expect(claims).toMatchObject({ iss: f.issuers[entry], sub: f.subjectIdentifier, aud: f.clientId, nonce: "original-nonce" });
        const stored = await f.oidcState.readToken(value.access_token);
        expect(stored?.issuer).toBe(f.issuers[entry]);
        const userInfo = await use(f, entry, value.access_token);
        expect(userInfo.status).toBe(200);
        const body = await userInfo.json();
        expect(body.sub).toBe(f.subjectIdentifier);
      }
      finally { await f.close(); }
    });
  }

  for (const mode of ["query", "fragment", "form_post"]) {
    test(`${entry} ${mode} safe authorization errors identify the accepted issuer`, async () => {
      const f = await fixture(undefined, true);
      try {
        const response = await f.request(`/oidc/auth?${f.parameters({ response_mode: mode, response_type: "token" })}`, {
          headers: { "X-IAM-Entry-Network": entry },
        });
        if (mode === "form_post") {
          expect(response.status).toBe(200);
          const html = await response.text();
          expect(html).toContain(`name="iss" value="${f.issuers[entry]}"`);
          expect(html).toContain("name=\"error\" value=\"unsupported_response_type\"");
        }
        else {
          expect(response.status).toBe(303);
          const location = new URL(response.headers.get("Location")!);
          const params = mode === "query" ? location.searchParams : new URLSearchParams(location.hash.slice(1));
          expect(params.get("iss")).toBe(f.issuers[entry]);
          expect(params.get("error")).toBe("unsupported_response_type");
        }
        expect(response.headers.getSetCookie()).toEqual([]);
        const inventory = await f.oidcState.snapshot();
        expect(inventory).toEqual([]);
        await f.login();
        await authorize(f, entry);
      }
      finally { await f.close(); }
    });
  }

  test(`${entry} an unregistered authorization redirect is rejected locally without state or Cookie effects`, async () => {
    const f = await fixture(undefined, true);
    try {
      const response = await f.request(`/oidc/auth?${f.parameters({ redirect_uri: "https://attacker.example/cb" })}`, {
        headers: { "X-IAM-Entry-Network": entry },
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("invalid_request");
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      const inventory = await f.oidcState.snapshot();
      expect(inventory).toEqual([]);
      await f.login();
      await authorize(f, entry);
    }
    finally { await f.close(); }
  });

  test(`${entry} continuation rejects the other issuer before permission, completion, consumption or Cookie effects`, async () => {
    const f = await fixture(undefined, true);
    try {
      f.setEntry(entry);
      const start = await f.authorize({ prompt: "login" });
      const handle = new URL(start.headers.get("Location")!, "https://browser.example").searchParams.get("oidcReturn")!;
      const binding = f.cookies.get("oidc_interaction_binding")!;
      const saved = await f.oidcState.readContinuation(handle, binding);
      expect(saved?.authorization.issuer).toBe(f.issuers[entry]);
      for (const loggedIn of [false, true]) {
        if (loggedIn)
          await f.login();
        for (const path of ["login-guard", "resume"]) {
          const before = await f.oidcState.snapshot();
          const reads = { reads: f.state.reads, acquisitions: f.state.acquisitions };
          const denied = await f.request(`/oidc/${path}?oidcReturn=${handle}`, { headers: { "X-IAM-Entry-Network": other(entry) } });
          expect(denied.status).toBe(400);
          expect(denied.headers.getSetCookie()).toEqual([]);
          const after = await f.oidcState.snapshot();
          expect(after).toEqual(before);
          expect({ reads: f.state.reads, acquisitions: f.state.acquisitions }).toEqual(reads);
        }
        if (!loggedIn) {
          const guard = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
          expect(guard.status).toBe(200);
        }
      }
      const resumed = await f.request(`/oidc/resume?oidcReturn=${handle}`);
      expect(resumed.status).toBe(303);
      expect(new URL(resumed.headers.get("Location")!).searchParams.get("iss")).toBe(f.issuers[entry]);
    }
    finally { await f.close(); }
  });

  test(`${entry} wrong-issuer Code is consumed, revokes only the shared original relationship and cannot be retried`, async () => {
    const f = await fixture(undefined, true);
    try {
      await f.login();
      const first = await token(f, entry);
      const shared = await token(f, other(entry));
      expect(shared.record.clientSessionId).toBe(first.record.clientSessionId);
      const otherClient = `other-${randomUUID()}`;
      f.addClient(otherClient);
      const unrelated = await token(f, entry, otherClient);
      const originalRoot = await root(f);
      const issued = await authorize(f, entry);
      const signatures = f.state.signatures;
      const failed = await exchange(f, other(entry), issued.code);
      expect(failed.status).toBe(400);
      const error = await failed.json();
      expect(error.error).toBe("invalid_grant");
      expect(f.state.signatures).toBe(signatures);
      expect(failed.headers.getSetCookie()).toEqual([]);
      const consumed = await f.oidcState.readCode(f.clientId, issued.code);
      expect(consumed).toBeNull();
      expect(f.reports.at(-1)).toMatchObject({ consumption: "consumed", revocation: { status: "terminated", target: issued.target } });
      const currentRoot = await root(f);
      if (originalRoot.status !== "resolved" || currentRoot.status !== "resolved")
        throw new Error("Root unexpectedly invalid");
      expect(currentRoot.value.userSession).toEqual(originalRoot.value.userSession);
      const firstUse = await use(f, entry, first.value.access_token);
      const sharedUse = await use(f, other(entry), shared.value.access_token);
      const unrelatedUse = await use(f, entry, unrelated.value.access_token);
      expect([firstUse.status, sharedUse.status, unrelatedUse.status]).toEqual([401, 401, 200]);
      const renewed = await token(f, entry);
      expect(renewed.record.clientSessionId).not.toBe(issued.record.clientSessionId);
      const retry = await exchange(f, entry, issued.code);
      expect(retry.status).toBe(400);
      const renewedUse = await use(f, entry, renewed.value.access_token);
      expect(renewedUse.status).toBe(200);
    }
    finally { await f.close(); }
  });

  test(`${entry} UserInfo mismatch does not acquire session facts or change online state`, async () => {
    const f = await fixture(undefined, true);
    try {
      await f.login();
      const issued = await token(f, entry);
      const before = await f.oidcState.snapshot();
      const observed = { reads: f.state.reads, acquisitions: f.state.acquisitions, facts: f.state.factReads };
      const wrong = await use(f, other(entry), issued.value.access_token);
      expect(wrong.status).toBe(401);
      expect(wrong.headers.getSetCookie()).toEqual([]);
      expect({ reads: f.state.reads, acquisitions: f.state.acquisitions, facts: f.state.factReads }).toEqual(observed);
      const after = await f.oidcState.snapshot();
      expect(after).toEqual(before);
      expect(f.reports).toEqual([]);
      const valid = await use(f, entry, issued.value.access_token);
      expect(valid.status).toBe(200);
    }
    finally { await f.close(); }
  });

  test(`${entry} logout hint mismatch does not acquire session facts or change online state`, async () => {
    const f = await fixture(undefined, true);
    try {
      await f.login();
      const issued = await token(f, entry);
      const before = await f.oidcState.snapshot();
      const observed = { reads: f.state.reads, acquisitions: f.state.acquisitions, facts: f.state.factReads };
      const hint = await beginLogout(f, other(entry), issued.value.id_token);
      expect(hint.response.status).toBe(400);
      expect(hint.response.headers.getSetCookie()).toEqual([]);
      expect({ reads: f.state.reads, acquisitions: f.state.acquisitions, facts: f.state.factReads }).toEqual(observed);
      const after = await f.oidcState.snapshot();
      expect(after).toEqual(before);
      expect(f.reports).toEqual([]);
      const valid = await use(f, entry, issued.value.access_token);
      expect(valid.status).toBe(200);
      const acceptedHint = await beginLogout(f, entry, issued.value.id_token);
      expect(acceptedHint.response.status).toBe(200);
    }
    finally { await f.close(); }
  });

  for (const yes of [false, true]) {
    test(`${entry} logout choice confirm=${yes} cannot consume or act through another issuer`, async () => {
      const f = await fixture(undefined, true);
      try {
        await f.login();
        const issued = await token(f, entry);
        const start = await beginLogout(f, entry, issued.value.id_token);
        expect(start.response.status).toBe(200);
        const before = await f.oidcState.snapshot();
        const cookies = [...f.cookies];
        const wrong = await confirm(f, other(entry), start.xsrf, yes);
        expect(wrong.status).toBe(400);
        expect(wrong.headers.getSetCookie()).toEqual([]);
        expect([...f.cookies]).toEqual(cookies);
        const after = await f.oidcState.snapshot();
        expect(after).toEqual(before);
        expect(f.reports).toEqual([]);
        const valid = await use(f, entry, issued.value.access_token);
        expect(valid.status).toBe(200);
        const finished = await confirm(f, entry, start.xsrf, yes);
        expect(finished.status).toBe(303);
        expect(finished.headers.get("Location")).toBe("/oidc/session/end/success");
        const result = await use(f, entry, issued.value.access_token);
        expect(result.status).toBe(yes ? 401 : 200);
      }
      finally { await f.close(); }
    });
  }
}

for (const entry of [undefined, "", "external, internal", "INTERNAL", "unknown"]) {
  test(`missing or illegal trusted entry ${String(entry)} fails before all OIDC state effects`, async () => {
    const f = await fixture(undefined, true);
    try {
      await f.login();
      const issued = await authorize(f, "external");
      const before = await f.oidcState.snapshot();
      const observations = { reads: f.state.reads, clients: f.state.acquisitions, signatures: f.state.signatures };
      for (const path of [".well-known/openid-configuration", "jwks", "auth", "login-guard", "resume", "me", "session/end", "session/end/confirm", "token"]) {
        const headers: Record<string, string> = { "Cookie": `global_session=${f.cookies.get("global_session")}`, "Host": "iam.example", "X-Forwarded-Host": "iam.example" };
        if (entry !== undefined)
          headers["X-IAM-Entry-Network"] = entry;
        const response = await fetch(`${f.httpOrigin}/oidc/${path}`, { method: ["token", "session/end/confirm"].includes(path) ? "POST" : "GET", headers });
        expect(response.status).toBe(400);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(response.headers.get("Location")).toBeNull();
      }
      const after = await f.oidcState.snapshot();
      expect(after).toEqual(before);
      expect({
        reads: f.state.reads,
        clients: f.state.acquisitions,
        signatures: f.state.signatures,
      }).toEqual(observations);
      expect(f.reports).toEqual([]);
      const valid = await exchange(f, "external", issued.code);
      expect(valid.status).toBe(200);
    }
    finally { await f.close(); }
  });
}

test("equal configured origins allow opposite entry labels throughout continuation, Token, UserInfo and logout", async () => {
  const issuer = "https://iam.example/oidc";
  const f = await fixture(
    undefined,
    true,
    undefined,
    45,
    undefined,
    true,
    undefined,
    true,
    false,
    { internal: issuer, external: issuer },
  );
  try {
    f.setEntry("internal");
    const started = await f.authorize();
    const handle = new URL(started.headers.get("Location")!, "https://iam.example").searchParams.get("oidcReturn")!;
    f.setEntry("external");
    const guard = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
    expect(guard.status).toBe(200);
    await f.login();
    const resume = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    const params = new URL(resume.headers.get("Location")!).searchParams;
    expect(params.get("iss")).toBe(issuer);
    const response = await exchange(f, "internal", params.get("code")!);
    expect(response.status).toBe(200);
    const value: OidcTokenResponse = await response.json();
    const info = await use(f, "external", value.access_token);
    expect(info.status).toBe(200);
    const logout = await beginLogout(f, "external", value.id_token);
    const cancelled = await confirm(f, "internal", logout.xsrf, false);
    expect(cancelled.status).toBe(303);
    const second = await beginLogout(f, "internal", value.id_token);
    const finished = await confirm(f, "external", second.xsrf, true);
    expect(finished.status).toBe(303);
    const denied = await use(f, "internal", value.access_token);
    expect(denied.status).toBe(401);
  }
  finally { await f.close(); }
});

for (const entry of entries) {
  for (const failure of ["secret", "issuer", "format", "owner", "missing", "expired", "replay", "consume-before", "consume-after", "revoke-before", "revoke-after"] as const) {
    test(`${entry} cross-issuer ${failure} preserves the authentication/location gates and distinct consumption/revocation reports`, async () => {
      const f = await fixture(undefined, true);
      try {
        const confidential = failure === "secret" || failure === "issuer";
        if (confidential) {
          await f.setClient(value => ({ ...value, ssoConfig: value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
            ? { ...value.ssoConfig, clientType: OidcClientType.Confidential }
            : null }));
        }
        await f.login();
        const issued = await authorize(f, entry);
        let code = issued.code;
        const extra: Record<string, string> = {};
        if (failure === "format")
          code = "unparseable";
        if (failure === "owner") {
          const differentClient = `other-${randomUUID()}`;
          f.addClient(differentClient);
          extra.client_id = differentClient;
        }
        if (failure === "missing")
          code = `${"x".repeat(43)}.${issued.record.userSessionId}.${issued.record.clientSessionId}`;
        if (failure === "expired")
          await f.oidcState.patchCode(f.clientId, code, { expiresAt: Date.now() - 1 });
        if (failure === "replay") {
          const first = await exchange(f, entry, code);
          expect(first.status).toBe(200);
        }
        if (failure.startsWith("consume-"))
          f.oidcState.failNext("takeCode", failure === "consume-after");
        if (failure.startsWith("revoke-"))
          f.scope.failNext("revoke", failure === "revoke-after");
        const signatures = f.state.signatures;
        const response = await exchange(f, other(entry), code, extra, confidential ? { Authorization: basic(f.clientId, failure === "secret" ? "wrong" : "current secret:+") } : {});
        expect(response.status).toBe(failure === "secret" ? 401 : failure.startsWith("consume-") ? 503 : 400);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(f.state.signatures).toBe(signatures);
        const inspected = await f.scope.inspect(issued.target);
        const gateFailure = ["secret", "format", "owner"].includes(failure);
        if (gateFailure) {
          expect(f.reports).toEqual([]);
          const record = await f.oidcState.readCode(f.clientId, issued.code);
          expect(record).toEqual(issued.record);
          expect(inspected.record?.state).toBe("active");
          const valid = await exchange(
            f,
            entry,
            issued.code,
            {},
            confidential ? { Authorization: basic(f.clientId) } : {},
          );
          expect(valid.status).toBe(200);
        }
        else {
          expect(f.reports.at(-1)).toMatchObject({
            consumption: failure.startsWith("consume-") ? "unknown" : ["missing", "replay"].includes(failure) ? "missing" : "consumed",
            revocation: { status: failure.startsWith("revoke-") ? "unknown" : "terminated", target: issued.target },
          });
          expect(inspected.record?.state).toBe(failure === "revoke-before" ? "active" : "terminated");
          const rootResult = await root(f);
          expect(rootResult.status).toBe("resolved");
          const originalCode = await f.oidcState.readCode(f.clientId, issued.code);
          expect(Boolean(originalCode)).toBe(["missing", "consume-before"].includes(failure));
        }
      }
      finally { await f.close(); }
    });
  }

  for (const winnerEntry of [entry, other(entry)]) {
    test(`${entry} Code concurrent requests with ${winnerEntry} consuming first never deliver an online Token to the wrong issuer`, async () => {
      const f = await fixture(undefined, true);
      let release = () => {};
      let pending: Promise<Response> | undefined;
      try {
        await f.login();
        const issued = await authorize(f, entry);
        let reached!: () => void;
        const ready = new Promise<void>((resolve) => {
          reached = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const intercept = async () => {
          reached();
          await gate;
        };
        if (winnerEntry === entry)
          f.oidcState.beforeNext("saveToken", intercept);
        else
          f.oidcState.afterNext("takeCode", intercept);
        pending = exchange(f, winnerEntry, issued.code);
        await ready;
        const loser = await exchange(f, other(winnerEntry), issued.code);
        expect(loser.status).toBe(400);
        const terminated = await f.scope.inspect(issued.target);
        expect(terminated.record?.state).toBe("terminated");
        const newer = await authorize(f, entry);
        expect(newer.record.clientSessionId).not.toBe(issued.record.clientSessionId);
        release();
        const winner = await pending;
        expect(winner.status).toBe(winnerEntry === entry ? 200 : 400);
        if (winner.status === 200) {
          const value: OidcTokenResponse = await winner.json();
          const late = await use(f, entry, value.access_token);
          expect(late.status).toBe(401);
        }
        expect(f.state.signatures).toBe(winnerEntry === entry ? 1 : 0);
        const replacement = await f.scope.inspect(newer.target);
        expect(replacement.record?.state).toBe("active");
      }
      finally {
        release();
        if (pending)
          await pending;
        await f.close();
      }
    });
  }
}

test("issuer mismatch revocation deadline remains bounded and its late exact effect cannot select a new instance", async () => {
  const f = await fixture(undefined, true);
  let release = () => {};
  try {
    await f.login();
    const issued = await authorize(f, "internal");
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.scope.afterNext("revoke", async () => await gate);
    const failed = await exchange(f, "external", issued.code);
    expect(failed.status).toBe(400);
    expect(f.reports.at(-1)).toMatchObject({ consumption: "consumed", revocation: { status: "unknown" } });
    const newer = await token(f, "internal");
    expect(newer.record.clientSessionId).not.toBe(issued.record.clientSessionId);
    release();
    const retry = await exchange(f, "internal", issued.code);
    expect(retry.status).toBe(400);
    const usable = await use(f, "internal", newer.value.access_token);
    expect(usable.status).toBe(200);
  }
  finally {
    release();
    await f.close();
  }
});
