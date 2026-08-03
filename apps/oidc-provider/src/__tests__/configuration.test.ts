import type { Adapter } from "oidc-provider";
import type { SigningKey } from "../security/signing-keys.ts";
import assert from "node:assert/strict";
import { interactionPolicy } from "oidc-provider";
import { describe, it } from "vitest";
import { createProviderConfiguration } from "../provider/configuration.ts";

const env = {
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
} as const;

const emptyAdapter: Adapter = {
  async consume() {},
  async destroy() {},
  async find() {},
  async findByUid() {},
  async findByUserCode() {},
  async revokeByGrantId() {},
  async upsert() {},
};

describe("oIDC provider configuration", () => {
  it("exposes only the approved first-version protocol capabilities", () => {
    const configuration = createProviderConfiguration(env as never, {
      adapter: () => emptyAdapter,
      claims: {
        createAccessTokenExtra: async () => undefined,
        findAccount: async () => undefined,
      } as never,
      currentSigningKey: { jwk: { kty: "RSA", kid: "current", alg: "RS256" } } as SigningKey,
      interactionPolicy: interactionPolicy.base(),
    });

    assert.deepEqual(configuration.responseTypes, ["code"]);
    assert.deepEqual(configuration.subjectTypes, ["public"]);
    assert.deepEqual(configuration.clientAuthMethods, ["none", "client_secret_basic"]);
    assert.deepEqual(configuration.enabledJWA?.idTokenSigningAlgValues, ["RS256"]);
    assert.equal(configuration.pkce?.required?.(null as never, null as never), true);
    assert.equal(configuration.features?.devInteractions?.enabled, false);
    assert.equal(configuration.features?.userinfo?.enabled, true);
    assert.equal(configuration.features?.jwtUserinfo?.enabled, false);
    assert.equal(configuration.features?.rpInitiatedLogout?.enabled, true);
    assert.equal(configuration.scopes?.includes("offline_access"), false);
    assert.deepEqual(configuration.claims?.["iam:employments"], ["iam:employments"]);
    assert.deepEqual(configuration.claims?.["iam:authorization"], ["iam:authorization"]);
    assert.equal(configuration.cookies?.long?.secure, false);
    assert.equal(configuration.cookies?.short?.secure, false);
  });

  it("limits token TTL to the remaining global session and enforces client-aware CORS", () => {
    const configuration = createProviderConfiguration(env as never, {
      adapter: () => emptyAdapter,
      claims: {
        createAccessTokenExtra: async () => undefined,
        findAccount: async () => undefined,
      } as never,
      currentSigningKey: { jwk: { kty: "RSA", kid: "current", alg: "RS256" } } as SigningKey,
      interactionPolicy: interactionPolicy.base(),
    });
    const accessTokenTtl = configuration.ttl?.AccessToken as (ctx: unknown) => number;
    const boundedTtl = accessTokenTtl({
      oidc: { entities: { AuthorizationCode: { globalSessionExpiresAt: Math.floor(Date.now() / 1000) + 90 } } },
    });
    assert.ok(boundedTtl >= 89 && boundedTtl <= 90);
    assert.equal(accessTokenTtl({ oidc: { entities: {} } }), 3600);

    const publicClient = {
      clientAuthMethod: "none",
      redirectUris: ["https://client.example/callback"],
    };
    const confidentialClient = {
      clientAuthMethod: "client_secret_basic",
      redirectUris: ["https://client.example/callback"],
    };
    assert.equal(configuration.clientBasedCORS?.(
      { oidc: { route: "token" } } as never,
      "https://client.example",
      publicClient as never,
    ), true);
    assert.equal(configuration.clientBasedCORS?.(
      { oidc: { route: "token" } } as never,
      "https://client.example",
      confidentialClient as never,
    ), false);
    assert.equal(configuration.clientBasedCORS?.(
      { oidc: { route: "userinfo" } } as never,
      "https://evil.example",
      publicClient as never,
    ), false);
  });

  it("passes the consumed Authorization Code to the Access Token snapshot transfer", async () => {
    const received: unknown[][] = [];
    const configuration = createProviderConfiguration(env as never, {
      adapter: () => emptyAdapter,
      claims: {
        createAccessTokenExtra: async (...args: unknown[]) => {
          received.push(args);
          return { claimsSnapshot: { claims: { sub: "subject-a" } } };
        },
        findAccount: async () => undefined,
      } as never,
      currentSigningKey: { jwk: { kty: "RSA", kid: "current", alg: "RS256" } } as SigningKey,
      interactionPolicy: interactionPolicy.base(),
    });
    const code = { kind: "AuthorizationCode", claimsSnapshot: { claims: { sub: "subject-a" } } };
    const token = { kind: "AccessToken" };

    await configuration.extraTokenClaims?.({
      oidc: { entities: { AuthorizationCode: code } },
    } as never, token as never);

    assert.deepEqual(received, [[token, code]]);
  });
});
