import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { AddressInfo } from "node:net";
import type { Adapter, AdapterPayload } from "oidc-provider";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import Provider, { interactionPolicy } from "oidc-provider";
import { afterEach, describe, expect, it } from "vitest";
import { OidcScopesSchema } from "../../src/provider/claims-snapshot.ts";
import { createOidcClaimsAdapter } from "../../src/provider/claims.ts";
import {
  registerOidcClientTrafficGate,
} from "../../src/provider/client-traffic-gate.ts";
import { createProviderConfiguration } from "../../src/provider/configuration.ts";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";
import { createClientTrafficGateController } from "./support/client-traffic-gate.ts";

const subject = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

class MemoryAdapter implements Adapter {
  constructor(
    private readonly model: string,
    private readonly values: Map<string, AdapterPayload>,
    private readonly clients: Map<string, AdapterPayload>,
  ) {}

  async upsert(id: string, payload: AdapterPayload) {
    const stored = structuredClone(payload);
    if (this.model === "AccessToken") {
      const clientId = typeof stored.clientId === "string" ? stored.clientId : "unknown-client";
      stored.extra = {
        ...(stored.extra ?? {}),
        kernelCredentialId: `credential-${clientId}`,
      };
    }
    this.values.set(`${this.model}:${id}`, stored);
  }

  async find(id: string) {
    if (this.model === "Client")
      return this.clients.get(id);
    return this.values.get(`${this.model}:${id}`);
  }

  async consume(id: string) {
    const key = `${this.model}:${id}`;
    const value = this.values.get(key);
    if (!value)
      return;
    if (value.consumed)
      throw new Error("already consumed");
    value.consumed = Math.floor(Date.now() / 1000);
  }

  async destroy(id: string) {
    this.values.delete(`${this.model}:${id}`);
  }

  async revokeByGrantId(grantId: string) {
    for (const [key, value] of this.values) {
      if (value.grantId === grantId)
        this.values.delete(key);
    }
  }

  async findByUid() {}
  async findByUserCode() {}
}

