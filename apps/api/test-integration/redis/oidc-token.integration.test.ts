import type { OidcTokenResponse } from "@iam/oidc/wire";
import { Buffer } from "node:buffer";
import { createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { connect, createServer } from "node:net";
import process from "node:process";
import { ClientSsoProtocol, ClientStatus, OidcClientType } from "@iam/contracts";
import { createOidcClientAuthRateLimiter, createOidcSigningKeys, OidcExchangeFailure } from "@iam/oidc";
import { createOidcInventory, createOidcMaintenance, createOidcVerifier } from "@iam/oidc/maintenance";
import { expect, test } from "bun:test";
import Redis from "ioredis";
import { cleanupAfterFixtureFailure, closeFixtureResources, fixture, signingKeys } from "./oidc.fixture";

async function setup(
  confidential = false,
  ttl = 30,
  networkUrl?: string,
  tokenTtlSeconds = 45,
  beforeInitialize?: (value: Awaited<ReturnType<typeof fixture>>) => void,
  clientAuthWindowSeconds?: number,
  trustProxy = true,
) {
  const f = await fixture(
    { code: ttl, continuation: 60 },
    true,
    networkUrl,
    tokenTtlSeconds,
    undefined,
    true,
    clientAuthWindowSeconds,
    trustProxy,
  );
  try {
    beforeInitialize?.(f);
    if (confidential) {
      await f.setClient(value => ({
        ...value,
        ssoConfig:
          value.ssoConfig?.protocol === ClientSsoProtocol.Oidc
            ? { ...value.ssoConfig, clientType: OidcClientType.Confidential }
            : null,
      }));
    }
    await f.login();
    const basic = (secret = "current secret:+") =>
      `Basic ${Buffer.from(`${encodeURIComponent(f.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
    async function authorize(extra: Record<string, string> = {}) {
      const response = await f.authorize(extra);
      expect(response.status).toBe(303);
      const code = new URL(response.headers.get("Location")!).searchParams.get("code")!;
      const record = await f.oidcState.readCode(f.clientId, code);
      if (!record)
        throw new Error("Expected issued Code");
      return {
        code,
        record,
        target: {
          kind: "clientSession" as const,
          id: record.clientSessionId,
          instance: record.clientSessionInstance,
          userSessionId: record.userSessionId,
          subjectIdentifier: f.subjectIdentifier,
          clientId: f.clientId,
        },
      };
    }
    async function exchange(
      code: string,
      extra: Record<string, string> = {},
      headers: Record<string, string> = {},
    ) {
      return await f.request("/oidc/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(confidential ? { Authorization: basic() } : {}),
          ...headers,
        },
        body: new URLSearchParams({
          client_id: f.clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://rp.example/callback",
          code_verifier: "v".repeat(43),
          ...extra,
        }),
      });
    }
    async function resolve(bearer: string) {
      return await f.operations.run(operation =>
        f.oidcTokens!.forOperation(operation).resolveAccessToken(bearer),
      );
    }
    return { ...f, authorizeCode: authorize, exchange, resolve, basic };
  }
  catch (failure) {
    return await cleanupAfterFixtureFailure(failure, f.close);
  }
}

for (const confidential of [false, true]) {
  test(`OIDC real token HTTP ${confidential ? "Basic" : "Public"} signs current RSA and stores fixed original identity`, async () => {
    const f = await setup(confidential);
    try {
      const issued = await f.authorizeCode({
        nonce: "bound-nonce",
        scope: "openid profile phone iam:employments iam:authorization",
      });
      const before = { reads: f.state.reads, acquisitions: f.state.acquisitions };
      const response = await f.exchange(issued.code);
      expect(response.status).toBe(200);
      const value: OidcTokenResponse = await response.json();
      expect(value).toMatchObject({ token_type: "Bearer", expires_in: 45 });
      expect(f.state.reads - before.reads).toBe(1);
      expect(f.state.acquisitions - before.acquisitions).toBe(1);
      const [header, payload, signature] = value.id_token.split(".");
      expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
        alg: "RS256",
        kid: "current",
        typ: "JWT",
      });
      const jwksResponse = await f.request("/oidc/jwks", { headers: { Origin: "https://any.example" } });
      const jwks = await jwksResponse.json();
      expect(jwks.keys.map((key: { kid: string }) => key.kid)).toEqual(["current", "previous"]);
      expect(Object.keys(jwks.keys[0]).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
      expect(
        verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          createPublicKey({ key: jwks.keys[0], format: "jwk" }),
          Buffer.from(signature!, "base64url"),
        ),
      ).toBe(true);
      const record = await f.oidcState.readToken(value.access_token);
      const resolved = await f.resolve(value.access_token);
      expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
        sub: f.subjectIdentifier,
        iss: "https://iam.example/oidc",
        aud: f.clientId,
        iat: Math.floor(record!.issuedAt / 1000),
        exp: Math.floor(record!.expiresAt / 1000),
        auth_time: Math.floor(resolved.observation.userSession.authTime / 1000),
        nonce: "bound-nonce",
        preferred_username: "test",
        name: "测试",
        phone_number: "17721462865",
      });
      expect(record).toMatchObject({
        purpose: "oidc_access",
        clientId: f.clientId,
        userSessionId: issued.record.userSessionId,
        clientSessionId: issued.record.clientSessionId,
      });
      expect(record!.id).not.toBe(value.access_token);
      const consumed = await f.oidcState.readCode(f.clientId, issued.code);
      expect(consumed).toBeNull();
      const original = await f.scope.inspect(issued.target);
      await f.resolve(value.access_token);
      expect(await f.scope.inspect(issued.target)).toEqual(original);
      await f.authorizeCode();
      expect(await f.oidcState.readToken(value.access_token)).toEqual(record);
      expect(f.state.credentialReads).toBe(confidential ? 1 : 0);
      const discovery = await (await f.request("/oidc/.well-known/openid-configuration")).json();
      expect(discovery).toMatchObject({
        token_endpoint: "https://iam.example/oidc/token",
        jwks_uri: "https://iam.example/oidc/jwks",
        token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    finally {
      await f.close();
    }
  });
}

