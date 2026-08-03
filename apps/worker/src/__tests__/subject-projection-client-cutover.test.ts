import type { CustomSsoClientConfig } from "@iam/db/schema";
import type { SubjectProjectionCutoverClientRecord } from "../commands/subject-projection-client-cutover";
import { CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectProjectionClientCutover,
} from "../commands/subject-projection-client-cutover";
import { SubjectProjectionCutoverManifestSchema } from "../commands/subject-projection-cutover.manifest";

const gatewayConfig: CustomSsoClientConfig = {
  mode: CustomSsoClientMode.Gateway,
  validRedirectUrls: ["https://gateway.example.com/sso/*"],
  subjectClaimCatalogVersion: 1 as const,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
  orcas: { enabled: false },
};
const independentConfig: CustomSsoClientConfig = {
  mode: CustomSsoClientMode.Independent,
  validRedirectUrls: ["https://app.example.com/callback"],
  subjectClaimCatalogVersion: 1 as const,
  subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
  callbackEndpoint: "https://app.example.com/callback",
  logoutEndpoint: "https://app.example.com/logout",
};

function manifest(secretStatus: "confirmed" | "pending" = "pending") {
  return SubjectProjectionCutoverManifestSchema.parse({
    version: 1,
    cutoverId: "custom-sso-subject-projection-v1",
    clients: [{
      clientCode: "gateway",
      targetEnabled: true,
      config: gatewayConfig,
      secretDelivery: { status: "not-required" },
    }, {
      clientCode: "independent",
      targetEnabled: true,
      config: independentConfig,
      secretDelivery: { status: secretStatus },
    }],
  });
}

