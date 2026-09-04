import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  createCustomSsoClientRuntimeReader,
  createCustomSsoClientRuntimeSnapshotAdapter,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  CLIENT_RUNTIME_SNAPSHOT_KINDS,
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  clientRuntimeSnapshotTestingKeys,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createApiRedisTestHarness } from "./redis-test-harness";

describe("Custom SSO Client Runtime Snapshot Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("uses bounded positive and shorter absent Snapshot payloads", async () => {
    const scope = await harness.createScope();
    try {
      const presentCode = scope.clientCode("present");
      const missingCode = scope.clientCode("missing");
      const unconfiguredCode = scope.clientCode("unconfigured");
      const present = runtimeClient(presentCode, 3);
      const source = mock(async (clientCode: string) => {
        if (clientCode === presentCode)
          return present;
        if (clientCode === unconfiguredCode) {
          return {
            ...runtimeClient(unconfiguredCode, 0),
            customSsoConfig: null,
            customSsoEnabled: false,
          };
        }
        return null;
      });
      const { facade } = createRuntime(scope.redis, source);

      const firstPresent = await facade.findRuntimeRecord(presentCode);
      const secondPresent = await facade.findRuntimeRecord(presentCode);
      const firstAbsent = await facade.findRuntimeRecord(missingCode);
      const secondAbsent = await facade.findRuntimeRecord(missingCode);
      const unconfigured = await facade.findRuntimeRecord(unconfiguredCode);
      const positiveTtl = await scope.observer.pttl(payloadKey(presentCode));
      const negativeTtl = await scope.observer.pttl(payloadKey(missingCode));

      expect(firstPresent).toEqual(present);
      expect(secondPresent).toEqual(present);
      expect(firstAbsent).toBeNull();
      expect(secondAbsent).toBeNull();
      expect(unconfigured).toBeNull();
      expect(source.mock.calls).toEqual([
        [presentCode],
        [missingCode],
        [unconfiguredCode],
      ]);
      expect(positiveTtl).toBeGreaterThan(0);
      expect(positiveTtl).toBeLessThanOrEqual(30_000);
      expect(negativeTtl).toBeGreaterThan(0);
      expect(negativeTtl).toBeLessThanOrEqual(3_000);
      expect(negativeTtl).toBeLessThan(positiveTtl);
    }
    finally {
      await scope.close();
    }
  });

  test("rejects a late source result after shared invalidation and reloads once", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("late-refill");
      let current = runtimeClient(clientCode, 3);
      let releaseFirstSource!: () => void;
      let markFirstSourceStarted!: () => void;
      const firstSourceStarted = new Promise<void>((resolve) => {
        markFirstSourceStarted = resolve;
      });
      const firstSourceGate = new Promise<void>((resolve) => {
        releaseFirstSource = resolve;
      });
      let firstSource = true;
      const source = mock(async () => {
        const captured = current;
        if (firstSource) {
          firstSource = false;
          markFirstSourceStarted();
          await firstSourceGate;
        }
        return captured;
      });
      const { facade, snapshots } = createRuntime(scope.redis, source);

      const acquiring = facade.findRuntimeRecord(clientCode);
      await firstSourceStarted;
      current = runtimeClient(clientCode, 4);
      await snapshots.invalidateClient(clientCode);
      releaseFirstSource();
      const result = await acquiring;
      const cached = await facade.findRuntimeRecord(clientCode);

      expect(result).toEqual(current);
      expect(cached).toEqual(current);
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("self-heals a bad payload and reloads after shared invalidation", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("repair");
      let current = runtimeClient(clientCode, 3);
      const source = mock(async () => current);
      const { facade, snapshots } = createRuntime(scope.redis, source);

      const initial = await facade.findRuntimeRecord(clientCode);
      await scope.observer.set(payloadKey(clientCode), "{malformed");
      current = runtimeClient(clientCode, 4);
      const repaired = await facade.findRuntimeRecord(clientCode);
      current = runtimeClient(clientCode, 5);
      await snapshots.invalidateClient(clientCode);
      const invalidated = await facade.findRuntimeRecord(clientCode);

      expect(initial?.customSsoConfigVersion).toBe(3);
      expect(repaired?.customSsoConfigVersion).toBe(4);
      expect(invalidated?.customSsoConfigVersion).toBe(5);
      expect(source).toHaveBeenCalledTimes(3);
    }
    finally {
      await scope.close();
    }
  });
});

function createRuntime(
  redis: Parameters<typeof createClientRuntimeSnapshotModule>[0]["redis"],
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>,
) {
  const snapshots = createClientRuntimeSnapshotModule({
    redis,
    adapters: [createCustomSsoClientRuntimeSnapshotAdapter({
      repository: { findRuntimeRecord },
    })],
  });
  return {
    snapshots,
    facade: createCustomSsoClientRuntimeReader(
      snapshots.reader("custom-sso"),
    ),
  };
}

function payloadKey(clientCode: string) {
  const index = CLIENT_RUNTIME_SNAPSHOT_KINDS.indexOf("custom-sso");
  return clientRuntimeSnapshotTestingKeys(clientCode).payloads[index]!;
}

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
