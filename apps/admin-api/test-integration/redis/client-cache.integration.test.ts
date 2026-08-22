import type { ClientTrafficGateSourceRecord } from "@iam/api-core/client-traffic-gate";
import type { DedicatedRedisTestConfig } from "@iam/api-core/testing/external-test-resources";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { Redis } from "ioredis";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createClientTrafficGateReader,
} from "@iam/api-core/client-traffic-gate";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  createCustomSsoClientRuntimeReader,
} from "../../../api/src/services/client/custom-sso-client-runtime.reader";
import { createAdminClientCache } from "../../src/composition/runtime/client-cache";
import { createAdminApiRedisTestHarness } from "./redis-test-harness";

const adminApiRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("Admin client cache Redis contract", () => {
  let harness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createAdminApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("restores the caller-owned Redis inventory after invalidation", async () => {
    const scope = await harness.createScope();
    const before = await harness.inventoryKeys();
    try {
      const clientCode = scope.clientCode("inventory");
      await runCacheRuntimeEntry(
        ["invalidate", clientCode, `secret-${clientCode}`],
        harness.redisConfig,
      );
    }
    finally {
      await scope.close();
    }

    const after = await harness.inventoryKeys();
    expect([...after].filter(key => !before.has(key))).toEqual([]);
    expect([...before].filter(key => !after.has(key))).toEqual([]);
  });

  test("makes production runtime invalidation visible through the runtime reader", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("invalidate");
      let current = runtimeClient(clientCode, 3);
      const source = mock(async () => current);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.observer,
        source: { findRuntimeRecord: source },
      });
      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);

      current = runtimeClient(clientCode, 4);
      await runCacheRuntimeEntry(
        ["invalidate", clientCode, `secret-${clientCode}`],
        harness.redisConfig,
      );

      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("makes both sides of a production client code update observable", async () => {
    const scope = await harness.createScope();
    try {
      const oldClientCode = scope.clientCode("old");
      const newClientCode = scope.clientCode("new");
      const oldInitial = runtimeClient(oldClientCode, 5);
      const newInitial = runtimeClient(newClientCode, 5);
      const records = new Map([
        [oldClientCode, oldInitial],
        [newClientCode, newInitial],
      ]);
      const source = mock(async (clientCode: string) => records.get(clientCode) ?? null);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.observer,
        source: { findRuntimeRecord: source },
      });
      expect(await reader.findRuntimeRecord(oldClientCode)).toEqual(oldInitial);
      expect(await reader.findRuntimeRecord(newClientCode)).toEqual(newInitial);

      const oldUpdated = runtimeClient(oldClientCode, 6);
      const newUpdated = runtimeClient(newClientCode, 6);
      records.set(oldClientCode, oldUpdated);
      records.set(newClientCode, newUpdated);
      await runCacheRuntimeEntry([
        "update",
        oldClientCode,
        `secret-${oldClientCode}`,
        newClientCode,
        `secret-${newClientCode}`,
      ], harness.redisConfig);

      expect(await reader.findRuntimeRecord(oldClientCode)).toEqual(oldUpdated);
      expect(await reader.findRuntimeRecord(newClientCode)).toEqual(newUpdated);
      expect(source).toHaveBeenCalledTimes(4);
    }
    finally {
      await scope.close();
    }
  });

  test("publishes a production mutation completion to the runtime reader", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("mutation");
      let current = runtimeClient(clientCode, 7);
      const source = mock(async () => current);
      const reader = createCustomSsoClientRuntimeReader({
        redis: scope.observer,
        source: { findRuntimeRecord: source },
      });
      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);

      current = runtimeClient(clientCode, 8);
      await runCacheRuntimeEntry(
        ["mutation", clientCode, `mutation-${clientCode}`],
        harness.redisConfig,
      );

      expect(await reader.findRuntimeRecord(clientCode)).toEqual(current);
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("distinguishes known and indeterminate traffic gate outcomes", async () => {
    const scope = await harness.createScope();
    try {
      const enabledCode = scope.clientCode("gate-enabled");
      const maintenanceCode = scope.clientCode("gate-maintenance");
      const disabledCode = scope.clientCode("gate-disabled");
      const deletedCode = scope.clientCode("gate-deleted");
      const corruptDeletedCode = scope.clientCode("gate-cdel");
      const missingCode = scope.clientCode("gate-missing");
      const corruptCode = scope.clientCode("gate-corrupt");
      const failedCode = scope.clientCode("gate-failed");
      const source = mock(async (clientCode: string) => {
        if (clientCode === enabledCode)
          return trafficGateSource(enabledCode, ClientStatus.Enable);
        if (clientCode === maintenanceCode)
          return trafficGateSource(maintenanceCode, ClientStatus.Maintenance);
        if (clientCode === disabledCode)
          return trafficGateSource(disabledCode, ClientStatus.Disable);
        if (clientCode === deletedCode) {
          return {
            ...trafficGateSource(deletedCode, ClientStatus.Enable),
            isDelete: true,
          };
        }
        if (clientCode === corruptDeletedCode) {
          return {
            ...trafficGateSource(`${corruptDeletedCode}-wrong`, ClientStatus.Enable),
            isDelete: true,
          };
        }
        if (clientCode === missingCode)
          return null;
        if (clientCode === corruptCode)
          return trafficGateSource(`${corruptCode}-wrong`, ClientStatus.Enable);
        throw new Error("database unavailable");
      });
      const gate = createClientTrafficGateReader({
        redis: scope.observer,
        source: { findClientTrafficState: source },
      });

      expect(await gate.check(enabledCode)).toEqual({ outcome: "enabled" });
      expect(await gate.check(maintenanceCode)).toEqual({ outcome: "maintenance" });
      expect(await gate.check(disabledCode)).toEqual({ outcome: "disabled" });
      expect(await gate.check(deletedCode)).toEqual({ outcome: "deleted" });
      expect(await gate.check(corruptDeletedCode)).toEqual({
        outcome: "unavailable",
        reason: "corrupt",
      });
      expect(await gate.check(missingCode)).toEqual({
        outcome: "unavailable",
        reason: "missing",
      });
      expect(await gate.check(corruptCode)).toEqual({
        outcome: "unavailable",
        reason: "corrupt",
      });
      expect(await gate.check(failedCode)).toEqual({
        outcome: "unavailable",
        reason: "read-failed",
      });
    }
    finally {
      await scope.close();
    }
  });

  test("makes production client invalidation visible through the traffic gate", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-invalidate");
      let status = ClientStatus.Enable;
      const source = mock(async () => trafficGateSource(clientCode, status));
      const gate = createClientTrafficGateReader({
        redis: scope.observer,
        source: { findClientTrafficState: source },
      });
      const cache = createAdminClientCache({ redis: scope.redis });
      expect(await gate.check(clientCode)).toEqual({ outcome: "enabled" });

      status = ClientStatus.Maintenance;
      await cache.invalidateClient({
        clientCode,
        clientSecret: `secret-${clientCode}`,
      });

      expect(await gate.check(clientCode)).toEqual({ outcome: "maintenance" });
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("fences a stale source read and publishes the committed state", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-stale-read");
      let releaseSource!: () => void;
      let sourceStarted!: () => void;
      const sourceWasStarted = new Promise<void>((resolve) => {
        sourceStarted = resolve;
      });
      const sourceRelease = new Promise<void>((resolve) => {
        releaseSource = resolve;
      });
      const source = mock(async () => {
        sourceStarted();
        await sourceRelease;
        return trafficGateSource(clientCode, ClientStatus.Enable);
      });
      const gate = createClientTrafficGateReader({
        redis: scope.observer,
        source: { findClientTrafficState: source },
      });
      const cache = createAdminClientCache({ redis: scope.redis });

      const staleRead = gate.check(clientCode);
      await sourceWasStarted;
      const mutation = await cache.beginTrafficGateMutation(
        clientCode,
        `mutation-${clientCode}`,
      );
      releaseSource();

      expect(await staleRead).toEqual({
        outcome: "unavailable",
        reason: "mutation-in-progress",
      });
      expect(await gate.check(clientCode)).toEqual({
        outcome: "unavailable",
        reason: "mutation-in-progress",
      });
      expect(
        await cache.publishTrafficGateMutation(
          mutation,
          ClientStatus.Maintenance,
        ),
      ).toBe("published");
      expect(await gate.check(clientCode)).toEqual({ outcome: "maintenance" });
      expect(source).toHaveBeenCalledTimes(1);
    }
    finally {
      await scope.close();
    }
  });

  test("rejects a stale source refill after generation-only invalidation", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-gen");
      let status = ClientStatus.Enable;
      let releaseFirstRead!: () => void;
      let firstReadStarted!: () => void;
      const firstReadWasStarted = new Promise<void>((resolve) => {
        firstReadStarted = resolve;
      });
      const firstReadRelease = new Promise<void>((resolve) => {
        releaseFirstRead = resolve;
      });
      let firstRead = true;
      const source = mock(async () => {
        const capturedStatus = status;
        if (firstRead) {
          firstRead = false;
          firstReadStarted();
          await firstReadRelease;
        }
        return trafficGateSource(clientCode, capturedStatus);
      });
      const gate = createClientTrafficGateReader({
        redis: scope.observer,
        source: { findClientTrafficState: source },
      });
      const cache = createAdminClientCache({ redis: scope.redis });

      const staleRead = gate.check(clientCode);
      await firstReadWasStarted;
      status = ClientStatus.Maintenance;
      await cache.invalidateClient({
        clientCode,
        clientSecret: `secret-${clientCode}`,
      });
      releaseFirstRead();

      expect(await staleRead).toEqual({
        outcome: "unavailable",
        reason: "mutation-in-progress",
      });
      expect(await gate.check(clientCode)).toEqual({ outcome: "maintenance" });
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("keeps a failed publish fenced until a safe retry recovers it", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-publish-retry");
      let failNextRedisCommand = false;
      const failingRedis = {
        eval: async (script: string, keyCount: number, ...args: string[]) => {
          if (failNextRedisCommand) {
            failNextRedisCommand = false;
            throw new Error("simulated publish failure");
          }
          return await scope.redis.eval(script, keyCount, ...args);
        },
      } as Redis;
      const failingCache = createAdminClientCache({ redis: failingRedis });
      const healthyCache = createAdminClientCache({ redis: scope.redis });
      const source = mock(async () =>
        trafficGateSource(clientCode, ClientStatus.Enable));
      const gate = createClientTrafficGateReader({
        redis: scope.observer,
        source: { findClientTrafficState: source },
      });
      const failedMutation = await failingCache.beginTrafficGateMutation(
        clientCode,
        `failed-${clientCode}`,
      );
      failNextRedisCommand = true;

      await expect(
        failingCache.publishTrafficGateMutation(
          failedMutation,
          ClientStatus.Maintenance,
        ),
      ).rejects.toThrow("simulated publish failure");
      expect(await gate.check(clientCode)).toEqual({
        outcome: "unavailable",
        reason: "mutation-in-progress",
      });
      expect(source).not.toHaveBeenCalled();

      const retryMutation = await healthyCache.beginTrafficGateMutation(
        clientCode,
        `retry-${clientCode}`,
      );
      expect(
        await healthyCache.publishTrafficGateMutation(
          retryMutation,
          ClientStatus.Enable,
        ),
      ).toBe("published");
      expect(await gate.check(clientCode)).toEqual({ outcome: "enabled" });
      expect(source).not.toHaveBeenCalled();
    }
    finally {
      await scope.close();
    }
  });
});

