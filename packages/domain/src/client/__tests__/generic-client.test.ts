import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  SubjectClaim,
} from "@iam/contracts";
import { expect, test } from "bun:test";
import { toGenericClientRuntimeDto } from "../schema";

test("generic Client runtime exposes only the protocol-neutral storage projection", () => {
  const runtime = toGenericClientRuntimeDto({
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "general-secret",
    url: null,
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00.000Z"),
    updateTime: new Date("2026-01-01T00:00:00.000Z"),
    extAttributes: {
      managementLevel: "Gateway",
      requireOrcas: true,
    },
    oidcEnabled: true,
    oidcConfig: {
      clientType: OidcClientType.Public,
      redirectUris: ["https://oidc.example.com/callback"],
      postLogoutRedirectUris: [],
      allowedScopes: [OidcScope.OpenId],
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
    },
    oidcSecretHash: null,
    oidcConfigVersion: 2,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      validRedirectUrls: ["https://portal.example.com/*"],
      subjectClaimCatalogVersion: 2,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      orcas: { enabled: false },
    },
    customSsoSecretHash: null,
    customSsoConfigVersion: 3,
  });

  expect(runtime).toEqual({
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "general-secret",
    url: null,
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00.000Z"),
    updateTime: new Date("2026-01-01T00:00:00.000Z"),
    extAttributes: {},
  });
});