test("OIDC pure sub including IAM-only scopes needs no Facts and optional nonce remains absent", async () => {
  const f = await setup();
  try {
    f.state.factFailure = true;
    const issued = await f.authorizeCode({ scope: "openid iam:authorization iam:employments" });
    const response = await f.exchange(issued.code);
    const value: OidcTokenResponse = await response.json();
    expect(response.status).toBe(200);
    expect(f.state.factReads).toBe(0);
    const claims = JSON.parse(Buffer.from(value.id_token.split(".")[1]!, "base64url").toString());
    expect(Object.keys(claims).sort()).toEqual(["aud", "auth_time", "exp", "iat", "iss", "sub"]);
  }
  finally {
    await f.close();
  }
});

for (const failure of [
  "wrong-secret",
  "unknown-secret",
  "malformed",
  "missing-root",
  "missing-session",
  "wrong-client",
  "wrong-root",
] as const) {
  test(`OIDC ${failure} never passes authentication/location and preserves Code/session`, async () => {
    const f = await setup(true);
    try {
      const issued = await f.authorizeCode();
      const before = await f.scope.inspect(issued.target);
      let code = issued.code;
      const headers: Record<string, string> = {};
      const extra: Record<string, string> = {};
      if (failure === "wrong-secret")
        headers.Authorization = f.basic("wrong");
      if (failure === "unknown-secret")
        f.state.secretFailure = true;
      if (failure === "malformed")
        code = "broken";
      if (failure === "missing-root" || failure === "wrong-root")
        code = `${code.split(".")[0]}.${randomUUID()}.${issued.record.clientSessionId}`;
      if (failure === "missing-session")
        code = `${code.split(".")[0]}.${issued.record.userSessionId}.${randomUUID()}`;
      if (failure === "wrong-client")
        extra.client_id = "another-client";
      const response = await f.exchange(code, extra, headers);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await f.oidcState.readCode(f.clientId, issued.code)).toEqual(issued.record);
      expect(await f.scope.inspect(issued.target)).toEqual(before);
      expect(await f.oidcState.tokens()).toEqual([]);
      expect(f.reports).toEqual([]);
    }
    finally {
      await f.close();
    }
  });
}

const failures = [
  "pkce",
  "redirect",
  "missing",
  "expired",
  "maintenance",
  "disabled",
  "protocol",
  "grant",
  "corrupt",
  "payload-owner",
  "payload-expiry",
  "consume-before",
  "consume-after",
  "facts",
  "sign",
  "save-before",
  "save-after",
  "permission",
  "permission-unknown",
] as const;
for (const failure of failures) {
  test(`OIDC post-gate ${failure} reports consumption and actual original-session revocation`, async () => {
    const f = await setup(true, failure === "expired" ? 1 : 30);
    try {
      const issued = await f.authorizeCode();
      const extra: Record<string, string> = {};
      let code = issued.code;
      if (failure === "pkce")
        extra.code_verifier = "x".repeat(43);
      if (failure === "redirect")
        extra.redirect_uri = "https://rp.example/wrong";
      if (failure === "missing")
        code = `${randomBytes(32).toString("base64url")}.${issued.record.userSessionId}.${issued.record.clientSessionId}`;
      if (failure === "expired")
        await Bun.sleep(1100);
      if (failure === "maintenance")
        await f.setClient(value => ({ ...value, status: ClientStatus.Maintenance }));
      if (failure === "disabled")
        await f.setClient(value => ({ ...value, ssoEnabled: false }));
      if (failure === "protocol") {
        await f.setClient(value => ({
          ...value,
          ssoConfig: {
            protocol: ClientSsoProtocol.CustomSso,
            callbackEndpoint: "https://app.example/callback",
            validRedirectUrls: ["https://app.example/callback"],
            subjectClaims: ["subjectIdentifier"],
          },
        }));
      }
      if (failure === "grant")
        extra.grant_type = "refresh_token";
      if (failure === "corrupt")
        await f.oidcState.corruptCode(f.clientId, code);
      if (failure === "payload-owner")
        await f.oidcState.patchCode(f.clientId, code, { userSessionInstance: randomUUID() });
      if (failure === "payload-expiry")
        await f.oidcState.patchCode(f.clientId, code, { expiresAt: 1 });
      if (failure === "consume-before" || failure === "consume-after")
        f.oidcState.failNext("takeCode", failure === "consume-after");
      if (failure === "facts")
        f.state.factFailure = true;
      if (failure === "sign")
        f.state.signFailure = true;
      if (failure === "save-before" || failure === "save-after")
        f.oidcState.failNext("saveToken", failure === "save-after");
      if (failure === "permission")
        f.state.permission = "disabled";
      if (failure === "permission-unknown")
        f.state.permission = "unknown";
      const response = await f.exchange(code, extra);
      expect(response.status).toBeGreaterThanOrEqual(400);
      const pre = ["maintenance", "disabled", "protocol", "grant"].includes(failure);
      const consumption = pre
        ? "not_attempted"
        : failure.startsWith("consume-")
          ? "unknown"
          : ["missing", "expired"].includes(failure)
              ? "missing"
              : "consumed";
      expect(f.reports.at(-1)).toMatchObject({
        event: "oidc_exchange_failed",
        consumption,
        revocation: {
          status: failure === "permission" ? "already_terminated" : "terminated",
          target: issued.target,
        },
      });
      const actual = await f.scope.inspect(issued.target);
      expect(actual.record?.state).toBe("terminated");
      const originalCode = await f.oidcState.readCode(f.clientId, issued.code);
      expect(originalCode !== null).toBe(pre || failure === "consume-before" || failure === "missing");
      const tokens = await f.oidcState.tokens();
      expect(tokens).toHaveLength(failure === "save-after" ? 1 : 0);
      if (failure.startsWith("consume-"))
        expect(f.state.signatures).toBe(0);
      const root = await f.operations.run(operation =>
        f.kernel.forOperation(operation).resolveUserSessionById(issued.record.userSessionId),
      );
      expect(root.status).toBe(failure === "permission" ? "terminated" : "resolved");
    }
    finally {
      await f.close();
    }
  });
}

