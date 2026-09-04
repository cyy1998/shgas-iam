import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { AfterCommitRequiredTaskError, createImmediateUnitOfWork } from "@iam/api-core/uow";
import { createClientProtocolEpochCutover } from "@worker/commands/client-protocol-epoch-cutover";
import { describe, expect, mock, test } from "bun:test";

const manifest: ClientProtocolCutoverManifest = {
  version: 2,
  clients: [{
    clientCode: "portal",
    customSso: { expectedEpoch: 3, ownerStatus: "confirmed" },
    oidc: { expectedEpoch: 7, ownerStatus: "confirmed" },
  }],
};

describe("Client Protocol epoch cutover", () => {
  test("refuses to invent owner confirmation or mutate an incomplete checklist", async () => {
    const advanceEpochs = mock(async () => []);
    const invalidateClient = mock(async () => undefined);
    const cutover = createClientProtocolEpochCutover({
      runtimeSnapshot: { invalidateClient },
      uow: createImmediateUnitOfWork({ clients: { advanceEpochs } }),
    });

    const report = await cutover.apply({
      ...manifest,
      clients: [{
        ...manifest.clients[0]!,
        oidc: { ...manifest.clients[0]!.oidc!, ownerStatus: "pending" },
      }],
    });

    expect(report.status).toBe("failed");
    expect(report.failures).toEqual([{
      clientCode: "portal",
      protocol: "oidc",
      reason: "owner-unconfirmed",
    }]);
    expect(advanceEpochs).not.toHaveBeenCalled();
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("advances each configured protocol and invalidates the shared Snapshot after commit", async () => {
    const events: string[] = [];
    const advanceEpochs = mock(async (targets) => {
      expect(targets).toEqual([{
        clientCode: "portal",
        customSsoExpectedEpoch: 3,
        oidcExpectedEpoch: 7,
      }]);
      events.push("clients.locked");
      events.push("clients.written");
      return appliedInventory();
    });
    const invalidateClient = mock(async (clientCode: string) => {
      events.push(`snapshot.invalidate:${clientCode}`);
    });
    const cutover = createClientProtocolEpochCutover({
      runtimeSnapshot: { invalidateClient },
      uow: createImmediateUnitOfWork({ clients: { advanceEpochs } }),
    });

    const report = await cutover.apply(manifest);

    expect(report).toMatchObject({
      status: "passed",
      counts: { clients: 1, protocols: 2, pendingEpochs: 0, advancedEpochs: 2 },
      failures: [],
    });
    expect(events).toEqual([
      "clients.locked",
      "clients.written",
      "snapshot.invalidate:portal",
    ]);
  });

  test("invalidates the shared Snapshot once for an OIDC-only client", async () => {
    const oidcOnlyManifest: ClientProtocolCutoverManifest = {
      version: 2,
      clients: [{
        clientCode: "oidc-only",
        customSso: null,
        oidc: { expectedEpoch: 7, ownerStatus: "confirmed" },
      }],
    };
    const invalidateClient = mock(async () => undefined);
    const cutover = createClientProtocolEpochCutover({
      runtimeSnapshot: { invalidateClient },
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async () => [{
          clientCode: "oidc-only",
          customSsoConfigured: false,
          customSsoEpoch: 0,
          oidcConfigured: true,
          oidcEpoch: 8,
        }],
      } }),
    });

    const report = await cutover.apply(oidcOnlyManifest);

    expect(report.status).toBe("passed");
    expect(invalidateClient).toHaveBeenCalledTimes(1);
    expect(invalidateClient).toHaveBeenCalledWith("oidc-only");
  });

  test("reports a required Snapshot invalidation failure after the epoch commit", async () => {
    const invalidateClient = mock(async () => {
      throw new Error("Runtime Snapshot unavailable");
    });
    const cutover = createClientProtocolEpochCutover({
      runtimeSnapshot: { invalidateClient },
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async () => appliedInventory(),
      } }),
    });

    const caught = await cutover.apply(manifest).catch(error => error);

    expect(caught).toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("verify requires every configured protocol at the expected next epoch", async () => {
    const cutover = createClientProtocolEpochCutover({
      runtimeSnapshot: { invalidateClient: async () => undefined },
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async () => [],
      } }),
    });

    const report = await cutover.verify(manifest, [{
      clientCode: "portal",
      customSsoConfigured: true,
      customSsoEpoch: 4,
      oidcConfigured: true,
      oidcEpoch: 7,
    }]);

    expect(report.status).toBe("failed");
    expect(report.failures).toEqual([{
      clientCode: "portal",
      protocol: "oidc",
      reason: "epoch-not-advanced",
    }]);
  });
});

function appliedInventory() {
  return [{
    clientCode: "portal",
    customSsoConfigured: true,
    customSsoEpoch: 4,
    oidcConfigured: true,
    oidcEpoch: 8,
  }];
}
