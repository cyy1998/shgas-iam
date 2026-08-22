import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  createCustomSsoClientRuntimeReader,
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  beginCustomSsoClientRuntimeMutation,
  completeCustomSsoClientRuntimeMutation,
  CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createApiRedisTestHarness } from "./redis-test-harness";

describe("Custom SSO client runtime Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("uses bounded positive and shorter negative read-through caches", async () => {
    const scope = await harness.createScope();
    try {
      const presentCode = scope.clientCode("present");
      const missingCode = scope.clientCode("missing");
      const present = runtimeClient(presentCode, 3);
      const source = mock(async (clientCode: string) =>
        clientCode === presentCode ? present : null);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.redis,
        source: { findRuntimeRecord: source },
      });

      expect(await reader.findRuntimeRecord(presentCode)).toEqual(present);
      expect(await reader.findRuntimeRecord(presentCode)).toEqual(present);
      expect(await reader.findRuntimeRecord(missingCode)).toBeNull();
      expect(await reader.findRuntimeRecord(missingCode)).toBeNull();

      expect(source.mock.calls).toEqual([
        [presentCode],
        [missingCode],
      ]);
      const positiveTtl = await scope.observer.pttl(
        customSsoClientRuntimeCacheKey(presentCode),
      );
      const negativeTtl = await scope.observer.pttl(
        customSsoClientRuntimeCacheKey(missingCode),
      );
      expect(positiveTtl).toBeGreaterThan(0);
      expect(positiveTtl).toBeLessThanOrEqual(
        CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
      );
      expect(negativeTtl).toBeGreaterThan(0);
      expect(negativeTtl).toBeLessThanOrEqual(
        CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
      );
      expect(negativeTtl).toBeLessThan(positiveTtl);
    }
    finally {
      await scope.close();
    }
  });

  test("discards an in-flight source read when an Admin mutation begins", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("race");
      const stale = runtimeClient(clientCode, 3);
      let releaseSource!: (value: CustomSsoClientRuntimeDto) => void;
      let markSourceStarted!: () => void;
      const sourceStarted = new Promise<void>((resolve) => {
        markSourceStarted = resolve;
      });
      const sourceResult = new Promise<CustomSsoClientRuntimeDto>(
        (resolve) => {
          releaseSource = resolve;
        },
      );
      const source = mock(async () => {
        markSourceStarted();
        return await sourceResult;
      });
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.redis,
        source: { findRuntimeRecord: source },
      });

      const pendingRead = reader.findRuntimeRecord(clientCode);
      await sourceStarted;
      const mutation = await beginCustomSsoClientRuntimeMutation(
        scope.observer,
        {
          clientCode,
          mutationId: "mutation-race",
        },
      );
      releaseSource(stale);

      expect(await captureRejection(pendingRead)).toBeInstanceOf(
        CustomSsoClientRuntimeUnavailableError,
      );
      expect(await scope.observer.get(
        customSsoClientRuntimeCacheKey(clientCode),
      )).toBeNull();
      expect(await captureRejection(
        reader.findRuntimeRecord(clientCode),
      )).toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
      expect(await completeCustomSsoClientRuntimeMutation(
        scope.observer,
        mutation,
      )).toBe("completed");
    }
    finally {
      await scope.close();
    }
  });

  test("keeps a newer fence against late completion and converges after TTL expiry", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("recovery");
      let current = runtimeClient(clientCode, 3);
      const source = mock(async () => current);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.redis,
        source: { findRuntimeRecord: source },
      });
      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);

      const first = await beginCustomSsoClientRuntimeMutation(
        scope.observer,
        { clientCode, mutationId: "mutation-old" },
      );
      await beginCustomSsoClientRuntimeMutation(
        scope.observer,
        { clientCode, mutationId: "mutation-current" },
      );
      expect(await completeCustomSsoClientRuntimeMutation(
        scope.observer,
        first,
      )).toBe("superseded");
      expect(await scope.observer.get(
        customSsoClientRuntimeMutationKey(clientCode),
      )).toBe("mutation-current");
      expect(await scope.observer.get(
        customSsoClientRuntimeCacheKey(clientCode),
      )).toBeNull();
      expect(Number(await scope.observer.get(
        customSsoClientRuntimeGenerationKey(clientCode),
      ))).toBeGreaterThanOrEqual(2);
      const fenceTtl = await scope.observer.pttl(
        customSsoClientRuntimeMutationKey(clientCode),
      );
      expect(fenceTtl).toBeGreaterThan(
        CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
      );
      expect(fenceTtl).toBeLessThanOrEqual(
        CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS,
      );

      current = runtimeClient(clientCode, 4);
      expect(await captureRejection(
        reader.findRuntimeRecord(clientCode),
      )).toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
      await scope.observer.pexpire(
        customSsoClientRuntimeMutationKey(clientCode),
        25,
      );
      await waitUntil(async () =>
        await scope.observer.exists(
          customSsoClientRuntimeMutationKey(clientCode),
        ) === 0);

      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("an expired mutation invalidates a stale refill without clearing a newer fence", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("expired-finish");
      let current = runtimeClient(clientCode, 3);
      const source = mock(async () => current);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.redis,
        source: { findRuntimeRecord: source },
      });
      const expired = await beginCustomSsoClientRuntimeMutation(
        scope.observer,
        {
          clientCode,
          mutationId: "mutation-expired",
          fenceTtlMs: 30,
        },
      );
      await waitUntil(async () =>
        await scope.observer.exists(
          customSsoClientRuntimeMutationKey(clientCode),
        ) === 0);

      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);
      expect(await scope.observer.get(
        customSsoClientRuntimeCacheKey(clientCode),
      )).not.toBeNull();

      expect(await completeCustomSsoClientRuntimeMutation(
        scope.observer,
        expired,
      )).toBe("expired");
      expect(await scope.observer.get(
        customSsoClientRuntimeCacheKey(clientCode),
      )).toBeNull();

      const currentMutation = await beginCustomSsoClientRuntimeMutation(
        scope.observer,
        {
          clientCode,
          mutationId: "mutation-current",
          fenceTtlMs: 300,
        },
      );
      expect(await completeCustomSsoClientRuntimeMutation(
        scope.observer,
        expired,
      )).toBe("superseded");
      expect(await scope.observer.get(
        customSsoClientRuntimeMutationKey(clientCode),
      )).toBe("mutation-current");

      current = runtimeClient(clientCode, 4);
      expect(await completeCustomSsoClientRuntimeMutation(
        scope.observer,
        currentMutation,
      )).toBe("completed");
      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);
    }
    finally {
      await scope.close();
    }
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
      subjectClaimCatalogVersion: 2,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com/*"],
    },
    customSsoConfigVersion,
  };
}

async function waitUntil(condition: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await condition())
      return;
    await Bun.sleep(10);
  }
  throw new Error("Timed out waiting for Redis state");
}

async function captureRejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("expected Redis operation to reject");
}
