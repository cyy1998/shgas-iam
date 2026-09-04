import type {
  ClientRuntimeSnapshotReader,
} from "@iam/api-core/client-runtime-snapshot";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  createCustomSsoClientRuntimeReader,
  createCustomSsoClientRuntimeSnapshotAdapter,
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeSnapshotModuleWithAtomicStore,
  InMemoryClientRuntimeSnapshotAtomicStore,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const activeClient = runtimeClient("gateway", 3);

describe("Custom SSO Client Runtime Snapshot adapter", () => {
  test.each([
    ["active", activeClient, "present"],
    [
      "maintenance",
      { ...activeClient, status: ClientStatus.Maintenance },
      "present",
    ],
    ["missing", null, "absent"],
    [
      "unconfigured",
      { ...activeClient, customSsoConfig: null },
      "absent",
    ],
    [
      "Custom SSO disabled",
      { ...activeClient, customSsoEnabled: false },
      "absent",
    ],
    [
      "globally disabled",
      { ...activeClient, status: ClientStatus.Disable },
      "absent",
    ],
    ["deleted", { ...activeClient, isDelete: true }, "absent"],
  ] as const)(
    "maps %s source state to the expected Snapshot",
    async (_label, record, expectedKind) => {
      const adapter = createCustomSsoClientRuntimeSnapshotAdapter({
        repository: {
          findRuntimeRecord: mock(async () => record),
        },
      });

      const snapshot = await adapter.load("gateway");

      expect(snapshot.kind).toBe(expectedKind);
      if (snapshot.kind === "present")
        expect(snapshot.value).toEqual(record as CustomSsoClientRuntimeDto);
      expect(adapter.presentTtlMs).toBe(30_000);
      expect(adapter.absentTtlMs).toBe(3_000);
    },
  );

  test("round-trips strict runtime records and rejects malformed payloads", () => {
    const adapter = createCustomSsoClientRuntimeSnapshotAdapter({
      repository: { findRuntimeRecord: mock() },
    });
    const encoded = adapter.codec.encode(activeClient);

    expect(adapter.codec.decode(encoded)).toEqual(activeClient);
    expect(() => adapter.codec.decode({
      ...activeClient,
      customSsoConfigVersion: "3",
    })).toThrow();
  });
});

describe("Custom SSO client runtime facade", () => {
  test("discards a source read invalidated before publish and reloads current facts", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    let current = activeClient;
    let releaseFirstSource!: () => void;
    let markFirstSourceStarted!: () => void;
    const firstSourceStarted = new Promise<void>((resolve) => {
      markFirstSourceStarted = resolve;
    });
    const firstSourceGate = new Promise<void>((resolve) => {
      releaseFirstSource = resolve;
    });
    let firstSource = true;
    const findRuntimeRecord = mock(async () => {
      const captured = current;
      if (firstSource) {
        firstSource = false;
        markFirstSourceStarted();
        await firstSourceGate;
      }
      return captured;
    });
    const snapshots = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createCustomSsoClientRuntimeSnapshotAdapter({
        repository: { findRuntimeRecord },
      })],
      createEpoch: () => "custom-sso-component-epoch",
    });
    const facade = createCustomSsoClientRuntimeReader(
      snapshots.reader("custom-sso"),
    );

    const lateRuntime = facade.findRuntimeRecord("gateway");
    await firstSourceStarted;
    current = runtimeClient("gateway", 4);
    await snapshots.invalidateClient("gateway");
    releaseFirstSource();
    const runtime = await lateRuntime;
    const cached = await facade.findRuntimeRecord("gateway");

    expect(runtime).toEqual(current);
    expect(cached).toEqual(current);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test("keeps present, Maintenance, absent and unavailable outcomes distinct", async () => {
    const maintenance = {
      ...activeClient,
      status: ClientStatus.Maintenance,
    };
    const presentReader: ClientRuntimeSnapshotReader<CustomSsoClientRuntimeDto>
      = { acquire: mock(async () => ({ kind: "present" as const, value: activeClient })) };
    const maintenanceReader: ClientRuntimeSnapshotReader<CustomSsoClientRuntimeDto>
      = { acquire: mock(async () => ({ kind: "present" as const, value: maintenance })) };
    const absentReader: ClientRuntimeSnapshotReader<CustomSsoClientRuntimeDto>
      = { acquire: mock(async () => ({ kind: "absent" as const })) };
    const unavailableReader: ClientRuntimeSnapshotReader<CustomSsoClientRuntimeDto>
      = {
        acquire: mock(async () => {
          throw new ClientRuntimeSnapshotUnavailableError();
        }),
      };

    const present = await createCustomSsoClientRuntimeReader(presentReader)
      .findRuntimeRecord("gateway");
    const maintenanceResult
      = await createCustomSsoClientRuntimeReader(maintenanceReader)
        .findRuntimeRecord("gateway");
    const absent = await createCustomSsoClientRuntimeReader(absentReader)
      .findRuntimeRecord("gateway");
    let unavailable: unknown;
    try {
      await createCustomSsoClientRuntimeReader(unavailableReader)
        .findRuntimeRecord("gateway");
    }
    catch (error) {
      unavailable = error;
    }

    expect(present).toEqual(activeClient);
    expect(maintenanceResult).toEqual(maintenance);
    expect(absent).toBeNull();
    expect(unavailable).toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
  });

  test("rejects only out-of-range client codes before Snapshot acquisition", async () => {
    const acquire = mock(async () => ({
      kind: "present" as const,
      value: activeClient,
    }));
    const facade = createCustomSsoClientRuntimeReader({ acquire });

    expect(await facade.findRuntimeRecord("")).toBeNull();
    expect(await facade.findRuntimeRecord("a".repeat(65))).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
  });
});

function runtimeClient(
  clientCode: string,
  customSsoConfigVersion: number,
): CustomSsoClientRuntimeDto {
  return {
    id: 7,
    clientCode,
    clientName: clientCode,
    status: ClientStatus.Enable,
    isDelete: false,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: false },
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com/*"],
    },
    customSsoConfigVersion,
  };
}
