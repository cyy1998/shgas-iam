import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Adapter } from "oidc-provider";
import { exportJWK, generateKeyPair } from "jose";
import { interactionPolicy } from "oidc-provider";
import { afterEach, describe, expect, it } from "vitest";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 50);
    server.close((error) => {
      clearTimeout(timeout);
      error ? reject(error) : resolve();
    });
    server.closeIdleConnections();
    server.closeAllConnections();
  })));
});

async function createSigningJwk(kid: string) {
  const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  return { ...await exportJWK(privateKey), alg: "RS256", kid, use: "sig" };
}

const emptyAdapter: Adapter = {
  async consume() {},
  async destroy() {},
  async find() {},
  async findByUid() {},
  async findByUserCode() {},
  async revokeByGrantId() {},
  async upsert() {},
};

describe("oIDC discovery and JWKS", () => {
  it("serves fixed discovery metadata and only public current/previous keys under the issuer path", async () => {
    const { createOidcHttpServer, createOidcProvider } = await import("../app.ts");
    const [current, previous] = await Promise.all([
      createSigningJwk("current"),
      createSigningJwk("previous"),
    ]);
    const issuer = "http://issuer.test/oidc";
    const env = {
      nodeEnv: "test",
      oidc: {
        issuer,
        publicOrigin: "http://issuer.test",
        ssoLoginPath: "/portal/login",
        cookieKeys: ["a".repeat(32), "b".repeat(32)],
        cookieSecure: false,
        globalSessionCookie: "global_session",
        accessTokenTtlSeconds: 3600,
        authorizationCodeTtlSeconds: 300,
        idTokenTtlSeconds: 3600,
        interactionTtlSeconds: 600,
        globalSessionTtlSeconds: 86400,
        clientCacheTtlSeconds: 60,
        bcryptCost: 12,
        clientAuthFailureLimit: 5,
        clientAuthFailureWindowSeconds: 60,
        trustProxy: true,
      },
    } as never;
    const logger = {
      info() {},
      error() {},
      warn() {},
    } as never;
    const provider = createOidcProvider({
      env,
      logger,
      signingKeys: {
        current: { jwk: current } as never,
        previous: { jwk: previous } as never,
      },
      adapter: () => emptyAdapter,
      claims: {
        createAccessTokenExtra: async () => undefined,
        findAccount: async () => undefined,
      } as never,
      interactionPolicy: interactionPolicy.base(),
      clientSecretVerifier: {
        verify: async () => false,
      },
      clientAuthRateLimiter: {
        clear: async () => {},
        isBlocked: async () => false,
        recordFailure: async () => 0,
      },
      oidcSession: {
        logoutPrincipalSession: async () => true,
      },
    });
    const server = createOidcHttpServer({
      provider,
      env,
      logger,
      health: { ping: async () => "PONG" },
      interactions: {
        async handleInteraction() {},
        async handleResume() {},
      },
    } as never);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const discoveryResponse = await fetch(`http://127.0.0.1:${port}/oidc/.well-known/openid-configuration`, {
      headers: {
        "host": "untrusted.example:9999",
        "origin": "https://client.example",
        "x-forwarded-host": "untrusted.example:9999",
        "x-forwarded-proto": "https",
      },
    });
    const discovery = await discoveryResponse.json() as Record<string, unknown>;
    expect(discoveryResponse.headers.get("access-control-allow-origin")).toBe("https://client.example");
    expect(discoveryResponse.headers.get("x-request-id")).toBeTruthy();
    expect(discovery).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/me`,
      jwks_uri: `${issuer}/jwks`,
      end_session_endpoint: `${issuer}/session/end`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    });
    expect(discovery.scopes_supported).toEqual(expect.arrayContaining([
      "openid",
      "profile",
      "phone",
      "iam:authorization",
    ]));
    expect(discovery.grant_types_supported).toEqual(["authorization_code"]);
    expect(discovery.grant_types_supported).not.toContain("refresh_token");

    const jwksResponse = await fetch(`http://127.0.0.1:${port}/oidc/jwks`, {
      headers: {
        "host": "issuer.test",
        "x-forwarded-host": "issuer.test",
        "x-forwarded-proto": "http",
      },
    });
    const jwks = await jwksResponse.json() as { keys: Array<Record<string, unknown>> };
    expect(jwksResponse.headers.get("access-control-allow-origin")).toBeNull();
    expect(jwks.keys.map(key => key.kid)).toEqual(["current", "previous"]);
    for (const key of jwks.keys) {
      expect(key).toMatchObject({ alg: "RS256", kty: "RSA", use: "sig" });
      expect(key).not.toHaveProperty("d");
      expect(key).not.toHaveProperty("p");
      expect(key).not.toHaveProperty("q");
    }
  }, 10_000);
});
