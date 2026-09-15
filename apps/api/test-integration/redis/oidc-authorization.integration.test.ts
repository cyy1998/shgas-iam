import { randomUUID } from "node:crypto";
import {
  ClientSsoProtocol,
  ClientStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { expect, test } from "bun:test";

import { fixture } from "./oidc.fixture";

function responseCode(response: Response) {
  const location = new URL(response.headers.get("Location")!);
  return location.searchParams.get("code") ?? new URLSearchParams(location.hash.slice(1)).get("code");
}

for (const method of ["GET", "POST"]) {
  for (const mode of ["query", "fragment", "form_post"]) {
    test(`OIDC ${method} ${mode} uses a real authenticated root, one permission/Snapshot and isolated Code`, async () => {
      const f = await fixture();
      try {
        await f.login();
        const before = { reads: f.state.reads, acquisitions: f.state.acquisitions };
        const response = await f.authorize(
          {
            response_mode: mode,
            nonce: "nonce-1",
            state: "state<&\"",
            scope: "openid profile phone iam:employments iam:authorization",
          },
          method,
        );
        const body = await response.text();
        expect(response.status).toBe(mode === "form_post" ? 200 : 303);
        expect(f.state.reads - before.reads).toBe(1);
        expect(f.state.acquisitions - before.acquisitions).toBe(1);
        const code
          = mode === "form_post" ? /name="code" value="([^"]+)"/u.exec(body)?.[1] : responseCode(response);
        expect(code?.split(".")).toHaveLength(3);
        const record = await f.oidcState.readCode(f.clientId, code!);
        expect(record).toMatchObject({
          nonce: "nonce-1",
          state: "state<&\"",
          responseMode: mode,
          protocol: "oidc",
          codeChallengeMethod: "S256",
        });
        expect(record?.scope).toBe("openid profile phone iam:employments iam:authorization");
        const expiration = await f.oidcState.codeExpiry(f.clientId, code!);
        expect(expiration).toBe(record!.expiresAt);
        const other = await f.oidcState.readCode("other-client", code!);
        expect(other).toBeNull();
        if (mode === "form_post") {
          expect(body).toContain("method=\"post\" action=\"https://rp.example/callback\"");
          expect(body).toContain("state&lt;&amp;&quot;");
        }
      }
      finally {
        await f.close();
      }
    });
  }
}

test("OIDC continuation keeps accepted redirect/scope/nonce through configuration edits and consumes once", async () => {
  const f = await fixture();
  try {
    const first = await f.authorize({ nonce: "bound", response_mode: "fragment" });
    expect(first.status).toBe(302);
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("set-cookie")).toContain("Path=/oidc");
    const handle = new URL(first.headers.get("Location")!).searchParams.get("oidcReturn")!;
    const guard = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
    const decision = await guard.json();
    expect(decision).toEqual({ decision: "login" });
    await f.login();
    await f.setClient(value => ({
      ...value,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Confidential,
        redirectUris: ["https://new-rp.example/cb"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
      },
    }));
    const resume = await f.request(
      `/oidc/resume?oidcReturn=${handle}&redirect_uri=https://attacker.example&scope=openid&nonce=changed`,
    );
    expect(resume.status).toBe(303);
    expect(new URL(resume.headers.get("Location")!).origin).toBe("https://rp.example");
    const record = await f.oidcState.readCode(f.clientId, responseCode(resume)!);
    expect(record).toMatchObject({ nonce: "bound", scope: "openid profile", responseMode: "fragment" });
    const replay = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(replay.status).toBe(400);
    const fresh = await f.authorize();
    expect(fresh.status).toBe(400);
    expect(fresh.headers.get("Location")).toBeNull();
  }
  finally {
    await f.close();
  }
});