describe("Subject Projection client cutover", () => {
  test("generates an Independent secret once and keeps the client disabled until delivery is confirmed", async () => {
    let records: SubjectProjectionCutoverClientRecord[] = [
      unconfiguredClient("gateway"),
      unconfiguredClient("independent"),
    ];
    const applyUpdates = mock(async (updates: typeof records) => {
      records = updates;
    });
    const generate = mock(() => "iam_sso_one_time_secret");
    const hash = mock(async (secret: string) => `hash:${secret}`);
    const cutover = createSubjectProjectionClientCutover({
      clients: {
        async readInventory() {
          return {
            legacyEnabledClientCodes: ["gateway", "independent"],
            records,
          };
        },
        applyUpdates,
      },
      secrets: { generate, hash },
    });

    const first = await cutover.applyManifest(manifest());
    expect(first.generatedSecrets).toEqual([{
      clientCode: "independent",
      secret: "iam_sso_one_time_secret",
    }]);
    expect(records).toEqual([{
      ...unconfiguredClient("gateway"),
      customSsoEnabled: true,
      customSsoConfig: gatewayConfig,
      customSsoConfigVersion: 1,
    }, {
      ...unconfiguredClient("independent"),
      customSsoConfig: independentConfig,
      customSsoSecretHash: "hash:iam_sso_one_time_secret",
      customSsoConfigVersion: 1,
    }]);
    expect(first.blockers).toEqual([{
      clientCode: "independent",
      reason: "secret-delivery-unconfirmed",
    }]);

    const retry = await cutover.applyManifest(manifest());
    expect(retry.generatedSecrets).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledTimes(1);

    const confirmed = await cutover.applyManifest(manifest("confirmed"));
    expect(confirmed.generatedSecrets).toEqual([]);
    expect(confirmed.blockers).toEqual([]);
    expect(records[1]).toMatchObject({
      customSsoEnabled: true,
      customSsoConfigVersion: 2,
      customSsoSecretHash: "hash:iam_sso_one_time_secret",
    });
  });

  test("refuses a manifest that omits an enabled legacy client before applying any mutation", async () => {
    const applyUpdates = mock(async () => {});
    const cutover = createSubjectProjectionClientCutover({
      clients: {
        async readInventory() {
          return {
            legacyEnabledClientCodes: ["gateway", "missing-client"],
            records: [unconfiguredClient("gateway")],
          };
        },
        applyUpdates,
      },
      secrets: {
        generate: mock(() => "must-not-generate"),
        hash: mock(async () => "must-not-hash"),
      },
    });
    const incomplete = SubjectProjectionCutoverManifestSchema.parse({
      ...manifest(),
      clients: manifest().clients.filter(client => client.clientCode === "gateway"),
    });

    await expect(cutover.applyManifest(incomplete)).rejects.toThrow(
      "manifest does not cover enabled legacy Custom SSO clients: missing-client",
    );
    expect(applyUpdates).not.toHaveBeenCalled();
  });

  test("refuses delivery confirmation before the Independent secret exists", async () => {
    const applyUpdates = mock(async (_updates: SubjectProjectionCutoverClientRecord[]) => {});
    const generate = mock(() => "must-not-generate");
    const hash = mock(async () => "must-not-hash");
    const cutover = createSubjectProjectionClientCutover({
      clients: {
        async readInventory() {
          return {
            legacyEnabledClientCodes: ["gateway", "independent"],
            records: [
              unconfiguredClient("gateway"),
              unconfiguredClient("independent"),
            ],
          };
        },
        applyUpdates,
      },
      secrets: { generate, hash },
    });

    await expect(cutover.applyManifest(manifest("confirmed"))).rejects.toThrow(
      "Independent client secret cannot be confirmed before it is generated: independent",
    );
    expect(generate).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(applyUpdates).not.toHaveBeenCalled();
  });

  test("verifies manifest state without generating secrets or applying mutations", async () => {
    const applyUpdates = mock(async (_updates: SubjectProjectionCutoverClientRecord[]) => {});
    const generate = mock(() => "must-not-generate");
    const hash = mock(async () => "must-not-hash");
    const cutover = createSubjectProjectionClientCutover({
      clients: {
        async readInventory() {
          return {
            legacyEnabledClientCodes: ["gateway", "independent"],
            records: [{
              ...unconfiguredClient("gateway"),
              customSsoConfig: gatewayConfig,
              customSsoEnabled: true,
              customSsoConfigVersion: 1,
            }, {
              ...unconfiguredClient("independent"),
              customSsoConfig: independentConfig,
              customSsoSecretHash: "hash:delivered",
              customSsoConfigVersion: 1,
            }],
          };
        },
        applyUpdates,
      },
      secrets: { generate, hash },
    });

    await expect(cutover.verifyManifest(manifest())).resolves.toEqual({
      failures: [{
        clientCode: "independent",
        reason: "secret-delivery-unconfirmed",
      }, {
        clientCode: "independent",
        reason: "enabled-state-mismatch",
      }],
    });
    expect(generate).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(applyUpdates).not.toHaveBeenCalled();
  });

  test("removes legacy Custom SSO attributes even when the new client configuration is already current", async () => {
    const record = {
      ...unconfiguredClient("gateway"),
      customSsoEnabled: true,
      customSsoConfig: gatewayConfig,
      customSsoConfigVersion: 1,
      legacyCustomSsoAttributesPresent: true,
    };
    const applyUpdates = mock(async () => {});
    const cutover = createSubjectProjectionClientCutover({
      clients: {
        async readInventory() {
          return {
            legacyEnabledClientCodes: ["gateway"],
            records: [record],
          };
        },
        applyUpdates,
      },
      secrets: {
        generate: mock(() => "must-not-generate"),
        hash: mock(async () => "must-not-hash"),
      },
    });
    const gatewayOnlyManifest = SubjectProjectionCutoverManifestSchema.parse({
      ...manifest(),
      clients: manifest().clients.filter(client => client.clientCode === "gateway"),
    });

    await cutover.applyManifest(gatewayOnlyManifest);

    expect(applyUpdates).toHaveBeenCalledWith([{
      ...record,
      legacyCustomSsoAttributesPresent: false,
    }]);
    await expect(cutover.verifyManifest(gatewayOnlyManifest)).resolves.toEqual({
      failures: [{
        clientCode: "gateway",
        reason: "legacy-attributes-not-removed",
      }],
    });
  });
});

function unconfiguredClient(clientCode: string): SubjectProjectionCutoverClientRecord {
  return {
    clientCode,
    customSsoEnabled: false,
    customSsoConfig: null,
    customSsoSecretHash: null,
    customSsoConfigVersion: 0,
    legacyCustomSsoAttributesPresent: false,
  };
}
