import type { ClientRuntimeSnapshotReader } from "@iam/api-core/client-runtime-snapshot";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeSnapshotModuleWithAtomicStore,
  InMemoryClientRuntimeSnapshotAtomicStore,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { ClientStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

describe("Client Traffic Gate Snapshot adapter", () => {
  test.each([
    [ClientStatus.Enable, false, "enabled"],
    [ClientStatus.Maintenance, false, "maintenance"],
    [ClientStatus.Disable, false, "disabled"],
    [ClientStatus.Enable, true, "deleted"],
  ] as const)("maps %s/delete=%s to a canonical %s Snapshot", async (status, isDelete, outcome) => {
    const adapter = createClientTrafficGateSnapshotAdapter({
      source: {
        findClientTrafficState: mock(async () => ({
          clientCode: "portal",
          isDelete,
          status,
        })),
      },
    });

    const snapshot = await adapter.load("portal");

    expect(snapshot).toEqual({ kind: "present", value: { outcome } });
    expect(adapter.codec.decode(adapter.codec.encode(
      snapshot.kind === "present" ? snapshot.value : null,
    ))).toEqual({ outcome });
  });

  test("represents a missing Client as an absent Snapshot", async () => {
    const adapter = createClientTrafficGateSnapshotAdapter({
      source: { findClientTrafficState: mock(async () => null) },
    });

    expect(await adapter.load("missing-client")).toEqual({ kind: "absent" });
  });
});

describe("Client Traffic Gate Snapshot reader", () => {
  test("keeps an acquired normal or Maintenance Snapshot valid for the caller", async () => {
    const acquire = mock<ClientRuntimeSnapshotReader<{
      readonly outcome: "enabled" | "maintenance" | "disabled" | "deleted";
    }>["acquire"]>(async () => ({
      kind: "present" as const,
      value: { outcome: "enabled" as const },
    }));
    const gate = createClientTrafficGateReader({ acquire });

    const normal = await gate.check("portal");
    acquire.mockResolvedValueOnce({
      kind: "present",
      value: { outcome: "maintenance" },
    });
    const maintenance = await gate.check("portal");

    expect(normal).toEqual({ outcome: "enabled" });
    expect(maintenance).toEqual({ outcome: "maintenance" });
  });

  test("fails closed for absent, invalid, and unavailable acquisition", async () => {
    const acquire = mock<ClientRuntimeSnapshotReader<{
      readonly outcome: "enabled" | "maintenance" | "disabled" | "deleted";
    }>["acquire"]>(async () => ({ kind: "absent" }));
    const gate = createClientTrafficGateReader({ acquire });

    expect(await gate.check("missing-client")).toEqual({
      outcome: "unavailable",
      reason: "missing",
    });
    expect(await gate.check("not a valid client code")).toEqual({
      outcome: "unavailable",
      reason: "missing",
    });
    acquire.mockRejectedValueOnce(new ClientRuntimeSnapshotUnavailableError());
    expect(await gate.check("portal")).toEqual({
      outcome: "unavailable",
      reason: "read-failed",
    });
  });

  test("keeps a normal Snapshot after failed invalidation until targeted repair", async () => {
    const backingStore = new InMemoryClientRuntimeSnapshotAtomicStore();
    let failInvalidation = true;
    let status = ClientStatus.Enable;
    const store = {
      readOrBootstrap: backingStore.readOrBootstrap.bind(backingStore),
      publishIfCurrent: backingStore.publishIfCurrent.bind(backingStore),
      verifyCurrent: backingStore.verifyCurrent.bind(backingStore),
      async invalidateClient(
        ...args: Parameters<typeof backingStore.invalidateClient>
      ) {
        if (failInvalidation)
          throw new Error("shared invalidation unavailable");
        await backingStore.invalidateClient(...args);
      },
    };
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createClientTrafficGateSnapshotAdapter({
        source: {
          findClientTrafficState: async clientCode => ({
            clientCode,
            isDelete: false,
            status,
          }),
        },
      })],
    });
    const gate = createClientTrafficGateReader(runtime.reader("traffic-gate"));

    expect(await gate.check("portal")).toEqual({ outcome: "enabled" });
    status = ClientStatus.Maintenance;
    let invalidationFailure: unknown;
    try {
      await runtime.invalidateClient("portal");
    }
    catch (error) {
      invalidationFailure = error;
    }
    expect(invalidationFailure).toMatchObject({
      name: "ClientRuntimeInvalidationFailedError",
    });
    expect(await gate.check("portal")).toEqual({ outcome: "enabled" });

    failInvalidation = false;
    await runtime.invalidateClient("portal");
    expect(await gate.check("portal")).toEqual({ outcome: "maintenance" });
  });
});
