import {
  ClientStatus,
  CustomSsoClientMode,
  CustomSsoClientState,
} from "@iam/contracts";
import {
  customSsoClientConfigSchema,
  customSsoClientStorageStateSchema,
} from "@iam/db/schema";
import { describe, expect, test } from "bun:test";
import {
  CustomSsoClientRuntimeDtoSchema,
  CustomSsoClientSecretRecordSchema,
  getCustomSsoClientState,
  toClientAdminDetailDto,
} from "../schema";

const commonConfig = {
  validRedirectUrls: ["https://portal.example.com/sso/*"],
  subjectClaims: ["subjectIdentifier", "profile:name"] as const,
};

describe("Custom SSO client configuration", () => {
  test("keeps strict mode fields and secret storage independent from other protocols", () => {
    const gateway = {
      ...commonConfig,
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: true },
    };
    const independent = {
      ...commonConfig,
      mode: CustomSsoClientMode.Independent,
      callbackEndpoint: "https://portal.example.com/sso/callback",
      logoutEndpoint: "https://portal.example.com/logout",
    };

    expect(customSsoClientConfigSchema.safeParse(gateway).success).toBe(true);
    expect(customSsoClientConfigSchema.safeParse(independent).success).toBe(true);
    expect(customSsoClientConfigSchema.safeParse({
      ...gateway,
      subjectClaimCatalogVersion: 2,
    }).success).toBe(false);
    expect(customSsoClientConfigSchema.safeParse({
      ...gateway,
      callbackEndpoint: independent.callbackEndpoint,
    }).success).toBe(false);
    expect(customSsoClientConfigSchema.safeParse({
      ...independent,
      orcas: { enabled: true },
    }).success).toBe(false);
    expect(customSsoClientStorageStateSchema.safeParse({
      customSsoEnabled: false,
      customSsoConfig: independent,
      customSsoSecretHash: "hashed-secret",
    }).success).toBe(true);
    expect(customSsoClientStorageStateSchema.safeParse({
      customSsoEnabled: false,
      customSsoConfig: gateway,
      customSsoSecretHash: "hashed-secret",
    }).success).toBe(false);

    expect(getCustomSsoClientState({
      customSsoEnabled: false,
      customSsoConfig: null,
    })).toBe(CustomSsoClientState.Unconfigured);
    expect("clientSecret" in CustomSsoClientRuntimeDtoSchema.shape).toBe(false);
    expect("oidcConfig" in CustomSsoClientRuntimeDtoSchema.shape).toBe(false);
    expect("oidcSecretHash" in CustomSsoClientSecretRecordSchema.shape).toBe(false);
    expect("clientSecret" in CustomSsoClientSecretRecordSchema.shape).toBe(false);
  });

  test("redacts staged legacy Custom SSO extAttributes from Admin detail", () => {
    const detail = toClientAdminDetailDto({
      id: 1,
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "legacy-general-secret",
      url: null,
      status: ClientStatus.Enable,
      description: null,
      isDelete: false,
      createTime: new Date("2026-01-01T00:00:00Z"),
      updateTime: new Date("2026-01-01T00:00:00Z"),
      extAttributes: {
        managementLevel: "Gateway",
        validRedirectUrls: ["https://legacy.example.com/*"],
      },
      oidcEnabled: false,
      oidcConfig: null,
      oidcSecretHash: null,
      oidcConfigVersion: 0,
      customSsoEnabled: false,
      customSsoConfig: null,
      customSsoSecretHash: null,
      customSsoConfigVersion: 0,
    });

    expect(detail.extAttributes).toEqual({});
    expect(JSON.stringify(detail)).not.toContain("legacy.example.com");
  });
});