test("Public fabricated missing Code without verifier revokes known original relationship", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    const fabricated = `${randomBytes(32).toString("base64url")}.${issued.record.userSessionId}.${issued.record.clientSessionId}`;
    const response = await f.exchange(fabricated, { code_verifier: "" });
    expect(response.status).toBe(400);
    expect(f.reports.at(-1)).toMatchObject({ consumption: "missing", revocation: { status: "terminated" } });
    expect(f.state.credentialReads).toBe(0);
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("terminated");
    expect(await f.oidcState.readCode(f.clientId, issued.code)).toEqual(issued.record);
  }
  finally {
    await f.close();
  }
});

test("OIDC HTTP Basic/form errors and Public Origin rejection retain standard bodies", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    for (const [headers, body] of [
      [{ "Content-Type": "application/json" }, "{}"],
      [{ "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic broken" }, ""],
      [{ "Content-Type": "application/x-www-form-urlencoded" }, "grant_type=authorization_code"],
    ] as const) {
      const response = await f.request("/oidc/token", { method: "POST", headers, body });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
    }
    expect(await f.oidcState.readCode(f.clientId, issued.code)).toEqual(issued.record);
    const preflight = await f.request("/oidc/token", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://rp.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
    const denied = await f.exchange(issued.code, {}, { Origin: "https://evil.example" });
    expect(denied.status).toBe(400);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await denied.json()).toMatchObject({ error: "invalid_request" });
    const next = await f.authorizeCode();
    const allowed = await f.exchange(next.code, {}, { Origin: "https://rp.example" });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://rp.example");
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(allowed.headers.get("Cache-Control")).toBe("no-store");
  }
  finally {
    await f.close();
  }
});

test("OIDC duplicate consumer revokes original while unique winner can write a late unusable Token", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    // Suspend before the write; the winner has already acquired a valid observation and signed once.
    f.oidcState.beforeNext("saveToken", async () => {
      reached();
      await gate;
    });
    const winner = f.exchange(issued.code);
    await ready;
    const loser = await f.exchange(issued.code);
    expect(loser.status).toBe(400);
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("terminated");
    expect(await f.oidcState.tokens()).toEqual([]);
    const newer = await f.authorizeCode();
    expect(newer.record.clientSessionId).not.toBe(issued.record.clientSessionId);
    release();
    const response = await winner;
    const value: OidcTokenResponse = await response.json();
    expect(response.status).toBe(200);
    expect(f.state.signatures).toBe(1);
    let failure: unknown;
    try {
      await f.resolve(value.access_token);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect((await f.scope.inspect(newer.target)).record?.state).toBe("active");
  }
  finally {
    await f.close();
  }
});

for (const after of [false, true]) {
  test(`OIDC revocation transport ${after ? "after" : "before"} is unknown, never reported successful`, async () => {
    const f = await setup();
    try {
      const issued = await f.authorizeCode();
      f.scope.failNext("revoke", after);
      await f.exchange(issued.code, { code_verifier: "wrong" });
      expect(f.reports.at(-1)).toMatchObject({ consumption: "consumed", revocation: { status: "unknown" } });
      expect((await f.scope.inspect(issued.target)).record?.state).toBe(after ? "terminated" : "active");
      expect(await f.oidcState.tokens()).toEqual([]);
    }
    finally {
      await f.close();
    }
  });
}

test("OIDC delivery failure reports saved residual Token and original exact revocation", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    let bearer = "";
    let failure: unknown;
    try {
      await f.operations.run(operation =>
        f
          .oidcTokens!
          .forOperation(operation)
          .exchange(
            {
              clientId: f.clientId,
              authentication: "none",
              code: issued.code,
              grantType: "authorization_code",
              redirectUri: issued.record.redirectUri,
              codeVerifier: "v".repeat(43),
            },
            (value) => {
              bearer = value.access_token;
              throw new Error("Delivery response lost");
            },
          ),
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(OidcExchangeFailure);
    expect(failure).toMatchObject({ consumption: "consumed", revocation: { status: "terminated" } });
    expect(await f.oidcState.readToken(bearer)).not.toBeNull();
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("terminated");
  }
  finally {
    await f.close();
  }
});

