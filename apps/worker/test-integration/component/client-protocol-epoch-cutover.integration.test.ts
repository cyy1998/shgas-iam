import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { createImmediateUnitOfWork, createUnitOfWork } from "@iam/api-core/uow";
import { createClientProtocolEpochCutover } from "@worker/commands/client-protocol-epoch-cutover";
import { describe, expect, mock, test } from "bun:test";

const manifest: ClientProtocolCutoverManifest = {
  version: 2,
  clients: [{
    clientCode: "portal",
    customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
    oidc: { expectedEpoch: 7, ownerStatus: "confirmed" },
  }],
};

describe("Client Protocol epoch cutover", () => {
  test("refuses to invent owner confirmation or mutate an incomplete checklist", async () => {
    const advanceEpochs = mock(async () => []);
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(),
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
  });

  test("advances each configured protocol once and safely finishes a partial retry", async () => {
    const advanceEpochs = mock(async (targets, afterLockBeforeWrite) => {
      expect(targets).toEqual([{
        clientCode: "portal",
        customSsoExpectedEpoch: 3,
        customSsoTargetCatalogVersion: 2,
        oidcExpectedEpoch: 7,
      }]);
      await afterLockBeforeWrite();
      return [{
        clientCode: "portal",
        customSsoCatalogVersion: 2 as const,
        customSsoConfigured: true,
        customSsoEpoch: 4,
        oidcConfigured: true,
        oidcEpoch: 8,
      }];
    });
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(),
      uow: createImmediateUnitOfWork({ clients: { advanceEpochs } }),
    });

    const report = await cutover.apply(manifest);

    expect(report).toMatchObject({
      status: "passed",
      counts: {
        clients: 1,
        protocols: 2,
        pendingEpochs: 0,
        advancedEpochs: 2,
      },
      failures: [],
    });
    expect(advanceEpochs).toHaveBeenCalledTimes(1);
  });

  test("verify requires every configured protocol at the fenced next epoch", async () => {
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(),
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async () => [],
      } }),
    });

    const report = await cutover.verify(manifest, [{
      clientCode: "portal",
      customSsoCatalogVersion: 2,
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

  test("establishes the runtime fence after locking and aborts it only after confirmed rollback", async () => {
    const events: string[] = [];
    const ownershipFailure = new Error("runtime mutation ownership lost");
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: {
        async beginMutation() {
          events.push("fence.begin");
          return {
            abort: async () => events.push("fence.abort"),
            complete: async () => events.push("fence.complete"),
            heartbeat: {
              assertOwned: async () => {
                events.push("fence.assert-owned");
                throw ownershipFailure;
              },
              stopAndSettle: async <T>(settle: () => Promise<T>) => {
                events.push("heartbeat.stop");
                return await settle();
              },
            },
          };
        },
      },
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async (_targets, afterLockBeforeWrite) => {
          events.push("clients.locked");
          await afterLockBeforeWrite();
          events.push("clients.written");
          return appliedInventory();
        },
      } }),
    });

    const caught = await cutover.apply(manifest).catch(error => error);

    expect(caught).toBe(ownershipFailure);
    expect(events).toEqual([
      "clients.locked",
      "fence.begin",
      "clients.written",
      "fence.assert-owned",
      "heartbeat.stop",
      "fence.abort",
    ]);
  });

  test("does not write when the runtime fence cannot be established", async () => {
    const events: string[] = [];
    const beginFailure = new Error("runtime fence unavailable");
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: {
        async beginMutation() {
          events.push("fence.begin");
          throw beginFailure;
        },
      },
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async (_targets, afterLockBeforeWrite) => {
          events.push("clients.locked");
          await afterLockBeforeWrite();
          events.push("clients.written");
          return appliedInventory();
        },
      } }),
    });

    const caught = await cutover.apply(manifest).catch(error => error);

    expect(caught).toBe(beginFailure);
    expect(events).toEqual(["clients.locked", "fence.begin"]);
  });

  test("stops heartbeats without settlement when the commit outcome is unknown", async () => {
    const events: string[] = [];
    const commitFailure = new Error("commit response lost");
    const advanceEpochs = async (
      _targets: unknown,
      afterLockBeforeWrite: () => Promise<void>,
    ) => {
      events.push("clients.locked");
      await afterLockBeforeWrite();
      events.push("clients.written");
      return appliedInventory();
    };
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createLifecycleRuntimeCache(events),
      uow: createUnitOfWork({
        db: {
          async transaction<T>(callback: (tx: object) => Promise<T>) {
            await callback({});
            throw commitFailure;
          },
        },
        logger: { error: () => undefined, warn: () => undefined },
        createTxPorts: () => ({ clients: { advanceEpochs } }),
      }),
    });

    const caught = await cutover.apply(manifest).catch(error => error);

    expect(caught).toBe(commitFailure);
    expect(events).toEqual([
      "clients.locked",
      "fence.begin",
      "clients.written",
      "fence.assert-owned",
      "heartbeat.stop",
    ]);
  });

  test("reports required completion failure without aborting the committed mutation", async () => {
    const events: string[] = [];
    const completionFailure = new Error("runtime invalidation failed");
    const runtimeCache = createLifecycleRuntimeCache(events);
    runtimeCache.beginMutation = async () => {
      const coordination = await createLifecycleRuntimeCache(events).beginMutation();
      return {
        ...coordination,
        complete: async () => {
          events.push("fence.complete");
          throw completionFailure;
        },
      };
    };
    const cutover = createClientProtocolEpochCutover({
      runtimeCache,
      uow: createImmediateUnitOfWork({ clients: {
        advanceEpochs: async (_targets, afterLockBeforeWrite) => {
          events.push("clients.locked");
          await afterLockBeforeWrite();
          events.push("clients.written");
          return appliedInventory();
        },
      } }),
    });

    const caught = await cutover.apply(manifest).catch(error => error);

    expect(caught).toBeInstanceOf(Error);
    expect(events).toEqual([
      "clients.locked",
      "fence.begin",
      "clients.written",
      "fence.assert-owned",
      "heartbeat.stop",
      "fence.complete",
    ]);
  });
});

function createRuntimeCache() {
  return {
    async beginMutation() {
      return {
        abort: async () => undefined,
        complete: async () => undefined,
        heartbeat: {
          assertOwned: async () => undefined,
          stopAndSettle: async <T>(settle: () => Promise<T>) => await settle(),
        },
      };
    },
  };
}

function createLifecycleRuntimeCache(events: string[]) {
  return {
    async beginMutation() {
      events.push("fence.begin");
      return {
        abort: async () => events.push("fence.abort"),
        complete: async () => events.push("fence.complete"),
        heartbeat: {
          assertOwned: async () => {
            events.push("fence.assert-owned");
          },
          stopAndSettle: async <T>(settle: () => Promise<T>) => {
            events.push("heartbeat.stop");
            return await settle();
          },
        },
      };
    },
  };
}

function appliedInventory() {
  return [{
    clientCode: "portal",
    customSsoCatalogVersion: 2 as const,
    customSsoConfigured: true,
    customSsoEpoch: 4,
    oidcConfigured: true,
    oidcEpoch: 8,
  }];
}