async function createRuntime() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  const jwk = { ...await exportJWK(privateKey), alg: "RS256", kid: "current", use: "sig" };
  const publicJwk = { ...await exportJWK(publicKey), alg: "RS256", kid: "current", use: "sig" };
  const clients = new Map<string, AdapterPayload>([
    ["public-client", {
      client_id: "public-client",
      redirect_uris: ["https://public.example/callback?from=iam"],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
      id_token_signed_response_alg: "RS256",
      require_auth_time: true,
      allowed_scopes: ["openid", "profile", "iam:employments", "iam:authorization"],
      iam_client_id: 1,
      oidc_config_version: 1,
    }],
    ["confidential-client", {
      client_id: "confidential-client",
      client_secret: "confidential-secret-value-123456",
      redirect_uris: ["https://confidential.example/callback"],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "client_secret_basic",
      id_token_signed_response_alg: "RS256",
      require_auth_time: true,
      allowed_scopes: ["openid", "profile"],
      iam_client_id: 2,
      oidc_config_version: 1,
    }],
  ]);
  const values = new Map<string, AdapterPayload>();
  const clientConfigVersions = new Map([...clients.keys()].map(clientId => [clientId, 1]));
  const revokedCredentialIds = new Set<string>();
  const projectionState = {
    name: "Alice at authorization",
    username: "alice-at-authorization",
  };
  let projectionReads = 0;
  const claims = createOidcClaimsAdapter({
    accounts: {
      findBySubject: async accountId => accountId === subject
        ? {
            id: 7,
            subjectIdentifier: subject,
            username: projectionState.username,
            name: projectionState.name,
            mobile: null,
            status: 1,
            isDelete: false,
          }
        : null,
    },
    clients: {
      findRuntime: async clientId => ({
        ...clients.get(clientId),
        oidc_config_version: clientConfigVersions.get(clientId),
      } as never),
    },
    globalSessions: {
      resolveById: async sessionId => sessionId === "principal-a"
        ? { sessionId, accountId: subject, authTime: 123 }
        : null,
    },
    projection: {
      resolve: async () => {
        projectionReads += 1;
        const employment = {
          isPrimary: true,
          organization: {
            code: "org-a",
            name: "Organization A",
            type: "department",
            path: [{ code: "org-a", name: "Organization A", type: "department" }],
          },
          position: { code: "position-a", name: "Position A" },
        };
        return {
          subjectIdentifier: subject,
          username: projectionState.username,
          name: projectionState.name,
          employments: [employment],
          authorization: {
            employments: [{ ...employment, roles: ["app:user"], privileges: ["app:read"] }],
            roles: ["app:user"],
            privileges: ["app:read"],
          },
        };
      },
    },
    providerSessions: {
      read: async (sessionUid, clientCode) => sessionUid === "provider-a" && clients.has(clientCode)
        ? {
            principalSessionId: "principal-a",
            bindingId: `binding-${clientCode}`,
            clientCode,
            accountId: subject,
            authTime: 123,
            oidcConfigVersion: 1,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          }
        : null,
    },
    tokens: {
      resolveAccessTokenCredential: async (externalToken) => {
        const token = values.get(`AccessToken:${externalToken}`);
        const clientId = typeof token?.clientId === "string" ? token.clientId : null;
        const credentialId = clientId ? `credential-${clientId}` : null;
        if (!clientId || !credentialId || revokedCredentialIds.has(credentialId))
          return null;
        return {
          credential: {
            credentialId,
            principalSessionId: "principal-a",
            bindingId: `binding-${clientId}`,
            clientCode: clientId,
          },
          metadata: {
            providerTokenKey: `oidc:model:AccessToken:${externalToken}`,
            providerTokenId: externalToken,
            oidcConfigVersion: 1,
          },
        };
      },
      revokeAccessTokenCredential: async credentialId => void revokedCredentialIds.add(credentialId),
    },
  });
  const traffic = createClientTrafficGateController();
  const trafficGate = traffic.trafficGate;
  const provider = new Provider("http://issuer.test/oidc", createProviderConfiguration({
    nodeEnv: "test",
    oidc: {
      issuer: "http://issuer.test/oidc",
      cookieKeys: ["a".repeat(32), "b".repeat(32)],
      cookieSecure: false,
      accessTokenTtlSeconds: 3600,
      authorizationCodeTtlSeconds: 300,
      idTokenTtlSeconds: 3600,
      interactionTtlSeconds: 600,
      globalSessionTtlSeconds: 86400,
    },
  } as never, {
    adapter: model => new MemoryAdapter(model, values, clients),
    claims,
    currentSigningKey: { jwk } as never,
    interactionPolicy: interactionPolicy.base(),
    trafficGate,
  }));
  registerProtocolModelPayloadExtensions(provider);
  registerOidcClientTrafficGate(provider, trafficGate);
  const server = createServer(provider.callback());
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    claims,
    getProjectionReads: () => projectionReads,
    getRevokedCredentialIds: () => [...revokedCredentialIds],
    projectionState,
    provider,
    publicKey: await importJWK(publicJwk, "RS256"),
    protocolObjectCount(model: string) {
      return [...values.keys()].filter(key => key.startsWith(`${model}:`)).length;
    },
    protocolObjectWasConsumed(model: string, id: string) {
      return values.get(`${model}:${id}`)?.consumed !== undefined;
    },
    setClientTrafficOutcome(clientId: string, outcome: ClientTrafficGateResult) {
      traffic.setClientOutcome(clientId, outcome);
    },
    setClientVersion(clientId: string, version: number) {
      clientConfigVersions.set(clientId, version);
    },
    setTrafficOutcome(outcome: ClientTrafficGateResult) {
      traffic.setDefaultOutcome(outcome);
    },
    url: `http://127.0.0.1:${port}`,
  };
}

async function issueCode(
  provider: Provider,
  clientId: string,
  redirectUri: string,
  input: {
    claims: ReturnType<typeof createOidcClaimsAdapter>;
    nonce?: string;
    scope?: string;
  },
) {
  const client = await provider.Client.find(clientId);
  if (!client)
    throw new Error("test client not found");
  const scope = input.scope ?? "openid profile";
  const scopes = OidcScopesSchema.parse(scope.split(" "));
  const grant = new provider.Grant({ accountId: subject, clientId });
  grant.addOIDCScope(scope);
  const grantId = await grant.save();
  const claimsSnapshot = await input.claims.createAuthorizationCodeSnapshot({
    subjectIdentifier: subject,
    clientId,
    scopes,
    oidcConfigVersion: 1,
    providerSessionUid: "provider-a",
    principalSessionId: "principal-a",
    providerSessionBindingId: `binding-${clientId}`,
  });
  const code = new provider.AuthorizationCode({
    accountId: subject,
    authTime: 123,
    client,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    claims: { id_token: { auth_time: { essential: true } } },
    expiresWithSession: false,
    grantId,
    gty: "authorization_code",
    claimsSnapshot,
    ...(typeof input.nonce === "string" ? { nonce: input.nonce } : {}),
    redirectUri,
    scope,
    sessionUid: "provider-a",
  } as never);
  return await code.save();
}

