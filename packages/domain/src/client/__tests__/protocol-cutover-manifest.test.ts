import { describe, expect, test } from "bun:test";
import {
  ClientProtocolCutoverManifestSchema,
  clientProtocolCutoverTargets,
} from "../protocol-cutover-manifest";

describe("Client Protocol cutover manifest", () => {
  test("requires an explicit owner decision without persisting a Catalog target", () => {
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
        oidc: { expectedEpoch: 7, ownerStatus: "pending" },
      }],
    });

    expect(manifest.clients[0]).toEqual({
      clientCode: "portal",
      customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
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
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: null,
      }],
    }).success).toBe(false);
  });

  test("projects configured protocol targets with owner confirmation once", () => {
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
        oidc: { expectedEpoch: 7, ownerStatus: "pending" },
      }],
    });

    expect(clientProtocolCutoverTargets(manifest)).toEqual([{
      clientCode: "portal",
      protocol: "custom-sso",
      expectedEpoch: 3,
      ownerConfirmed: true,
    }, {
      clientCode: "portal",
      protocol: "oidc",
      expectedEpoch: 7,
      ownerConfirmed: false,
    }]);
  });
});