test("OIDC Token ignores mutable protocol marker, uses current config and denies missing-index root termination", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    const response = await f.exchange(issued.code);
    const value: OidcTokenResponse = await response.json();
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSessionById(issued.record.userSessionId);
      if (root.status !== "resolved")
        throw new Error("Root missing");
      await sessions.openClientSession(root.value, { clientId: f.clientId, protocol: "custom_sso" });
    });
    expect((await f.resolve(value.access_token)).observation.clientSession.protocol).toBe("custom_sso");
    await f.setClient(client => ({ ...client, ssoEnabled: false }));
    let paused: unknown;
    try {
      await f.resolve(value.access_token);
    }
    catch (error) {
      paused = error;
    }
    expect(paused).toBeDefined();
    await f.setClient(client => ({ ...client, ssoEnabled: true }));
    await f.resolve(value.access_token);
    await f.scope.forgetChildIndex(issued.record.userSessionId);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.observeUserSessionForRevocation(issued.record.userSessionId);
      if (root.status !== "resolved")
        throw new Error("Root missing");
      await sessions.revokeObservedUserSession(root.value);
    });
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("active");
    let revoked: unknown;
    try {
      await f.resolve(value.access_token);
    }
    catch (error) {
      revoked = error;
    }
    expect(revoked).toBeDefined();
  }
  finally {
    await f.close();
  }
});

test("OIDC Token maintenance finds no-TTL/index state and independently verifies targeted removal", async () => {
  const f = await setup();
  const independent = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
  try {
    const issued = await f.authorizeCode();
    const value: OidcTokenResponse = await (await f.exchange(issued.code)).json();
    await f.oidcState.removeTokenTtl(value.access_token);
    await f.oidcState.forgetTokenIndex(value.access_token);
    await f.oidcState.addUnknown();
    const maintenance = createOidcMaintenance(f.oidcState.redis, f.oidcState.namespace);
    const verifier = createOidcInventory(independent, f.oidcState.namespace);
    expect(await verifier.inventory({ clientId: f.clientId })).toMatchObject({ matching: 1, unknown: 1 });
    const rootBefore = await f.scope.inspect(issued.target);
    const report = await maintenance.apply({ clientId: f.clientId });
    expect(report).toMatchObject({ removed: 1, unknown: 1 });
    expect(await verifier.inventory({ clientId: f.clientId })).toMatchObject({ matching: 0, unknown: 1 });
    expect(await f.scope.inspect(issued.target)).toEqual(rootBefore);
  }
  finally {
    independent.disconnect();
    await f.close();
  }
});

test("OIDC signing rejects public-only or duplicate-kid configuration and supports current-only", () => {
  const current = signingKeys("one");
  const signer = createOidcSigningKeys({ currentJwkJson: current });
  expect(signer.jwks().keys).toHaveLength(1);
  expect(() => createOidcSigningKeys({ currentJwkJson: current, previousJwkJson: current })).toThrow();
  expect(() => createOidcSigningKeys({ currentJwkJson: JSON.stringify(signer.jwks().keys[0]) })).toThrow();
});

test("OIDC failed and bounded unknown revocation preserve later instances on explicit original retry", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    const restore = await f.scope.corruptRecord(issued.target);
    // Corruption before location is not an authenticated target; it cannot consume or revoke.
    const corrupt = await f.exchange(issued.code);
    expect(corrupt.status).toBe(503);
    expect(f.reports).toEqual([]);
    await restore();
    let restoreAfterLocation!: () => Promise<void>;
    f.oidcState.afterNext("takeCode", async () => {
      restoreAfterLocation = await f.scope.corruptRecord(issued.target);
    });
    const failed = await f.exchange(issued.code, { code_verifier: "bad" });
    expect(failed.status).toBe(400);
    expect(f.reports.at(-1)).toMatchObject({ consumption: "consumed", revocation: { status: "failed" } });
    await restoreAfterLocation();
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("active");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.scope.afterNext("revoke", async () => {
      await gate;
    });
    const start = performance.now();
    const unknown = await f.exchange(issued.code);
    expect(unknown.status).toBe(400);
    expect(performance.now() - start).toBeLessThan(500);
    expect(f.reports.at(-1)).toMatchObject({ consumption: "missing", revocation: { status: "unknown" } });
    const newer = await f.authorizeCode();
    release();
    await f.exchange(issued.code);
    expect(f.reports.at(-1)).toMatchObject({
      consumption: "missing",
      revocation: { status: "already_terminated" },
    });
    expect((await f.scope.inspect(newer.target)).record?.state).toBe("active");
    expect(await f.oidcState.tokens()).toEqual([]);
  }
  finally {
    await f.close();
  }
});

