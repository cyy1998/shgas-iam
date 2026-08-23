import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { describe, expect, it, vi } from "vitest";
import { createClientProtocolArtifactCleanup } from "../../src/commands/client-protocol-artifact-cleanup.ts";

const manifest: ClientProtocolCutoverManifest = {
  version: 2,
  clients: [{
    clientCode: "portal",
    customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
    oidc: { expectedEpoch: 7, ownerStatus: "confirmed" },
  }],
};

describe("client Protocol artifact cleanup", () => {
  it("dry-run inventories without mutation and apply verifies exact cleanup", async () => {
    const totals = new Map<string, number>([["custom-sso", 1], ["oidc", 2]]);
    let rawTotal = 3;
    let pendingProviderSessionBindings = 1;
    const revokeClientProtocol = vi.fn(async (_clientCode: string, protocol: string) => {
      totals.set(protocol, 0);
      return { cleanup: { failed: 0 } };
    });
    const revokeClient = vi.fn(async () => {
      rawTotal = 0;
    });
    const cleanup = createClientProtocolArtifactCleanup({
      kernel: {
        inventoryClientProtocol: async (_clientCode, protocol) => ({
          counts: {
            bindings: 0,
            credentials: 0,
            artifacts: totals.get(protocol) ?? 0,
            cleanupPending: 0,
            invalid: 0,
            stale: 0,
            total: totals.get(protocol) ?? 0,
          },
        }),
        revokeClientProtocol,
      },
      protocolObjects: {
        inspectClient: async () => ({
          counts: { total: rawTotal, invalid: 0, stale: 0, byModel: { AccessToken: rawTotal } },
        }),
        revokeClient,
      },
      providerSessionBindings: {
        inventoryClientStagedBindings: async () => ({
          counts: {
            bindings: pendingProviderSessionBindings,
            invalid: 0,
            stale: 0,
            total: pendingProviderSessionBindings,
          },
        }),
        revokeClientStagedBindings: async () => {
          pendingProviderSessionBindings = 0;
        },
      },
    });

    const dryRun = await cleanup.dryRun(manifest);
    expect(dryRun.status).toBe("passed");
    expect(dryRun.counts).toMatchObject({
      kernelObjects: 3,
      protocolObjects: 3,
      providerSessionBindings: 1,
    });
    expect(revokeClientProtocol).not.toHaveBeenCalled();

    const applied = await cleanup.apply(manifest);
    expect(applied.status).toBe("passed");
    expect(applied.counts).toMatchObject({ kernelObjects: 0, protocolObjects: 0 });
    expect(revokeClientProtocol).toHaveBeenCalledTimes(2);
    expect(revokeClient).toHaveBeenCalledTimes(1);
  });

  it("does not report success when a Kernel owner cleanup fails", async () => {
    const cleanup = createClientProtocolArtifactCleanup({
      kernel: {
        inventoryClientProtocol: async () => ({
          counts: {
            bindings: 0,
            credentials: 0,
            artifacts: 1,
            cleanupPending: 0,
            invalid: 0,
            stale: 0,
            total: 1,
          },
        }),
        revokeClientProtocol: async () => ({ cleanup: { failed: 1 } }),
      },
      protocolObjects: {
        inspectClient: async () => ({ counts: { total: 0, invalid: 0, stale: 0, byModel: {} } }),
        revokeClient: async () => {},
      },
      providerSessionBindings: {
        inventoryClientStagedBindings: async () => ({
          counts: { bindings: 0, invalid: 0, stale: 0, total: 0 },
        }),
        revokeClientStagedBindings: async () => {},
      },
    });

    const report = await cleanup.apply({
      ...manifest,
      clients: [{ ...manifest.clients[0]!, oidc: null }],
    });
    expect(report.status).toBe("failed");
    expect(report.failures).toContainEqual({
      clientCode: "portal",
      protocol: "custom-sso",
      reason: "cleanup-failed",
    });
  });

  it("keeps failed Kernel cleanup visible to verify and completes a forward apply", async () => {
    let activeArtifacts = 1;
    let cleanupPending = 0;
    let cleanupShouldFail = true;
    const cleanup = createClientProtocolArtifactCleanup({
      kernel: {
        inventoryClientProtocol: async () => ({
          counts: {
            artifacts: activeArtifacts,
            bindings: 0,
            cleanupPending,
            credentials: 0,
            invalid: 0,
            stale: 0,
            total: activeArtifacts + cleanupPending,
          },
        }),
        revokeClientProtocol: async () => {
          if (activeArtifacts > 0) {
            activeArtifacts = 0;
            cleanupPending = 1;
          }
          if (cleanupShouldFail)
            return { cleanup: { failed: 1 } };
          cleanupPending = 0;
          return { cleanup: { failed: 0 } };
        },
      },
      protocolObjects: {
        inspectClient: async () => ({ counts: { total: 0, invalid: 0, stale: 0, byModel: {} } }),
        revokeClient: async () => {},
      },
      providerSessionBindings: {
        inventoryClientStagedBindings: async () => ({
          counts: { bindings: 0, invalid: 0, stale: 0, total: 0 },
        }),
        revokeClientStagedBindings: async () => {},
      },
    });
    const customSsoOnlyManifest = {
      ...manifest,
      clients: [{ ...manifest.clients[0]!, oidc: null }],
    };

    expect((await cleanup.apply(customSsoOnlyManifest)).status).toBe("failed");
    expect(await cleanup.verify(customSsoOnlyManifest)).toMatchObject({
      status: "failed",
      counts: { kernelObjects: 1 },
    });

    cleanupShouldFail = false;
    expect((await cleanup.apply(customSsoOnlyManifest)).status).toBe("passed");
    expect((await cleanup.verify(customSsoOnlyManifest)).status).toBe("passed");
  });
});
