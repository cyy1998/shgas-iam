import { describe, expect, test } from "bun:test";
import {
  ClientProtocolCutoverManifestSchema,
  clientProtocolCutoverTargets,
} from "../protocol-cutover-manifest";

describe("Client Protocol cutover manifest", () => {
  test("requires an explicit Catalog V2 target and owner decision for every Custom SSO client", () => {
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: { expectedEpoch: 7, ownerStatus: "pending" },
      }],
    });

    expect(manifest.clients[0]).toEqual({
      clientCode: "portal",
      customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
      oidc: { expectedEpoch: 7, ownerStatus: "pending" },
    });
    expect(ClientProtocolCutoverManifestSchema.safeParse({
      version: 2,
      clients: [manifest.clients[0], manifest.clients[0]],
    }).success).toBe(false);
    expect(ClientProtocolCutoverManifestSchema.safeParse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
        oidc: null,
      }],
    }).success).toBe(false);
    expect(ClientProtocolCutoverManifestSchema.safeParse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 1 },
        oidc: null,
      }],
    }).success).toBe(false);
  });

  test("projects configured protocol targets with owner confirmation once", () => {
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: { expectedEpoch: 7, ownerStatus: "pending" },
      }],
    });

    expect(clientProtocolCutoverTargets(manifest)).toEqual([{
      clientCode: "portal",
      protocol: "custom-sso",
      expectedEpoch: 3,
      ownerConfirmed: true,
      targetCatalogVersion: 2,
    }, {
      clientCode: "portal",
      protocol: "oidc",
      expectedEpoch: 7,
      ownerConfirmed: false,
    }]);
  });
});
