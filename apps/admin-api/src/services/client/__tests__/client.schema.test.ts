import {
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { GenericClientRuntimeDtoSchema } from "@iam/domain/client";
import { describe, expect, test } from "bun:test";
import {
  AdminClientRecordSchema,
  ClientCreateDtoSchema,
  ClientCustomSsoConfigureDtoSchema,
  ClientInputDtoSchema,
  ClientOidcConfigureDtoSchema,
  ClientPaginationQueryDtoSchema,
  ClientUpdateDtoSchema,
} from "../client.schema";

describe("client update contracts", () => {
  test.each([
    "_legacy",
    "legacy:client",
    "中文客户端",
    "legacy/client",
  ])("preserves the existing Client Code value space for %s", (clientCode) => {
    expect(ClientCreateDtoSchema.safeParse({
      clientCode,
      clientName: "Legacy Client",
      clientSecret: "general-secret",
    }).success).toBe(true);
    expect(ClientInputDtoSchema.safeParse({
      id: 1,
      clientCode,
    }).success).toBe(true);
  });

  test.each(["", "a".repeat(65)])(
    "rejects an out-of-range Client Code",
    (clientCode) => {
      expect(ClientCreateDtoSchema.safeParse({
        clientCode,
        clientName: "Invalid Client",
        clientSecret: "general-secret",
      }).success).toBe(false);
    },
  );

  test("parses empty extAttributes and rejects unknown attributes at both record boundaries", () => {
    for (const schema of [
      AdminClientRecordSchema.shape.extAttributes,
      GenericClientRuntimeDtoSchema.shape.extAttributes,
    ]) {
      expect(schema.parse({})).toEqual({});
      expect(schema.safeParse({ unexpectedAttribute: "value" }).success).toBe(false);
    }
  });

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

  test("rejects managed Custom SSO fields and unknown extAttributes in generic inputs", () => {
    for (const field of [
      "customSsoEnabled",
      "customSsoConfig",
      "customSsoSecretHash",
      "customSsoConfigVersion",
    ]) {
      expect(ClientUpdateDtoSchema.safeParse({ [field]: null }).success).toBe(false);
      expect(ClientInputDtoSchema.safeParse({
        id: 1,
        clientCode: "portal",
        [field]: null,
      }).success).toBe(false);
    }

    expect(ClientUpdateDtoSchema.safeParse({
      extAttributes: { unexpectedAttribute: "value" },
    }).success).toBe(false);

    expect(ClientCreateDtoSchema.safeParse({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "general-secret",
    })).toMatchObject({
      success: true,
      data: { extAttributes: {} },
    });
  });

  test("accepts only strict mode-specific Custom SSO config with safe redirect patterns and claims", () => {
    const common = {
      validRedirectUrls: ["https://portal.example.com/sso/*"],
      subjectClaims: ["subjectIdentifier", "profile:name"],
    };
    expect(ClientCustomSsoConfigureDtoSchema.safeParse({
      ...common,
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
    }).success).toBe(true);
    expect(ClientCustomSsoConfigureDtoSchema.safeParse({
      ...common,
      mode: CustomSsoClientMode.Independent,
      callbackEndpoint: "https://portal.example.com/callback",
      logoutEndpoint: "https://portal.example.com/logout",
    }).success).toBe(true);
    expect(ClientCustomSsoConfigureDtoSchema.safeParse({
      ...common,
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
      callbackEndpoint: "https://portal.example.com/callback",
    }).success).toBe(false);
    expect(ClientCustomSsoConfigureDtoSchema.safeParse({
      ...common,
      validRedirectUrls: ["*"],
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
    }).success).toBe(false);
    expect(ClientCustomSsoConfigureDtoSchema.safeParse({
      ...common,
      subjectClaims: ["profile:name"],
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
    }).success).toBe(false);
    for (const subjectClaimCatalogVersion of [1, 2]) {
      expect(ClientCustomSsoConfigureDtoSchema.safeParse({
        ...common,
        subjectClaimCatalogVersion,
        mode: CustomSsoClientMode.Gateway,
        orcas: { enabled: true },
      }).success).toBe(false);
    }
  });

  test("supports structured Custom SSO state and mode filters", () => {
    const query = {
      pageNum: 1,
      pageSize: 10,
      conditions: {
        fuzzyConditions: {},
        exactConditions: {
          customSsoStates: [CustomSsoClientState.Enabled],
          customSsoModes: [CustomSsoClientMode.Independent],
        },
      },
    };
    expect(ClientPaginationQueryDtoSchema.safeParse(query).success).toBe(true);
  });
});
