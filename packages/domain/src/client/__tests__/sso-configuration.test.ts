import type { ClientSsoConfig } from "@iam/contracts";
import {
  ClientSsoCallbackType,
  ClientSsoConfigSchema,
  ClientSsoProtocol,
  ClientStatus,
  getClientSsoTokenEndpointAuthMethod,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { expect, test } from "bun:test";
import { toClientAdminDetailDto, toClientAdminListDto, toGenericClientRuntimeDto } from "../schema";
import { normalizeClientSsoConfig } from "../sso-configuration";
import { toClientSsoAdminDto, toClientSsoRuntimeDto } from "../sso-schema";

const oidc = {
  protocol: ClientSsoProtocol.Oidc,
  clientType: OidcClientType.Public,
  redirectUris: ["https://rp.example/cb"],
  postLogoutRedirectUris: [],
  allowedScopes: [OidcScope.OpenId],
} satisfies ClientSsoConfig;
const custom = {
  protocol: ClientSsoProtocol.CustomSso,
  callbackType: ClientSsoCallbackType.Business,
  callbackEndpoint: "https://rp.example/cb",
  validRedirectUrls: ["https://rp.example/*"],
  subjectClaims: ["subjectIdentifier"],
} satisfies ClientSsoConfig;

const managed = { protocol: custom.protocol, callbackType: ClientSsoCallbackType.Managed, validRedirectUrls: custom.validRedirectUrls, subjectClaims: custom.subjectClaims } satisfies ClientSsoConfig;

test("strict single protocol configuration derives authentication and rejects mixed/retired fields", () => {
  expect(ClientSsoConfigSchema.parse(oidc)).toEqual(oidc);
  expect(ClientSsoConfigSchema.parse(custom)).toEqual(custom);
  expect(ClientSsoConfigSchema.parse({ ...managed, orcas: { enabled: true } })).toEqual({
    ...managed,
    orcas: { enabled: true },
  });
  expect(normalizeClientSsoConfig(managed)).toEqual(managed);
  expect(getClientSsoTokenEndpointAuthMethod(oidc)).toBe(OidcTokenEndpointAuthMethod.None);
  expect(
    getClientSsoTokenEndpointAuthMethod({
      ...oidc,
      clientType: OidcClientType.Confidential,
    }),
  ).toBe(OidcTokenEndpointAuthMethod.ClientSecretBasic);
  for (const value of [
    { ...oidc, tokenEndpointAuthMethod: "none" },
    { ...oidc, callbackEndpoint: custom.callbackEndpoint },
    { ...oidc, allowedScopes: [OidcScope.Profile] },
    { ...oidc, redirectUris: ["https://rp.example/*"] },
    { ...custom, mode: "gateway" },
    { ...custom, logoutEndpoint: "https://rp.example/logout" },
    { ...custom, callbackEndpoint: ["https://rp.example/cb"] },
    { ...custom, subjectClaims: [] },
    { ...custom, subjectClaims: ["profile:name"] },
    { ...custom, subjectClaims: ["subjectIdentifier", "subjectIdentifier"] },
    { ...custom, orcas: { enabled: true, url: "https://untrusted.example" } },
  ])
    expect(ClientSsoConfigSchema.safeParse(value).success).toBe(false);
  expect(() => normalizeClientSsoConfig({ ...custom, validRedirectUrls: ["*"] } as never)).toThrow();
  const config = ClientSsoConfigSchema.parse({
    ...custom,
    orcas: { enabled: false },
  });
  expect(normalizeClientSsoConfig(config)).toEqual(custom);
});

test("actual ordinary Client mappers remove current plaintext and credential identity", () => {
  const row = {
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "internal-only",
    url: null,
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date(),
    updateTime: new Date(),
    extAttributes: { ssoSecret: "nested-secret" },
    ssoConfig: oidc,
    ssoEnabled: true,
    hasSsoSecret: true,
    ssoSecret: "CURRENT-SECRET-SENTINEL",
    ssoCredentialId: "eb1aab79-3f8a-4313-a993-bb6c6808ddc9",
    ssoSecretUpdatedAt: new Date().toISOString(),
    futureSensitiveColumn: "FUTURE-SECRET-SENTINEL",
  };
  for (const mapper of [
    toClientAdminDetailDto,
    toClientAdminListDto,
    toGenericClientRuntimeDto,
    toClientSsoAdminDto,
    toClientSsoRuntimeDto,
  ]) {
    const result = mapper(row);
    expect(Object.keys(result)).not.toContain("ssoSecret");
    expect(Object.keys(result)).not.toContain("ssoCredentialId");
    expect(Object.keys(result)).not.toContain("ssoSecretUpdatedAt");
    expect(Object.keys(result)).not.toContain("futureSensitiveColumn");
    expect(JSON.stringify(result)).not.toContain("SECRET-SENTINEL");
  }
  expect(toClientSsoRuntimeDto(row)).toEqual({
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    status: ClientStatus.Enable,
    isDelete: false,
    ssoConfig: oidc,
    ssoEnabled: true,
  });
  expect(toClientSsoAdminDto(row)).toEqual({
    ...toClientSsoRuntimeDto(row),
    url: null,
    description: null,
    hasSsoSecret: true,
  });
});
