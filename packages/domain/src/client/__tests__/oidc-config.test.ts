import {
  ClientSsoOidcConfigSchema,
  ClientSsoProtocol,
  getClientSsoTokenEndpointAuthMethod,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { OidcAccountDtoSchema, UserDtoSchema } from "../../user";

const publicConfig = {
  protocol: ClientSsoProtocol.Oidc,
  clientType: OidcClientType.Public,
  redirectUris: ["http://app.example.com/callback?from=iam"],
  postLogoutRedirectUris: [],
  allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
};
describe("OIDC configured redirect URI", () => {
  test.each(["http://app.example.com/callback", "https://APP.example.com:443/callback?b=2&a=1"])(
    "accepts exact HTTP/HTTPS URI without normalization: %s",
    (uri) => {
      const parsed = ClientSsoOidcConfigSchema.parse({ ...publicConfig, redirectUris: [uri] });
      expect(parsed.redirectUris).toEqual([uri]);
    },
  );
  test.each([
    "/callback",
    "ftp://app.example.com/callback",
    "https://app.example.com/callback#fragment",
    "https://*.example.com/callback",
    "https://app.example.com/{tenant}/callback",
    " https://app.example.com/callback",
    "https://user:password@app.example.com/callback",
  ])("rejects unsafe redirect URI %s", (uri) => {
    expect(ClientSsoOidcConfigSchema.safeParse({ ...publicConfig, redirectUris: [uri] }).success).toBe(false);
  });
  test("accepts both client types and derives their authentication method", () => {
    const publicClient = ClientSsoOidcConfigSchema.parse(publicConfig);
    const confidential = ClientSsoOidcConfigSchema.parse({
      ...publicConfig,
      clientType: OidcClientType.Confidential,
    });
    expect(getClientSsoTokenEndpointAuthMethod(publicClient)).toBe(OidcTokenEndpointAuthMethod.None);
    expect(getClientSsoTokenEndpointAuthMethod(confidential)).toBe(
      OidcTokenEndpointAuthMethod.ClientSecretBasic,
    );
  });
  test("rejects missing openid, duplicate redirects and duplicate scopes", () => {
    for (const config of [
      { ...publicConfig, allowedScopes: [OidcScope.Profile] },
      { ...publicConfig, redirectUris: [publicConfig.redirectUris[0], publicConfig.redirectUris[0]] },
      { ...publicConfig, allowedScopes: [OidcScope.OpenId, OidcScope.OpenId] },
    ])
      expect(ClientSsoOidcConfigSchema.safeParse(config).success).toBe(false);
  });
});
test("user and protocol account DTOs preserve their existing subject identifier boundary", () => {
  expect("subjectIdentifier" in UserDtoSchema.shape).toBe(false);
  expect("subjectIdentifier" in OidcAccountDtoSchema.shape).toBe(true);
});