const freshParameters: Array<Record<string, string>> = [{ prompt: "login" }, { max_age: "0" }];
for (const parameters of freshParameters) {
  test(`OIDC first login proof completes ${JSON.stringify(parameters)}; existing roots cannot reauthenticate`, async () => {
    const f = await fixture();
    try {
      const first = await f.authorize(parameters);
      const handle = new URL(first.headers.get("Location")!).searchParams.get("oidcReturn")!;
      const guard = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
      expect(guard.status).toBe(200);
      const proof = f.cookies.get("oidc_login_completion")!;
      await f.login();
      f.cookies.set("oidc_login_completion", "invalid-proof");
      const existingGuard = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
      const existingDecision = await existingGuard.json();
      expect(existingDecision).toEqual({ decision: "continue" });
      const denied = await f.request(`/oidc/resume?oidcReturn=${handle}`);
      expect(new URL(denied.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
      f.cookies.set("oidc_login_completion", proof);
      const resumed = await f.request(`/oidc/resume?oidcReturn=${handle}`);
      expect(responseCode(resumed)).toBeTruthy();
      const existing = await f.authorize(parameters);
      expect(new URL(existing.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
      expect(f.cookies.get("global_session")).toBeTruthy();
    }
    finally {
      await f.close();
    }
  });
}

test("OIDC missing/wrong browser binding cannot use another continuation even with a valid root", async () => {
  const f = await fixture();
  try {
    const first = await f.authorize();
    const handle = new URL(first.headers.get("Location")!).searchParams.get("oidcReturn")!;
    const binding = f.cookies.get("oidc_interaction_binding")!;
    await f.login();
    for (const value of ["", "wrong-binding"]) {
      f.cookies.set("oidc_interaction_binding", value);
      const resume = await f.request(`/oidc/resume?oidcReturn=${handle}`);
      expect(resume.status).toBe(400);
      expect(resume.headers.get("Location")).toBeNull();
    }
    f.cookies.set("oidc_interaction_binding", binding);
    const resume = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(responseCode(resume)).toBeTruthy();
  }
  finally {
    await f.close();
  }
});

const rejectedParameters = [
  ["state", "", "invalid_request"],
  ["scope", "profile", "invalid_scope"],
  ["scope", "openid unknown", "invalid_scope"],
  ["code_challenge_method", "plain", "invalid_request"],
  ["code_challenge", "short", "invalid_request"],
  ["prompt", "none login", "invalid_request"],
  ["prompt", "consent", "invalid_request"],
  ["max_age", "-1", "invalid_request"],
  ["max_age", "0.5", "invalid_request"],
  ["response_type", "token", "unsupported_response_type"],
  ["response_mode", "jwt", "unsupported_response_mode"],
  ["request", "jwt", "request_not_supported"],
  ["request_uri", "https://attacker.example", "request_uri_not_supported"],
  ["registration", "{}", "registration_not_supported"],
] as const;
for (const [key, value, error] of rejectedParameters) {
  test(`OIDC standard ${key}=${value} rejection keeps state empty`, async () => {
    const f = await fixture();
    try {
      const response = await f.authorize({ [key]: value });
      expect(response.status).toBe(303);
      const target = new URL(response.headers.get("Location")!);
      expect(target.origin).toBe("https://rp.example");
      expect(target.searchParams.get("error")).toBe(error);
      const records = await f.oidcState.snapshot();
      expect(records).toEqual([]);
    }
    finally {
      await f.close();
    }
  });
}

test("OIDC unsafe redirects, duplicate input and wrong encoding remain local standard errors", async () => {
  const f = await fixture();
  try {
    const unsafeParameters: Array<Record<string, string>> = [
      { redirect_uri: "https://attacker.example/cb" },
      { client_id: "unknown" },
      { redirect_uri: "" },
    ];
    for (const params of unsafeParameters) {
      const response = await f.authorize(params);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(response.headers.get("Location")).toBeNull();
      expect(body).toHaveProperty("error");
      expect(body).not.toHaveProperty("data");
    }
    const duplicate = await f.request(`/oidc/auth?${f.parameters()}&state=second`);
    expect(duplicate.status).toBe(400);
    const encoding = await f.request("/oidc/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(encoding.status).toBe(400);
    const records = await f.oidcState.snapshot();
    expect(records).toEqual([]);
  }
  finally {
    await f.close();
  }
});

test("OIDC unknown/disabled parameter compatibility, optional nonce and exact Discovery CORS", async () => {
  const f = await fixture();
  try {
    await f.login();
    const response = await f.authorize({
      claims: "not-json",
      resource: "bad-resource",
      unknown: "ignored",
      scope: "openid openid offline_access",
      max_age: "100",
    });
    const record = await f.oidcState.readCode(f.clientId, responseCode(response)!);
    expect(record?.nonce).toBeUndefined();
    expect(record?.scope).toBe("openid");
    const plain = await f.request("/oidc/.well-known/openid-configuration");
    expect(plain.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const discovery = await plain.json();
    expect(discovery).toMatchObject({
      issuer: "https://iam.example/oidc",
      authorization_endpoint: "https://iam.example/oidc/auth",
      response_modes_supported: ["query", "fragment", "form_post"],
      claims_parameter_supported: false,
      code_challenge_methods_supported: ["S256"],
    });
    expect(discovery).not.toHaveProperty("token_endpoint");
    const cors = await f.request("/oidc/.well-known/openid-configuration", {
      method: "OPTIONS",
      headers: { "Origin": "https://rp.example", "Access-Control-Request-Method": "GET" },
    });
    expect(cors.status).toBe(204);
    expect(cors.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
    expect(cors.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(cors.headers.get("Access-Control-Allow-Methods")).toBe("GET");
    const authCors = await f.authorize();
    expect(authCors.headers.get("Access-Control-Allow-Origin")).toBeNull();
    for (const clientType of [OidcClientType.Public, OidcClientType.Confidential]) {
      await f.setClient(value => ({
        ...value,
        ssoConfig: {
          protocol: ClientSsoProtocol.Oidc,
          clientType,
          redirectUris: ["https://rp.example/callback"],
          postLogoutRedirectUris: [],
          allowedScopes: [OidcScope.OpenId],
        },
      }));
      const metadata = await f.operations.run(operation =>
        f.oidc!.forOperation(operation).clientMetadata(f.clientId),
      );
      expect(metadata.token_endpoint_auth_method).toBe(
        clientType === OidcClientType.Public
          ? OidcTokenEndpointAuthMethod.None
          : OidcTokenEndpointAuthMethod.ClientSecretBasic,
      );
      const authorization = await f.authorize({ scope: "openid" });
      expect(responseCode(authorization)).toBeTruthy();
    }
  }
  finally {
    await f.close();
  }
});

test("OIDC concurrent authorization reuses one original ClientSession and continuation has one winner", async () => {
  const f = await fixture();
  try {
    await f.login();
    const responses = await Promise.all(Array.from({ length: 6 }, () => f.authorize()));
    const codes = responses.map(responseCode);
    expect(new Set(codes.map(code => code!.split(".")[2])).size).toBe(1);
    const first = await f.oidcState.readCode(f.clientId, codes[0]!);
    const [id] = codes[0]!.split(".");
    const spliced = `${id}.${randomUUID()}.${first!.clientSessionId}`;
    const splicedRecord = await f.oidcState.readCode(f.clientId, spliced);
    expect(splicedRecord).toBeNull();
    f.cookies.delete("global_session");
    const initial = await f.authorize();
    const handle = new URL(initial.headers.get("Location")!).searchParams.get("oidcReturn")!;
    await f.login();
    const resumes = await Promise.all([
      f.request(`/oidc/resume?oidcReturn=${handle}`),
      f.request(`/oidc/resume?oidcReturn=${handle}`),
    ]);
    expect(resumes.map(response => response.status).sort()).toEqual([303, 400]);
  }
  finally {
    await f.close();
  }
});

test("OIDC transient dependency failures preserve cookies/continuation, maintenance is distinct, disabled roots do not recover", async () => {
  const f = await fixture();
  try {
    const initial = await f.authorize();
    const handle = new URL(initial.headers.get("Location")!).searchParams.get("oidcReturn")!;
    await f.login();
    f.state.permission = "unknown";
    const transient = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(transient.status).toBe(503);
    expect(transient.headers.get("set-cookie")).toBeNull();
    f.state.permission = "enabled";
    await f.setClient(value => ({ ...value, status: ClientStatus.Maintenance }));
    const maintenance = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(maintenance.status).toBe(503);
    const maintenanceBody = await maintenance.json();
    expect(maintenanceBody).toMatchObject({ error_description: "Client is under maintenance" });
    await f.setClient(value => ({ ...value, status: ClientStatus.Enable }));
    const resumed = await f.request(`/oidc/resume?oidcReturn=${handle}`);
    expect(responseCode(resumed)).toBeTruthy();
    const bearer = f.cookies.get("global_session")!;
    f.state.permission = "disabled";
    const disabled = await f.authorize({ prompt: "none" });
    expect(new URL(disabled.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
    expect(f.cookies.get("global_session")).toBe("");
    f.state.permission = "enabled";
    f.cookies.set("global_session", bearer);
    const stale = await f.authorize({ prompt: "none" });
    expect(new URL(stale.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
  }
  finally {
    await f.close();
  }
});

test("OIDC observed authorization finishes in flight; later requests reject terminated roots", async () => {
  const f = await fixture();
  try {
    const bearer = await f.login();
    f.scope.afterNext("open", async () => {
      await f.operations.run(async (operation) => {
        const sessions = f.kernel.forOperation(operation);
        const root = await sessions.resolveUserSession(bearer);
        if (root.status !== "resolved")
          throw new Error("Root required");
        const revoked = await sessions.revokeObservedUserSession(root.value);
        expect(revoked.status).toBe("terminated");
      });
      await f.setClient(value => ({ ...value, ssoEnabled: false }));
    });
    const inFlight = await f.authorize();
    expect(responseCode(inFlight)).toBeTruthy();
    await f.setClient(value => ({ ...value, ssoEnabled: true }));
    const next = await f.authorize({ prompt: "none" });
    expect(new URL(next.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
  }
  finally {
    await f.close();
  }
});

test("OIDC authorization reuses a valid relationship last authorized by Custom SSO", async () => {
  const f = await fixture();
  try {
    const bearer = await f.login();
    const custom = await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(bearer);
      if (root.status !== "resolved")
        throw new Error("Root required");
      const user = root.value.userSession;
      await operation.acquireForSession({
        principalSessionId: user.userSessionId,
        subjectIdentifier: user.subjectIdentifier,
        subjectContext: user.subjectContext,
      });
      return await sessions.openClientSession(root.value, { clientId: f.clientId, protocol: "custom_sso" });
    });
    if (custom.status !== "created" && custom.status !== "reused")
      throw new Error("ClientSession required");
    const response = await f.authorize();
    const code = await f.oidcState.readCode(f.clientId, responseCode(response)!);
    expect(code!.clientSessionId).toBe(custom.value.clientSession.clientSessionId);
    const current = await f.operations.run(operation =>
      f.kernel
        .forOperation(operation)
        .resolveClientSessionForUse({
          clientId: f.clientId,
          clientSessionId: code!.clientSessionId,
          userSessionId: code!.userSessionId,
        }),
    );
    if (current.status !== "resolved")
      throw new Error("ClientSession required");
    expect(current.value.clientSession.protocol).toBe("oidc");
    expect(current.value.clientSession.expiresAt).toBeGreaterThanOrEqual(
      custom.value.clientSession.expiresAt,
    );
    expect(current.value.userSession.expiresAt).toBe(custom.value.userSession.expiresAt);
  }
  finally {
    await f.close();
  }
});

test("OIDC candidate responds on real loopback HTTP using the formal factory and authenticated Cookie", async () => {
  const f = await fixture();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: f.app.fetch });
  try {
    const bearer = await f.login();
    const response = await fetch(`http://127.0.0.1:${server.port}/oidc/auth?${f.parameters()}`, {
      headers: { Cookie: `global_session=${bearer}` },
      redirect: "manual",
    });
    await response.arrayBuffer();
    expect(response.status).toBe(303);
    const code = await f.oidcState.readCode(f.clientId, responseCode(response)!);
    expect(code).toMatchObject({ clientId: f.clientId, state: "rp-state" });
    const discovery = await fetch(`http://127.0.0.1:${server.port}/oidc/.well-known/openid-configuration`, {
      headers: { Origin: "https://rp.example" },
    });
    const metadata = await discovery.json();
    expect(metadata).toMatchObject({ issuer: "https://iam.example/oidc" });
    expect(discovery.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
  }
  finally {
    await server.stop(true);
    await f.close();
  }
});

test("OIDC Redis TTL expires Code and continuation while positive max_age rejects an older root", async () => {
  const f = await fixture({ code: 1, continuation: 1 });
  try {
    const initial = await f.authorize();
    const handle = new URL(initial.headers.get("Location")!).searchParams.get("oidcReturn")!;
    await f.login();
    const first = await f.authorize();
    const code = responseCode(first)!;
    const saved = await f.oidcState.readCode(f.clientId, code);
    expect(saved).not.toBeNull();
    await Bun.sleep(1100);
    const expired = await f.oidcState.readCode(f.clientId, code);
    expect(expired).toBeNull();
    const continuation = await f.request(`/oidc/login-guard?oidcReturn=${handle}`);
    expect(continuation.status).toBe(400);
    const aged = await f.authorize({ max_age: "1" });
    expect(new URL(aged.headers.get("Location")!).searchParams.get("error")).toBe("login_required");
    const ordinary = await f.authorize();
    expect(responseCode(ordinary)).toBeTruthy();
  }
  finally {
    await f.close();
  }
});

for (const corruption of ["record", "index"] as const) {
  for (const entry of ["authorize", "resume"] as const) {
    test(`OIDC ${entry} classifies corrupt relationship ${corruption} as unavailable without revocation`, async () => {
      const f = await fixture();
      try {
        const initial = await f.authorize({ response_mode: "fragment" });
        const handle = new URL(initial.headers.get("Location")!).searchParams.get("oidcReturn")!;
        const bearer = await f.login();
        const authorized = await f.authorize();
        const originalCode = responseCode(authorized)!;
        const original = await f.oidcState.readCode(f.clientId, originalCode);
        const captured = await f.operations.run(operation =>
          f.kernel.forOperation(operation).captureSessions({ scope: { clientId: f.clientId } }),
        );
        const target = captured.targets.find(
          value => value.kind === "clientSession" && value.id === original!.clientSessionId,
        );
        if (!target)
          throw new Error("Original ClientSession required");
        const originalSession = await f.scope.inspect(target);
        const originalRoot = await f.scope.bearerStored(bearer);
        const originalRecords = await f.scope.countRecords();
        const originalArtifacts = await f.oidcState.snapshot();
        const restore = corruption === "record" ? await f.scope.corruptRecord(target) : undefined;
        if (corruption === "index")
          await f.scope.corruptReclamationIndex(target);
        let revocations = 0;
        f.scope.afterNext("revoke", async () => {
          revocations++;
        });
        const response
          = entry === "authorize" ? await f.authorize() : await f.request(`/oidc/resume?oidcReturn=${handle}`);
        expect(response.status).toBe(303);
        const location = new URL(response.headers.get("Location")!);
        const parameters
          = entry === "authorize" ? location.searchParams : new URLSearchParams(location.hash.slice(1));
        expect(location.origin).toBe("https://rp.example");
        expect(parameters.get("error")).toBe("temporarily_unavailable");
        expect(parameters.get("error_description")).toBe("Client session state unavailable");
        expect(parameters.get("state")).toBe("rp-state");
        expect(parameters.has("code")).toBe(false);
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(f.cookies.get("global_session")).toBe(bearer);
        expect(revocations).toBe(0);
        const rootAfter = await f.scope.bearerStored(bearer);
        expect(rootAfter).toBe(originalRoot);
        const recordsAfter = await f.scope.countRecords();
        expect(recordsAfter).toBe(originalRecords);
        const artifactsAfter = await f.oidcState.snapshot();
        expect(artifactsAfter).toHaveLength(originalArtifacts.length - (entry === "resume" ? 1 : 0));
        const codeAfter = await f.oidcState.readCode(f.clientId, originalCode);
        expect(codeAfter).toEqual(original);
        await restore?.();
        const sessionAfter = await f.scope.inspect(target);
        expect(sessionAfter).toEqual(originalSession);
        const root = await f.operations.run(operation =>
          f.kernel.forOperation(operation).resolveUserSession(bearer),
        );
        expect(root.status).toBe("resolved");
      }
      finally {
        await f.close();
      }
    });
  }
}