async function exchangeCode(
  url: string,
  input: { clientId: string; code: string; redirectUri: string; verifier: string; secret?: string },
) {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (input.secret)
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.secret}`).toString("base64")}`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    ...(!input.secret ? { client_id: input.clientId } : {}),
  });
  return await fetch(`${url}/token`, { method: "POST", headers, body });
}

describe("authorization code token flow HTTP smoke", () => {
  it.each([
    ["public Maintenance", "public-client", "https://public.example/callback?from=iam", undefined, { outcome: "maintenance" }],
    ["confidential Maintenance", "confidential-client", "https://confidential.example/callback", "confidential-secret-value-123456", { outcome: "maintenance" }],
    ["unknown public state", "public-client", "https://public.example/callback?from=iam", undefined, { outcome: "unavailable", reason: "read-failed" }],
  ] as const)("preserves the code and issues no token for %s", async (
    _label,
    clientId,
    redirectUri,
    secret,
    blockedOutcome,
  ) => {
    const runtime = await createRuntime();
    const code = await issueCode(runtime.provider, clientId, redirectUri, { claims: runtime.claims });
    const expiresAt = (await runtime.provider.AuthorizationCode.find(code))?.exp;
    runtime.setTrafficOutcome(blockedOutcome);

    const blocked = await exchangeCode(runtime.url, {
      clientId,
      code,
      redirectUri,
      secret,
      verifier,
    });

    expect(blocked.status).toBe(400);
    await expect(blocked.json()).resolves.toEqual({ error: "temporarily_unavailable" });
    expect(runtime.protocolObjectWasConsumed("AuthorizationCode", code)).toBe(false);
    expect((await runtime.provider.AuthorizationCode.find(code))?.exp).toBe(expiresAt);
    expect(runtime.protocolObjectCount("AccessToken")).toBe(0);

    runtime.setTrafficOutcome({ outcome: "enabled" });
    const recovered = await exchangeCode(runtime.url, {
      clientId,
      code,
      redirectUri,
      secret,
      verifier,
    });
    expect(recovered.status).toBe(200);
  });

  it("keeps explicit client disablement a permanent token error before code consumption", async () => {
    const runtime = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(runtime.provider, "public-client", redirectUri, { claims: runtime.claims });
    runtime.setTrafficOutcome({ outcome: "disabled" });

    const blocked = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });

    expect(blocked.status).toBe(400);
    await expect(blocked.json()).resolves.toMatchObject({ error: "invalid_client" });
    expect(runtime.protocolObjectWasConsumed("AuthorizationCode", code)).toBe(false);
    expect(runtime.protocolObjectCount("AccessToken")).toBe(0);
  });

  it("keeps missing client authentication on the provider's permanent error path", async () => {
    const runtime = await createRuntime();
    runtime.setTrafficOutcome({ outcome: "unavailable", reason: "missing" });

    const response = await fetch(`${runtime.url}/token`, {
      body: new URLSearchParams({
        code: "missing-code",
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://public.example/callback?from=iam",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("enforces PKCE, echoes nonce in a verifiable RS256 ID Token, and rejects code replay", async () => {
    const { claims, getProjectionReads, projectionState, provider, publicKey, url } = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(provider, "public-client", redirectUri, {
      claims,
      nonce: "nonce-a",
      scope: "openid profile iam:employments iam:authorization",
    });
    expect(getProjectionReads()).toBe(1);
    projectionState.name = "Alice changed after authorization";
    projectionState.username = "alice-changed";

    const mismatch = await exchangeCode(url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier: "b".repeat(64),
    });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: "invalid_grant" });

    const response = await exchangeCode(url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const tokens = await response.json() as { access_token: string; id_token: string; refresh_token?: string };
    expect(tokens.access_token.split(".")).toHaveLength(1);
    expect(tokens).not.toHaveProperty("refresh_token");
    const verified = await jwtVerify(tokens.id_token, publicKey, {
      algorithms: ["RS256"],
      audience: "public-client",
      issuer: "http://issuer.test/oidc",
    });
    expect(verified.protectedHeader).toMatchObject({ alg: "RS256", kid: "current" });
    expect(verified.payload).toMatchObject({
      sub: subject,
      aud: "public-client",
      nonce: "nonce-a",
      auth_time: 123,
    });
    expect(verified.payload).not.toHaveProperty("iam:employments");
    expect(verified.payload).not.toHaveProperty("iam:authorization");

    const userInfoResponse = await fetch(`${url}/me`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(userInfoResponse.status).toBe(200);
    expect(await userInfoResponse.json()).toMatchObject({
      "sub": subject,
      "name": "Alice at authorization",
      "preferred_username": "alice-at-authorization",
      "iam:employments": [{
        isPrimary: true,
        organization: { orgCode: "org-a" },
        position: { posCode: "position-a" },
      }],
      "iam:authorization": {
        roles: ["app:user"],
        privileges: ["app:read"],
      },
    });
    expect(getProjectionReads()).toBe(1);

    const replay = await exchangeCode(url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("temporarily suspends UserInfo without destroying an existing access token", async () => {
    const runtime = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(runtime.provider, "public-client", redirectUri, { claims: runtime.claims });
    const response = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const tokens = await response.json() as { access_token: string };
    expect(runtime.protocolObjectCount("AccessToken")).toBe(1);

    for (const blockedOutcome of [
      { outcome: "maintenance" },
      { outcome: "unavailable", reason: "read-failed" },
    ] as const) {
      runtime.setTrafficOutcome(blockedOutcome);
      const blocked = await fetch(`${runtime.url}/me`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });

      expect(blocked.status).toBe(503);
      expect(blocked.headers.get("set-cookie")).toBeNull();
      await expect(blocked.json()).resolves.toEqual({ error: "temporarily_unavailable" });
      expect(runtime.protocolObjectCount("AccessToken")).toBe(1);
      expect(runtime.getRevokedCredentialIds()).toEqual([]);
    }

    runtime.setTrafficOutcome({ outcome: "enabled" });
    const recovered = await fetch(`${runtime.url}/me`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ sub: subject });
  });

  it("keeps a real OIDC config change permanently invalid after Maintenance recovery", async () => {
    const runtime = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(runtime.provider, "public-client", redirectUri, { claims: runtime.claims });
    const response = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const accessToken = (await response.json() as { access_token: string }).access_token;

    runtime.setClientTrafficOutcome("public-client", { outcome: "maintenance" });
    runtime.setClientVersion("public-client", 2);
    runtime.setClientTrafficOutcome("public-client", { outcome: "enabled" });
    const invalidated = await fetch(`${runtime.url}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(invalidated.status).toBe(401);
    await expect(invalidated.json()).resolves.toMatchObject({ error: "invalid_token" });
    expect(runtime.getRevokedCredentialIds()).toEqual(["credential-public-client"]);

    runtime.setClientVersion("public-client", 1);
    const didNotRevive = await fetch(`${runtime.url}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(didNotRevive.status).toBe(401);
    await expect(didNotRevive.json()).resolves.toMatchObject({ error: "invalid_token" });
  });

  it.each([
    ["disabled", { outcome: "disabled" }],
    ["deleted", { outcome: "deleted" }],
  ] as const)("rejects an existing access token when its client is %s", async (_label, outcome) => {
    const runtime = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(runtime.provider, "public-client", redirectUri, { claims: runtime.claims });
    const response = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const accessToken = (await response.json() as { access_token: string }).access_token;
    runtime.setClientTrafficOutcome("public-client", outcome);

    const rejected = await fetch(`${runtime.url}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(rejected.status).toBe(401);
    await expect(rejected.json()).resolves.toMatchObject({ error: "invalid_token" });
  });

  it("keeps another client in the shared Provider Session online during Maintenance", async () => {
    const runtime = await createRuntime();
    const publicRedirectUri = "https://public.example/callback?from=iam";
    const confidentialRedirectUri = "https://confidential.example/callback";
    const publicCode = await issueCode(runtime.provider, "public-client", publicRedirectUri, {
      claims: runtime.claims,
    });
    const confidentialCode = await issueCode(runtime.provider, "confidential-client", confidentialRedirectUri, {
      claims: runtime.claims,
    });
    const publicResponse = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code: publicCode,
      redirectUri: publicRedirectUri,
      verifier,
    });
    const confidentialResponse = await exchangeCode(runtime.url, {
      clientId: "confidential-client",
      code: confidentialCode,
      redirectUri: confidentialRedirectUri,
      secret: "confidential-secret-value-123456",
      verifier,
    });
    expect(publicResponse.status).toBe(200);
    expect(confidentialResponse.status).toBe(200);
    const publicAccessToken = (await publicResponse.json() as { access_token: string }).access_token;
    const confidentialAccessToken
      = (await confidentialResponse.json() as { access_token: string }).access_token;

    runtime.setClientTrafficOutcome("public-client", { outcome: "maintenance" });
    const confidentialFollowupCode = await issueCode(
      runtime.provider,
      "confidential-client",
      confidentialRedirectUri,
      { claims: runtime.claims },
    );
    const confidentialFollowup = await exchangeCode(runtime.url, {
      clientId: "confidential-client",
      code: confidentialFollowupCode,
      redirectUri: confidentialRedirectUri,
      secret: "confidential-secret-value-123456",
      verifier,
    });
    const [blockedPublic, availableConfidential] = await Promise.all([
      fetch(`${runtime.url}/me`, {
        headers: { authorization: `Bearer ${publicAccessToken}` },
      }),
      fetch(`${runtime.url}/me`, {
        headers: { authorization: `Bearer ${confidentialAccessToken}` },
      }),
    ]);

    expect(confidentialFollowup.status).toBe(200);
    expect(blockedPublic.status).toBe(503);
    await expect(blockedPublic.json()).resolves.toEqual({ error: "temporarily_unavailable" });
    expect(availableConfidential.status).toBe(200);
    await expect(availableConfidential.json()).resolves.toMatchObject({ sub: subject });
    expect(runtime.protocolObjectCount("AccessToken")).toBe(3);

    runtime.setClientTrafficOutcome("public-client", { outcome: "enabled" });
    const recoveredPublic = await fetch(`${runtime.url}/me`, {
      headers: { authorization: `Bearer ${publicAccessToken}` },
    });
    expect(recoveredPublic.status).toBe(200);
  });

  it("does not change offline ID Token verification during Maintenance", async () => {
    const runtime = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(runtime.provider, "public-client", redirectUri, {
      claims: runtime.claims,
      nonce: "offline-nonce",
    });
    const response = await exchangeCode(runtime.url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const tokens = await response.json() as { id_token: string };

    runtime.setClientTrafficOutcome("public-client", { outcome: "maintenance" });
    const verified = await jwtVerify(tokens.id_token, runtime.publicKey, {
      algorithms: ["RS256"],
      audience: "public-client",
      issuer: "http://issuer.test/oidc",
    });

    expect(verified.payload).toMatchObject({ nonce: "offline-nonce", sub: subject });
  });

  it("omits nonce from the ID Token when the authorization code has no nonce", async () => {
    const { claims, provider, publicKey, url } = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(provider, "public-client", redirectUri, { claims });

    const response = await exchangeCode(url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(response.status).toBe(200);
    const tokens = await response.json() as { id_token: string };
    const verified = await jwtVerify(tokens.id_token, publicKey, {
      algorithms: ["RS256"],
      audience: "public-client",
      issuer: "http://issuer.test/oidc",
    });
    expect(verified.payload).toMatchObject({
      sub: subject,
      aud: "public-client",
      auth_time: 123,
    });
    expect(verified.payload).not.toHaveProperty("nonce");
  });

  it("requires client_secret_basic for a confidential client in addition to PKCE", async () => {
    const { claims, provider, url } = await createRuntime();
    const redirectUri = "https://confidential.example/callback";
    const code = await issueCode(provider, "confidential-client", redirectUri, { claims });

    const missingSecret = await exchangeCode(url, {
      clientId: "confidential-client",
      code,
      redirectUri,
      verifier,
    });
    expect(missingSecret.status).toBe(401);
    expect(await missingSecret.json()).toMatchObject({ error: "invalid_client" });

    const response = await exchangeCode(url, {
      clientId: "confidential-client",
      code,
      redirectUri,
      verifier,
      secret: "confidential-secret-value-123456",
    });
    expect(response.status).toBe(200);
  });
});