async function runCacheRuntimeEntry(
  args: string[],
  redisConfig: DedicatedRedisTestConfig,
) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-admin-api-cache-entry-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      const result = await runProcessCommandSmoke({
        label: "Admin API real Redis client cache runtime",
        start: () => spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            "test-smoke/client-cache-invalidation.runtime-smoke.ts",
            ...args,
          ],
          cwd: adminApiRoot,
          env: createCacheRuntimeEnvironment(
            temporaryDirectory,
            redisConfig,
          ),
        }),
        completionTimeoutMs: 20_000,
        cleanupTimeoutMs: 5_000,
      });
      expect(result.output).toContain("CLIENT_CACHE_INVALIDATION_OK");
    },
  });
}

function createCacheRuntimeEnvironment(
  temporaryDirectory: string,
  redisConfig: DedicatedRedisTestConfig,
) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: "1",
      IAM_ADMIN_API_REDIS_HOST: redisConfig.host,
      IAM_ADMIN_API_REDIS_PORT: String(redisConfig.port),
      IAM_ADMIN_API_REDIS_DB: String(redisConfig.db),
      IAM_ADMIN_API_REDIS_PASSWORD: redisConfig.password,
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: "sess:admin-api-cache-entry:",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID: "cache-entry",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET:
        "admin-api-cache-entry-secret-at-least-32-bytes",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
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
      subjectClaimCatalogVersion: 2,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com/*"],
    },
    customSsoConfigVersion,
  };
}

function trafficGateSource(
  clientCode: string,
  status: ClientStatus,
): ClientTrafficGateSourceRecord {
  return {
    clientCode,
    isDelete: false,
    status,
  };
}
