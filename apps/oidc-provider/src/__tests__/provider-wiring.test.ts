import type Provider from "oidc-provider";
import { describe, expect, it } from "vitest";
import { registerClientAuthentication } from "../provider/client-auth.ts";
import { registerProtocolModelPayloadExtensions } from "../provider/protocol-models.ts";

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

  it("adds global session expiry to authorization code payloads without mutating the original list", () => {
    class AuthorizationCode {}
    Object.defineProperty(AuthorizationCode, "IN_PAYLOAD", {
      configurable: true,
      value: ["foo"],
    });
    const provider = { AuthorizationCode } as unknown as Provider;

    registerProtocolModelPayloadExtensions(provider);

    const authorizationCodeModel = provider.AuthorizationCode as unknown as typeof AuthorizationCode & {
      IN_PAYLOAD: string[];
    };

    expect(authorizationCodeModel.IN_PAYLOAD).toEqual([
      "foo",
      "globalSessionExpiresAt",
    ]);
    expect(authorizationCodeModel.IN_PAYLOAD).not.toBe(authorizationCodeModel.IN_PAYLOAD);
  });
});
