import type Provider from "oidc-provider";
import { describe, expect, it } from "vitest";
import { createOidcProviderSecurity } from "../../src/composition/security/index.ts";
import { registerClientAuthentication } from "../../src/provider/client/client-auth.ts";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";

describe("oIDC provider wiring", () => {
  it("registers client secret verification and exact redirect URI checks", async () => {
    class Client {
      clientId = "client-a";
      redirectUris = ["https://client.example/callback"];
      postLogoutRedirectUris = ["https://client.example/logout"];
    }
    const provider = { Client } as unknown as Provider;

    registerClientAuthentication(provider, {
      verify: async (clientId, secret) => clientId === "client-a" && secret === "secret-a",
    });

    const client = new Client() as Client & {
      compareClientSecret: (secret: string) => Promise<boolean>;
      postLogoutRedirectUriAllowed: (uri: string) => boolean;
      redirectUriAllowed: (uri: string) => boolean;
    };
    await expect(client.compareClientSecret("secret-a")).resolves.toBe(true);
    await expect(client.compareClientSecret("secret-b")).resolves.toBe(false);
    expect(client.redirectUriAllowed("https://client.example/callback")).toBe(true);
    expect(client.redirectUriAllowed("https://client.example/callback/extra")).toBe(false);
    expect(client.postLogoutRedirectUriAllowed("https://client.example/logout")).toBe(true);
  });

  it("keeps protocol-owned payload on loaded authorization codes and Provider Sessions", () => {
    class AuthorizationCode {}
    class Session {}
    class AccessToken { static IN_PAYLOAD = []; }
    class Grant { static IN_PAYLOAD = []; }
    class Interaction { static IN_PAYLOAD = []; }
    Object.defineProperty(AuthorizationCode, "IN_PAYLOAD", {
      configurable: true,
      value: ["foo"],
    });
    Object.defineProperty(Session, "IN_PAYLOAD", {
      configurable: true,
      value: ["bar"],
    });
    const provider = { AuthorizationCode, Session, AccessToken, Grant, Interaction } as unknown as Provider;

    registerProtocolModelPayloadExtensions(provider);

    const authorizationCodeModel = provider.AuthorizationCode as unknown as typeof AuthorizationCode & {
      IN_PAYLOAD: string[];
    };

    expect(authorizationCodeModel.IN_PAYLOAD).toEqual([
      "foo",
      "redisLifetimeObserved",
      "authorizationAttemptId",
      "claimsSnapshot",
      "globalSessionRemainingSeconds",
    ]);
    expect(authorizationCodeModel.IN_PAYLOAD).not.toBe(authorizationCodeModel.IN_PAYLOAD);
    const sessionModel = provider.Session as unknown as typeof Session & { IN_PAYLOAD: string[] };
    expect(sessionModel.IN_PAYLOAD).toEqual([
      "bar",
      "redisLifetimeObserved",
      "redisPreserveDeadline",
      "redisObservedId",
      "kernelPrincipalSessionId",
      "providerSessionAnchorGeneration",
    ]);
    expect(sessionModel.IN_PAYLOAD).not.toBe(sessionModel.IN_PAYLOAD);
  });

  it("materializes client authentication security from explicit composition dependencies", async () => {
    let failureCount = 1;
    const security = createOidcProviderSecurity({
      env: { oidc: { clientAuthFailureLimit: 2 } } as never,
      repositories: {
        client: {
          findSecretRecord: async () => null,
        },
      } as never,
      stores: {
        clientAuthFailures: {
          readFailureCount: async () => failureCount,
          recordFailure: async () => ++failureCount,
          clear: async () => {
            failureCount = 0;
          },
        },
      } as never,
    });

    await expect(security.clientAuthRateLimiter.isBlocked("client-a", "127.0.0.1")).resolves.toBe(false);
    await security.clientAuthRateLimiter.recordFailure("client-a", "127.0.0.1");
    await expect(security.clientAuthRateLimiter.isBlocked("client-a", "127.0.0.1")).resolves.toBe(true);
    await expect(security.clientSecretVerifier.verify("client-a", "secret-a")).resolves.toBe(false);
  });
});
