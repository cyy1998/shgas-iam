import type { CustomSsoClientSecretRecord } from "@iam/domain/client";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { createCustomSsoClientSecretVerifier } from "../custom-sso-client-secret-verifier";

const EXISTING_BCRYPT_HASH = "$2b$04$ZwwFh9CSK/owUc7IdLKdFOPiqfxmljguVbVqfGRZq8J9tkkdrcxH2";

const activeIndependentClient: CustomSsoClientSecretRecord = {
  id: 7,
  clientCode: "independent-client",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Independent,
    validRedirectUrls: ["https://client.example/callback"],
    subjectClaimCatalogVersion: 2,
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    callbackEndpoint: "https://client.example/callback",
    logoutEndpoint: "https://client.example/logout",
  },
  customSsoSecretHash: EXISTING_BCRYPT_HASH,
  customSsoConfigVersion: 3,
};

const gatewayConfig: NonNullable<CustomSsoClientSecretRecord["customSsoConfig"]> = {
  mode: CustomSsoClientMode.Gateway,
  validRedirectUrls: ["https://client.example/callback"],
  subjectClaimCatalogVersion: 2,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
  orcas: { enabled: false },
};

describe("Custom SSO client secret verifier", () => {
  test("exposes only the production client authentication seam", () => {
    const verifier = createCustomSsoClientSecretVerifier({
      repository: {
        findSecretRecord: async () => activeIndependentClient,
      },
    });

    expect(Object.keys(verifier)).toEqual(["authenticate"]);
  });

  test("authenticates an active Independent client with its Custom SSO secret", async () => {
    const verifier = createCustomSsoClientSecretVerifier({
      repository: {
        findSecretRecord: async () => activeIndependentClient,
      },
    });

    await expect(
      verifier.authenticate("independent-client", "Wrong123!"),
    ).resolves.toBeNull();
    await expect(
      verifier.authenticate("independent-client", "Existing123!"),
    ).resolves.toEqual({
      clientCode: "independent-client",
      configVersion: 3,
      subjectClaimCatalogVersion: 2,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
    });
    expect(
      JSON.stringify(await verifier.authenticate("independent-client", "Existing123!")),
    ).not.toContain("customSsoSecretHash");
  });

  test("authenticates an Independent client in maintenance before the Traffic Gate decision", async () => {
    const verifier = createCustomSsoClientSecretVerifier({
      repository: {
        findSecretRecord: async () => ({
          ...activeIndependentClient,
          status: ClientStatus.Maintenance,
        }),
      },
    });

    await expect(
      verifier.authenticate("independent-client", "Existing123!"),
    ).resolves.toEqual({
      clientCode: "independent-client",
      configVersion: 3,
      subjectClaimCatalogVersion: 2,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
    });
  });

  test.each([
    ["missing", null],
    ["Gateway", {
      ...activeIndependentClient,
      customSsoConfig: gatewayConfig,
    }],
    ["unconfigured", {
      ...activeIndependentClient,
      customSsoConfig: null,
    }],
    ["Custom SSO disabled", {
      ...activeIndependentClient,
      customSsoEnabled: false,
    }],
    ["globally disabled", {
      ...activeIndependentClient,
      status: ClientStatus.Disable,
    }],
    ["deleted", {
      ...activeIndependentClient,
      isDelete: true,
    }],
    ["record belonging to a different", {
      ...activeIndependentClient,
      clientCode: "other-client",
    }],
  ] satisfies Array<[string, CustomSsoClientSecretRecord | null]>)(
    "rejects a %s client before checking its secret",
    async (_label, record) => {
      const verifier = createCustomSsoClientSecretVerifier({
        repository: {
          findSecretRecord: async () => record,
        },
      });

      await expect(
        verifier.authenticate("independent-client", "Existing123!"),
      ).resolves.toBeNull();
    },
  );
});
