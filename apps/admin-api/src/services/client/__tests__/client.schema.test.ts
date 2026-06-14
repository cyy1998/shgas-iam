import { OidcClientType, OidcScope, OidcTokenEndpointAuthMethod } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { ClientInputDtoSchema, ClientOidcConfigureDtoSchema, ClientUpdateDtoSchema } from "../client.schema";

describe("client update contracts", () => {
  test("rejects clientCode in the current REST/tRPC update contract", () => {
    const result = ClientUpdateDtoSchema.safeParse({ clientCode: "renamed-client" });

    expect(result.success).toBe(false);
  });

  test("keeps clientCode in the legacy update contract for explicit immutability validation", () => {
    const result = ClientInputDtoSchema.safeParse({ id: 1, clientCode: "renamed-client" });

    expect(result.success).toBe(true);
  });

  test("ignores administrator-supplied OIDC secret fields", () => {
    const result = ClientOidcConfigureDtoSchema.safeParse({
      clientType: OidcClientType.Public,
      redirectUris: ["https://portal.example.com/callback"],
      postLogoutRedirectUris: [],
      allowedScopes: [OidcScope.OpenId],
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
      clientSecret: "administrator-controlled-secret",
    });

    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).not.toHaveProperty("clientSecret");
  });
});
