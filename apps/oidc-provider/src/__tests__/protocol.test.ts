import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair } from "jose";
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

describe("oIDC discovery and JWKS", () => {
  it("serves fixed discovery metadata and only public current/previous keys under the issuer path", async () => {
    process.env.DATABASE_URL = "postgres://unused";
    const { createOidcHttpServer, createOidcProvider } = await import("../app.ts");
    const [current, previous] = await Promise.all([
      createSigningJwk("current"),
      createSigningJwk("previous"),
    ]);
    const issuer = "http://issuer.test/oidc";
    const env = {
      DATABASE_URL: "postgres://unused",
      REDIS_URL: "redis://unused",
      REDIS_PORT: 6379,
      REDIS_DB: 0,
      PORT: 30002,
      OIDC_COOKIE_KEYS: ["a".repeat(32), "b".repeat(32)],
      NODE_ENV: "test",
      OIDC_ISSUER: issuer,
      OIDC_PUBLIC_ORIGIN: "http://issuer.test",
      OIDC_SSO_LOGIN_PATH: "/portal/login",
      OIDC_GLOBAL_SESSION_COOKIE: "global_session",
      OIDC_ACCESS_TOKEN_TTL_SECONDS: 3600,
      OIDC_AUTHORIZATION_CODE_TTL_SECONDS: 300,
      OIDC_ID_TOKEN_TTL_SECONDS: 3600,
      OIDC_INTERACTION_TTL_SECONDS: 600,
      OIDC_GLOBAL_SESSION_TTL_SECONDS: 86400,
      OIDC_CLIENT_CACHE_TTL_SECONDS: 60,
      OIDC_BCRYPT_COST: 12,
      OIDC_CLIENT_AUTH_FAILURE_LIMIT: 5,
      OIDC_CLIENT_AUTH_FAILURE_WINDOW_SECONDS: 60,
      OIDC_TRUST_PROXY: true,
    } as never;
    const redis = {} as never;
    const runtime = createOidcProvider({
      env,
      redis,
      logger: {
        info() {},
        error() {},
        warn() {},
      } as never,
      signingKeys: {
        current: { jwk: current } as never,
        previous: { jwk: previous } as never,
      },
    });
    const server = createOidcHttpServer(runtime, redis);
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
