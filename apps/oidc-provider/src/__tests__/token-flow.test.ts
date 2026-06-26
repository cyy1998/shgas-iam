import type { AddressInfo } from "node:net";
import type { Adapter, AdapterPayload } from "oidc-provider";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import Provider, { interactionPolicy } from "oidc-provider";
import { afterEach, describe, expect, it } from "vitest";
import { createProviderConfiguration } from "../provider/configuration.ts";

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
    this.values.set(`${this.model}:${id}`, structuredClone(payload));
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
      allowed_scopes: ["openid", "profile"],
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
  const provider = new Provider("http://issuer.test/oidc", createProviderConfiguration({
    nodeEnv: "test",
    oidc: {
      issuer: "http://issuer.test/oidc",
      cookieKeys: ["a".repeat(32), "b".repeat(32)],
      accessTokenTtlSeconds: 3600,
      authorizationCodeTtlSeconds: 300,
      idTokenTtlSeconds: 3600,
      interactionTtlSeconds: 600,
      globalSessionTtlSeconds: 86400,
    },
  } as never, {
    adapter: model => new MemoryAdapter(model, values, clients),
    claims: {
      createAccessTokenExtra: async () => ({
        userId: 7,
        globalSessionId: "global-a",
        authTime: 123,
        scopes: ["openid", "profile"],
        oidcConfigVersion: 1,
        userInfoSnapshot: { sub: subject, name: "Alice", preferred_username: "alice" },
      }),
      findAccount: async (accountId: string, token?: { authTime?: number }) => accountId === subject
        ? {
            accountId: subject,
            claims: async () => ({
              sub: subject,
              name: "Alice",
              preferred_username: "alice",
              ...(typeof token?.authTime === "number" ? { auth_time: token.authTime } : {}),
            }),
          }
        : undefined,
    } as never,
    currentSigningKey: { jwk } as never,
    interactionPolicy: interactionPolicy.base(),
  }));
  const server = createServer(provider.callback());
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { provider, publicKey: await importJWK(publicJwk, "RS256"), url: `http://127.0.0.1:${port}` };
}

async function issueCode(
  provider: Provider,
  clientId: string,
  redirectUri: string,
  input: { nonce?: string } = {},
) {
  const client = await provider.Client.find(clientId);
  if (!client)
    throw new Error("test client not found");
  const grant = new provider.Grant({ accountId: subject, clientId });
  grant.addOIDCScope("openid profile");
  const grantId = await grant.save();
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
    ...(typeof input.nonce === "string" ? { nonce: input.nonce } : {}),
    redirectUri,
    scope: "openid profile",
  });
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

describe("authorization code token flow", () => {
  it("enforces PKCE, echoes nonce in a verifiable RS256 ID Token, and rejects code replay", async () => {
    const { provider, publicKey, url } = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(provider, "public-client", redirectUri, { nonce: "nonce-a" });

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
    expect(verified.payload).not.toHaveProperty("iam:authorization");

    const replay = await exchangeCode(url, {
      clientId: "public-client",
      code,
      redirectUri,
      verifier,
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("omits nonce from the ID Token when the authorization code has no nonce", async () => {
    const { provider, publicKey, url } = await createRuntime();
    const redirectUri = "https://public.example/callback?from=iam";
    const code = await issueCode(provider, "public-client", redirectUri);

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
    const { provider, url } = await createRuntime();
    const redirectUri = "https://confidential.example/callback";
    const code = await issueCode(provider, "confidential-client", redirectUri);

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