test("OIDC scoped Code lookup never consumes another root/ClientSession Code ID", async () => {
  const f = await setup();
  try {
    const first = await f.authorizeCode();
    const rootBefore = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSessionById(first.record.userSessionId),
    );
    f.cookies.clear();
    await f.login();
    const second = await f.authorizeCode();
    const forged = `${second.code.split(".")[0]}.${first.record.userSessionId}.${first.record.clientSessionId}`;
    const response = await f.exchange(forged);
    expect(response.status).toBe(400);
    expect(await f.oidcState.readCode(f.clientId, second.code)).toEqual(second.record);
    expect((await f.scope.inspect(second.target)).record?.state).toBe("active");
    expect((await f.scope.inspect(first.target)).record?.state).toBe("terminated");
    const rootAfter = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSessionById(first.record.userSessionId),
    );
    if (rootBefore.status !== "resolved" || rootAfter.status !== "resolved")
      throw new Error("Root unexpectedly invalid");
    expect(rootAfter.value.userSession).toEqual(rootBefore.value.userSession);
  }
  finally {
    await f.close();
  }
});

test("OIDC complete HTTP warm samples include real Snapshot Secret Barrier Facts network owners", async () => {
  const url = new URL(process.env.IAM_API_TEST_REDIS_URL!);
  const upstreamAddress = { host: url.hostname, port: Number(url.port) };
  let requests = 0;
  let responses = 0;
  const events: string[] = [];
  const proxy = createServer((downstream) => {
    const upstream = connect(upstreamAddress);
    downstream.on("data", (data) => {
      requests++;
      events.push("request");
      upstream.write(data);
    });
    upstream.on("data", (data) => {
      responses++;
      events.push("response");
      downstream.write(data);
    });
    downstream.on("end", () => upstream.end());
    upstream.on("end", () => downstream.end());
    downstream.on("close", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw new Error("Missing proxy port");
  url.hostname = "127.0.0.1";
  url.port = String(address.port);
  let f: Awaited<ReturnType<typeof setup>> | undefined;
  let bodyFailure: unknown;
  let bodyFailed = false;
  try {
    f = await setup(true, 30, url.toString());
    const warm = await f.authorizeCode();
    const warmResponse = await f.exchange(warm.code);
    expect(warmResponse.status).toBe(200);
    await warmResponse.text();
    const sourceBefore = {
      client: f.state.sourceReads,
      credential: f.state.credentialReads,
      factsSql: f.state.factsSql,
    };
    const samples = [];
    for (const scope of ["openid", "openid profile phone", "openid profile phone"]) {
      const issued = await f.authorizeCode({ scope });
      requests = 0;
      responses = 0;
      events.length = 0;
      const signingBefore = f.state.signingMs;
      const started = performance.now();
      const response = await f.exchange(issued.code);
      await response.text();
      const sample = {
        scope,
        requests,
        responses,
        serialWaves: events.filter(
          (event, index) => event === "request" && (index === 0 || events[index - 1] === "response"),
        ).length,
        ms: performance.now() - started,
        signingMs: f.state.signingMs - signingBefore,
      };
      expect(response.status).toBe(200);
      expect([sample.requests, sample.responses, sample.serialWaves]).toEqual(
        scope === "openid" ? [9, 9, 9] : [10, 10, 10],
      );
      samples.push(sample);
    }
    expect({
      client: f.state.sourceReads,
      credential: f.state.credentialReads,
      factsSql: f.state.factsSql,
    }).toEqual(sourceBefore);
    expect(f.state.factsSql).toBe(0);
    const report = JSON.stringify({ samples, sourceDuringSamples: { client: 0, credential: 0, factsSql: 0 } });
    process.stdout.write(`OIDC candidate actual HTTP network samples ${report}\n`);
  }
  catch (failure) {
    bodyFailed = true;
    bodyFailure = failure;
  }
  finally {
    const close = () =>
      closeFixtureResources([
        async () => await f?.close(),
        async () =>
          await new Promise<void>((resolve, reject) =>
            proxy.close(error => (error ? reject(error) : resolve())),
          ),
      ]);
    if (bodyFailed)
      await cleanupAfterFixtureFailure(bodyFailure, close);
    else await close();
  }
});

test("OIDC same-root Client isolation preserves the other client Code and Token", async () => {
  const f = await setup();
  try {
    const first = await f.authorizeCode();
    const otherClient = `oidc-${randomUUID()}`;
    f.addClient(otherClient);
    const response = await f.authorize({ client_id: otherClient });
    const otherCode = new URL(response.headers.get("Location")!).searchParams.get("code")!;
    const otherRecord = await f.oidcState.readCode(otherClient, otherCode);
    const wrongClient = await f.exchange(first.code, { client_id: otherClient });
    expect(wrongClient.status).toBe(400);
    expect(f.reports).toEqual([]);
    const forged = `${otherCode.split(".")[0]}.${first.record.userSessionId}.${first.record.clientSessionId}`;
    const failed = await f.exchange(forged);
    expect(failed.status).toBe(400);
    expect(await f.oidcState.readCode(otherClient, otherCode)).toEqual(otherRecord);
    const successful = await f.exchange(otherCode, { client_id: otherClient });
    expect(successful.status).toBe(200);
    const value: OidcTokenResponse = await successful.json();
    const access = await f.resolve(value.access_token);
    expect(access.token.clientId).toBe(otherClient);
    expect(access.observation.userSession.userSessionId).toBe(first.record.userSessionId);
    expect((await f.scope.inspect(first.target)).record?.state).toBe("terminated");
  }
  finally {
    await f.close();
  }
});

for (const fault of ["expired", "corrupt", "missing-index"] as const) {
  test(`OIDC Token ${fault} is resolved from the digest authority without renewal`, async () => {
    const f = await setup(false, 30, undefined, fault === "expired" ? 1 : 45);
    try {
      const issued = await f.authorizeCode();
      const value: OidcTokenResponse = await (await f.exchange(issued.code)).json();
      const before = await f.scope.inspect(issued.target);
      if (fault === "expired")
        await Bun.sleep(1100);
      if (fault === "corrupt")
        await f.oidcState.corruptToken(value.access_token);
      if (fault === "missing-index")
        await f.oidcState.forgetTokenIndex(value.access_token);
      let failure: unknown;
      let resolved: unknown;
      try {
        resolved = await f.resolve(value.access_token);
      }
      catch (error) {
        failure = error;
      }
      expect(Boolean(resolved)).toBe(fault === "missing-index");
      expect(Boolean(failure)).toBe(fault !== "missing-index");
      expect(await f.scope.inspect(issued.target)).toEqual(before);
    }
    finally {
      await f.close();
    }
  });
}

test("OIDC Token maintenance partial failure is explicit and exact rerun preserves non-target records", async () => {
  const f = await setup();
  const independent = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
  try {
    const first = await f.authorizeCode();
    const value: OidcTokenResponse = await (await f.exchange(first.code)).json();
    const otherClient = `oidc-${randomUUID()}`;
    f.addClient(otherClient);
    const authorized = await f.authorize({ client_id: otherClient });
    const otherCode = new URL(authorized.headers.get("Location")!).searchParams.get("code")!;
    const nonTarget = await f.oidcState.readCode(otherClient, otherCode);
    const failing = createOidcMaintenance(
      {
        scan: f.oidcState.redis.scan.bind(f.oidcState.redis),
        get: f.oidcState.redis.get.bind(f.oidcState.redis),
        async eval() {
          throw new Error("Maintenance transport unavailable");
        },
      },
      f.oidcState.namespace,
    );
    const failed = await failing.apply({ clientId: f.clientId });
    expect(failed).toMatchObject({ removed: 0, unknown: 1 });
    expect(await f.oidcState.readToken(value.access_token)).not.toBeNull();
    const maintenance = createOidcMaintenance(f.oidcState.redis, f.oidcState.namespace);
    expect(await maintenance.apply({ clientId: f.clientId })).toMatchObject({ removed: 1 });
    const verifier = createOidcInventory(independent, f.oidcState.namespace);
    expect(await verifier.inventory({ clientId: f.clientId })).toMatchObject({ matching: 0, unknown: 0 });
    expect(await f.oidcState.readCode(otherClient, otherCode)).toEqual(nonTarget);
  }
  finally {
    independent.disconnect();
    await f.close();
  }
});

test("OIDC required token parameters retain standard errors and Secret takes precedence over Gate", async () => {
  const f = await setup(true);
  try {
    const issued = await f.authorizeCode();
    await f.setClient(value => ({ ...value, status: ClientStatus.Maintenance }));
    const rejected = await f.exchange(
      issued.code,
      { code_verifier: "" },
      { Authorization: f.basic("wrong") },
    );
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toMatchObject({ error: "invalid_client" });
    expect(f.reports).toEqual([]);
    expect(await f.oidcState.readCode(f.clientId, issued.code)).toEqual(issued.record);
    expect((await f.scope.inspect(issued.target)).record?.state).toBe("active");
    await f.setClient(value => ({ ...value, status: ClientStatus.Enable }));
    for (const parameter of ["code", "grant_type", "redirect_uri", "code_verifier"]) {
      const next = await f.authorizeCode();
      const response = await f.exchange(next.code, { [parameter]: "" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
      const remains = await f.oidcState.readCode(f.clientId, next.code);
      expect(remains !== null).toBe(parameter === "code" || parameter === "grant_type");
    }
  }
  finally {
    await f.close();
  }
});

for (const fault of ["login", "configuration-and-cleanup"] as const) {
  test(`OIDC setup ${fault} closes real HTTP/Redis resources and lets its proxy finish`, async () => {
    const url = new URL(process.env.IAM_API_TEST_REDIS_URL!);
    const upstreamAddress = { host: url.hostname, port: Number(url.port) };
    let acceptedConnections = 0;
    const proxy = createServer((downstream) => {
      acceptedConnections++;
      const upstream = connect(upstreamAddress);
      downstream.pipe(upstream);
      upstream.pipe(downstream);
      downstream.on("close", () => upstream.destroy());
      upstream.on("close", () => downstream.destroy());
      downstream.on("error", () => upstream.destroy());
      upstream.on("error", () => downstream.destroy());
    });
    await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address();
    if (!address || typeof address === "string")
      throw new Error("Missing proxy port");
    url.port = String(address.port);
    let initialized: Awaited<ReturnType<typeof fixture>> | undefined;
    let failure: unknown;
    try {
      await setup(fault === "configuration-and-cleanup", 30, url.toString(), 45, (f) => {
        initialized = f;
        if (fault === "login")
          f.state.loginFailure = true;
        else f.oidcState.redis.disconnect();
      });
    }
    catch (error) {
      failure = error;
    }
    finally {
      // close waits for the actual accepted Redis sockets; leaked setup resources would prevent completion.
      await new Promise<void>((resolve, reject) =>
        proxy.close(error => (error ? reject(error) : resolve())),
      );
    }
    expect(acceptedConnections).toBeGreaterThanOrEqual(2);
    expect(failure).toBeDefined();
    expect(initialized?.oidcState.redis.status).toBe("end");
    expect(proxy.listening).toBe(false);
    let httpFailure: unknown;
    try {
      await fetch(`${initialized!.httpOrigin}/oidc/jwks`);
    }
    catch (error) {
      httpFailure = error;
    }
    expect(httpFailure).toBeDefined();
    if (fault === "configuration-and-cleanup") {
      expect(failure).toBeInstanceOf(AggregateError);
      if (!(failure instanceof AggregateError))
        throw new Error("Expected combined initialization and cleanup failure");
      expect(failure.errors).toHaveLength(2);
      expect(failure.cause).toBe(failure.errors[0]);
      expect(failure.errors[0].message).toBe("Client Snapshot invalidation failed");
      expect(failure.errors[1]).toBeInstanceOf(AggregateError);
    }
    else {
      expect(failure).not.toBeInstanceOf(AggregateError);
    }
  });
}

test("Confidential HTTP blocks Client plus IP after five failures without consuming Code or revoking, then recovers", async () => {
  const f = await setup(true, 30, undefined, 45, undefined, 2);
  try {
    const issued = await f.authorizeCode();
    const before = await f.scope.inspect(issued.target);
    const ip = { "X-Forwarded-For": "192.0.2.10" };
    for (let attempt = 0; attempt < 5; attempt++) {
      const denied = await f.exchange(issued.code, {}, { ...ip, Authorization: f.basic("wrong") });
      expect(denied.status).toBe(401);
    }
    const blocked = await f.exchange(issued.code, {}, ip);
    expect(blocked.status).toBe(401);
    const blockedBody = await blocked.json();
    expect(blockedBody.error).toBe("invalid_client");
    const remaining = await f.oidcState.readCode(f.clientId, issued.code);
    const after = await f.scope.inspect(issued.target);
    expect(remaining).toEqual(issued.record);
    expect(after).toEqual(before);
    expect(f.reports).toEqual([]);
    const other = `other-${randomUUID()}`;
    f.addClient(other);
    const differentClient = await f.exchange(
      "malformed",
      { client_id: other },
      {
        ...ip,
        Authorization: `Basic ${Buffer.from(`${other}:${encodeURIComponent("current secret:+")}`).toString("base64")}`,
      },
    );
    expect(differentClient.status).toBe(400);
    const differentIp = await f.exchange("malformed", {}, { "X-Forwarded-For": "192.0.2.11" });
    expect(differentIp.status).toBe(400);
    await Bun.sleep(2100);
    const recovered = await f.exchange(issued.code, {}, ip);
    expect(recovered.status).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("Confidential successful HTTP exchange clears the accumulated failures", async () => {
  const f = await setup(true, 30, undefined, 45, undefined, 60);
  try {
    const ip = { "X-Forwarded-For": "192.0.2.20" };
    for (let round = 0; round < 2; round++) {
      const issued = await f.authorizeCode();
      for (let attempt = 0; attempt < 4; attempt++) {
        const denied = await f.exchange(issued.code, {}, { ...ip, Authorization: f.basic("wrong") });
        expect(denied.status).toBe(401);
      }
      const accepted = await f.exchange(issued.code, {}, ip);
      expect(accepted.status).toBe(200);
    }
  }
  finally {
    await f.close();
  }
});

test("OIDC HTTP associates safe protocol and revocation reports with request and trace identifiers", async () => {
  const f = await setup();
  try {
    const issued = await f.authorizeCode();
    const traceId = "1234567890abcdef1234567890abcdef";
    const response = await f.exchange(
      issued.code,
      { code_verifier: "wrong" },
      { "X-Request-Id": "oidc-exchange-failure", "traceparent": `00-${traceId}-1234567890abcdef-01` },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("X-Request-Id")).toBe("oidc-exchange-failure");
    expect(f.reports).toEqual([
      expect.objectContaining({
        event: "oidc_exchange_failed",
        requestId: "oidc-exchange-failure",
        traceId,
        revocation: expect.objectContaining({ status: "terminated" }),
      }),
    ]);
    expect(f.protocolReports).toEqual([
      expect.objectContaining({
        event: "oidc_protocol_error",
        requestId: "oidc-exchange-failure",
        traceId,
        path: "/oidc/token",
      }),
    ]);
    expect(JSON.stringify([...f.reports, ...f.protocolReports])).not.toContain(issued.code);
    expect(JSON.stringify([...f.reports, ...f.protocolReports])).not.toContain("current secret");
  }
  finally {
    await f.close();
  }
});

test("live Client authentication failures are outside the OIDC artifact inventory and verifier", async () => {
  const f = await fixture();
  const limiter = createOidcClientAuthRateLimiter({
    redis: f.oidcState.redis,
    namespace: f.oidcState.namespace,
  });
  try {
    for (let attempt = 0; attempt < 5; attempt++) await limiter.recordFailure(f.clientId, "192.0.2.30");
    const blocked = await limiter.isBlocked(f.clientId, "192.0.2.30");
    expect(blocked).toBe(true);
    const inventory = createOidcInventory(f.oidcState.redis, f.oidcState.namespace);
    let cursor = "0";
    let matching = 0;
    let unknown = 0;
    do {
      const page = await inventory.inventory({ cursor });
      matching += page.matching;
      unknown += page.unknown;
      cursor = page.nextCursor;
    } while (cursor !== "0");
    expect({ matching, unknown }).toEqual({ matching: 0, unknown: 0 });
    const verified = await createOidcVerifier(f.oidcState.redis, f.oidcState.namespace).verify();
    expect(verified).toEqual({ matching: 0 });
    const stillBlocked = await limiter.isBlocked(f.clientId, "192.0.2.30");
    expect(stillBlocked).toBe(true);
  }
  finally {
    await limiter.clear(f.clientId, "192.0.2.30");
    await f.close();
  }
});

for (const trustProxy of [true, false]) {
  test(`Confidential limiter uses the real HTTP peer without trusted XFF (trustProxy=${trustProxy})`, async () => {
    const f = await setup(true, 30, undefined, 45, undefined, 60, trustProxy);
    try {
      const issued = await f.authorizeCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await f.exchange(
          issued.code,
          {},
          {
            "Authorization": f.basic("wrong"),
            "X-Real-IP": `192.0.2.${attempt + 1}`,
            "CF-Connecting-IP": `198.51.100.${attempt + 1}`,
            ...(trustProxy ? {} : { "X-Forwarded-For": `203.0.113.${attempt + 1}` }),
          },
        );
        expect(response.status).toBe(401);
      }
      const denied = await f.exchange(
        issued.code,
        {},
        {
          "X-Real-IP": "192.0.2.200",
          "CF-Connecting-IP": "198.51.100.200",
          ...(trustProxy ? {} : { "X-Forwarded-For": "203.0.113.200" }),
        },
      );
      expect(denied.status).toBe(401);
      const remaining = await f.oidcState.readCode(f.clientId, issued.code);
      expect(remaining).toEqual(issued.record);
    }
    finally {
      await f.close();
    }
  });
}

test("Confidential HTTP clear failure revokes the original ClientSession after Code consumption and Token preparation", async () => {
  const f = await setup(true, 30, undefined, 45, undefined, 60);
  try {
    const first = await f.authorizeCode();
    const firstResponse = await f.exchange(first.code);
    expect(firstResponse.status).toBe(200);
    const firstToken: OidcTokenResponse = await firstResponse.json();
    const pending = await f.authorizeCode();
    expect(pending.record.clientSessionId).toBe(first.record.clientSessionId);
    const otherRoot = await f.login();
    const otherCode = await f.authorizeCode();
    const otherResponse = await f.exchange(otherCode.code);
    expect(otherResponse.status).toBe(200);
    const otherToken: OidcTokenResponse = await otherResponse.json();
    const badSecret = await f.exchange(pending.code, {}, { Authorization: f.basic("wrong") });
    expect(badSecret.status).toBe(401);
    const traceId = "1234567890abcdef1234567890abcdef";
    f.state.failClientAuthClear = true;
    const failed = await f.exchange(
      pending.code,
      {},
      { "X-Request-Id": "clear-failed-request", "traceparent": `00-${traceId}-1234567890abcdef-01` },
    );
    expect(failed.status).toBe(503);
    expect(failed.headers.get("X-Request-Id")).toBe("clear-failed-request");
    const failureBody = await failed.json();
    expect(failureBody.error).toBe("temporarily_unavailable");
    expect(failureBody).not.toHaveProperty("access_token");
    const prepared = f.preparedAccessTokens.at(-1);
    if (!prepared)
      throw new Error("Expected prepared Access Token");
    expect(prepared).not.toBe(firstToken.access_token);
    expect(prepared).not.toBe(otherToken.access_token);
    const stored = await f.oidcState.readToken(prepared);
    const inventory = await f.oidcState.tokens();
    expect(stored).toMatchObject({
      clientSessionId: pending.record.clientSessionId,
      clientSessionInstance: pending.record.clientSessionInstance,
    });
    expect(inventory).toContainEqual(stored);
    const consumed = await f.oidcState.readCode(f.clientId, pending.code);
    const original = await f.scope.inspect(pending.target);
    expect(consumed).toBeNull();
    expect(original.record?.state).toBe("terminated");
    for (const bearer of [firstToken.access_token, prepared]) {
      const denied = await f.request("/oidc/me", { headers: { Authorization: `Bearer ${bearer}` } });
      expect(denied.status).toBe(401);
      const deniedBody = await denied.json();
      expect(deniedBody.error).toBe("invalid_token");
    }
    const unrelated = await f.request("/oidc/me", {
      headers: { Authorization: `Bearer ${otherToken.access_token}` },
    });
    expect(unrelated.status).toBe(200);
    const root = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(otherRoot),
    );
    expect(root.status).toBe("resolved");
    expect(f.reports).toContainEqual(
      expect.objectContaining({
        event: "oidc_exchange_failed",
        requestId: "clear-failed-request",
        traceId,
        failure: "state_unknown",
        consumption: "consumed",
        revocation: expect.objectContaining({ status: "terminated" }),
      }),
    );
    expect(f.protocolReports).toContainEqual(
      expect.objectContaining({
        event: "oidc_server_error",
        requestId: "clear-failed-request",
        traceId,
        statusCode: 503,
      }),
    );
    expect(JSON.stringify(f.reports)).not.toContain(prepared);
  }
  finally {
    await f.close();
  }
});
