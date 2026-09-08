import {
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import {
  oidcClientConfigSchema,
  oidcClientSecretStateSchema,
  oidcRedirectUriSchema,
} from "@iam/db/schema";
import { describe, expect, test } from "bun:test";
import { OidcAccountDtoSchema, UserDtoSchema } from "../../user";
import { OidcClientRuntimeDtoSchema } from "../schema";

const publicConfig = {
  clientType: OidcClientType.Public,
  redirectUris: ["http://app.example.com/callback?from=iam"],
  postLogoutRedirectUris: [],
  allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
  tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
};

describe("OIDC redirect URI validation", () => {
  test.each([
    "http://app.example.com/callback",
    "https://APP.example.com:443/callback?b=2&a=1",
  ])("accepts absolute HTTP/HTTPS URI without normalization: %s", (uri) => {
    expect(oidcRedirectUriSchema.safeParse(uri).success).toBe(true);
  });

  test.each([
    "/callback",
    "ftp://app.example.com/callback",
    "https://app.example.com/callback#fragment",
    "https://*.example.com/callback",
    "https://app.example.com/{tenant}/callback",
    " https://app.example.com/callback",
  ])("rejects unsafe redirect URI: %s", (uri) => {
    expect(oidcRedirectUriSchema.safeParse(uri).success).toBe(false);
  });
});

describe("OIDC client config validation", () => {
  test("accepts public and confidential discriminants", () => {
    expect(oidcClientConfigSchema.safeParse(publicConfig).success).toBe(true);
    expect(oidcClientConfigSchema.safeParse({
      ...publicConfig,
      allowedScopes: [OidcScope.OpenId, OidcScope.IamEmployments],
    }).success).toBe(true);
    expect(oidcClientConfigSchema.safeParse({
      ...publicConfig,
      clientType: OidcClientType.Confidential,
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
    }).success).toBe(true);
  });

  test("rejects auth method mismatch, missing openid, and duplicate URI", () => {
    expect(oidcClientConfigSchema.safeParse({
      ...publicConfig,
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
    }).success).toBe(false);
    expect(oidcClientConfigSchema.safeParse({
      ...publicConfig,
      allowedScopes: [OidcScope.Profile],
    }).success).toBe(false);
    expect(oidcClientConfigSchema.safeParse({
      ...publicConfig,
      redirectUris: [publicConfig.redirectUris[0], publicConfig.redirectUris[0]],
    }).success).toBe(false);
  });

  test("enforces secret state for public and confidential clients", () => {
    expect(oidcClientSecretStateSchema.safeParse({
      oidcConfig: publicConfig,
      oidcSecretHash: null,
    }).success).toBe(true);
    expect(oidcClientSecretStateSchema.safeParse({
      oidcConfig: publicConfig,
      oidcSecretHash: "hash",
    }).success).toBe(false);
    expect(oidcClientSecretStateSchema.safeParse({
      oidcConfig: {
        ...publicConfig,
        clientType: OidcClientType.Confidential,
        tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
      },
      oidcSecretHash: "hash",
    }).success).toBe(true);
  });
});

describe("OIDC DTO boundaries", () => {
  test("keeps protocol-neutral Subject Identifiers out of common DTOs", () => {
    expect("oidcSecretHash" in OidcClientRuntimeDtoSchema.shape).toBe(false);
    expect("subjectIdentifier" in UserDtoSchema.shape).toBe(false);
    expect("subjectIdentifier" in OidcAccountDtoSchema.shape).toBe(true);
  });
});
