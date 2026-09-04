import { randomUUID } from "node:crypto";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createAdminClientMutation } from "@admin-api/services/client/client-mutation";
import {
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  RETRYABLE_SERVICE_UNAVAILABLE,
  SubjectClaim,
} from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import { createClientRepository as createTrafficGateSource } from "../../../api/src/services/client/client.repository";
import {
  createCustomSsoClientRuntimeReader,
  createCustomSsoClientRuntimeSnapshotAdapter,
} from "../../../api/src/services/client/custom-sso-client-runtime.reader";
import { createCustomSsoClientRepository } from "../../../api/src/services/client/custom-sso-client.repository";
import { createOidcClientRepository } from "../../../oidc-provider/src/repositories/client.repository";
import {
  createOidcClientRuntimeSnapshotAdapter,
  createOidcClientRuntimeStore,
} from "../../../oidc-provider/src/stores/client-runtime.store";
import { createAdminApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createAdminApiRedisTestHarness } from "../redis/redis-test-harness";

describe("Client Runtime hard-cutover rehearsal", () => {
  test("propagates and restores one Admin mutation through PostgreSQL, Redis, and all public Readers", async () => {
    const {
      postgres,
      redisBefore,
      redisHarness,
      scope,
    } = await createRehearsalResources();
    const sentinelKey = `iam:test:client-runtime-hard-cutover:sentinel:${randomUUID()}`;
    const clientCode = scope.clientCode("canary");
    const beforeName = `${clientCode}-before`;
    const afterName = `${clientCode}-after`;
    let testFailure: { readonly error: unknown } | undefined;
    let snapshotAcquisitionFailuresRemaining = 0;

    try {
      await scope.observer.set(sentinelKey, "non-owner");
      await postgres.db.insert(clients).values({
        clientCode,
        clientName: beforeName,
        clientSecret: `secret-${clientCode}`,
        status: ClientStatus.Enable,
        extAttributes: {},
        oidcEnabled: true,
        oidcConfig: {
          clientType: OidcClientType.Public,
          redirectUris: ["https://client.example.com/callback"],
          postLogoutRedirectUris: ["https://client.example.com/logout"],
          allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
          tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
        },
        oidcConfigVersion: 1,
        customSsoEnabled: true,
        customSsoConfig: {
          mode: CustomSsoClientMode.Gateway,
          orcas: { enabled: false },
          subjectClaims: [SubjectClaim.SubjectIdentifier],
          validRedirectUrls: ["https://gateway.example.com/*"],
        },
        customSsoConfigVersion: 1,
      });

      const snapshots = createClientRuntimeSnapshotModule({
        redis: {
          async eval(script, keyCount, ...args) {
            if (snapshotAcquisitionFailuresRemaining > 0) {
              snapshotAcquisitionFailuresRemaining -= 1;
              throw new Error("Injected Client Runtime Snapshot acquisition failure");
            }
            return await scope.redis.eval(script, keyCount, ...args);
          },
        },
        adapters: [
          createOidcClientRuntimeSnapshotAdapter({
            repository: createOidcClientRepository(postgres.db),
            cacheTtlSeconds: 30,
          }),
          createCustomSsoClientRuntimeSnapshotAdapter({
            repository: createCustomSsoClientRepository(postgres.db),
          }),
          createClientTrafficGateSnapshotAdapter({
            source: createTrafficGateSource(postgres.db),
          }),
        ],
      });
      const oidc = createOidcClientRuntimeStore(snapshots.reader("oidc"));
      const customSso = createCustomSsoClientRuntimeReader(
        snapshots.reader("custom-sso"),
      );
      const trafficGate = createClientTrafficGateReader(
        snapshots.reader("traffic-gate"),
      );
      const mutation = createMutation(postgres, snapshots.invalidateClient);

      const before = await acquirePublicFacts({
        clientCode,
        customSso,
        oidc,
        trafficGate,
      });
      expect(before).toEqual({
        customSso: { clientName: beforeName, status: ClientStatus.Enable },
        oidc: { clientName: beforeName },
        trafficGate: { outcome: "enabled" },
      });

      await mutation.transaction(async (tx, bindTarget) =>
        await bindTarget(clientCode, async () =>
          await tx.clientRepository.updateClientByCode(clientCode, {
            clientName: afterName,
            status: ClientStatus.Maintenance,
          })));
      const changed = await acquirePublicFacts({
        clientCode,
        customSso,
        oidc,
        trafficGate,
      });
      expect(changed).toEqual({
        customSso: { clientName: afterName, status: ClientStatus.Maintenance },
        oidc: { clientName: afterName },
        trafficGate: { outcome: "maintenance" },
      });

      await snapshots.invalidateClient(clientCode);
      snapshotAcquisitionFailuresRemaining = 3;
      const unavailable = await acquireUnavailablePublicFacts({
        clientCode,
        customSso,
        oidc,
        trafficGate,
      });
      expect(unavailable.oidc).toMatchObject({
        error: "temporarily_unavailable",
        error_description: "Client Runtime Snapshot unavailable",
        message: "temporarily_unavailable",
        name: "TemporarilyUnavailable",
      });
      expect(unavailable.customSso).toMatchObject({
        message: "Custom SSO client runtime is temporarily unavailable",
        name: "CustomSsoClientRuntimeUnavailableError",
        retryability: RETRYABLE_SERVICE_UNAVAILABLE,
      });
      expect(unavailable.trafficGate).toEqual({
        outcome: "unavailable",
        reason: "read-failed",
      });
      expect(unavailable.trafficGate).not.toEqual(changed.trafficGate);
      expect(snapshotAcquisitionFailuresRemaining).toBe(0);

      await mutation.transaction(async (tx, bindTarget) =>
        await bindTarget(clientCode, async () =>
          await tx.clientRepository.updateClientByCode(clientCode, {
            clientName: beforeName,
            status: ClientStatus.Enable,
          })));
      const restored = await acquirePublicFacts({
        clientCode,
        customSso,
        oidc,
        trafficGate,
      });
      expect(restored).toEqual(before);
    }
    catch (error) {
      testFailure = { error };
    }

    const cleanupErrors: unknown[] = [];
    try {
      await scope.close();
    }
    catch (error) {
      cleanupErrors.push(error);
    }
    try {
      const afterOwnerCleanup = await redisHarness.inventoryKeys();
      expect(afterOwnerCleanup).toEqual(new Set([...redisBefore, sentinelKey]));
    }
    catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await redisHarness.removeKeys([sentinelKey]);
      const afterExactCleanup = await redisHarness.inventoryKeys();
      expect(afterExactCleanup).toEqual(redisBefore);
    }
    catch (error) {
      cleanupErrors.push(error);
    }
    for (const close of [
      () => postgres.close(),
      () => redisHarness.close(),
    ]) {
      try {
        await close();
      }
      catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (testFailure !== undefined && cleanupErrors.length > 0) {
      throw new AggregateError(
        [testFailure.error, ...cleanupErrors],
        "Client Runtime hard-cutover rehearsal and cleanup failed",
      );
    }
    if (testFailure !== undefined)
      throw testFailure.error;
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Failed to clean Client Runtime hard-cutover rehearsal resources",
      );
    }
  }, 30_000);
});

async function createRehearsalResources() {
  const postgres = await createAdminApiPostgresTestHarness();
  let redisHarness: Awaited<
    ReturnType<typeof createAdminApiRedisTestHarness>
  > | undefined;
  try {
    redisHarness = await createAdminApiRedisTestHarness({
      resourceEnvName: "IAM_API_CORE_TEST_REDIS_URL",
    });
    const redisBefore = await redisHarness.inventoryKeys();
    const scope = await redisHarness.createScope();
    return { postgres, redisBefore, redisHarness, scope };
  }
  catch (setupFailure) {
    const cleanupErrors: unknown[] = [];
    const redisHarnessToClose = redisHarness;
    for (const close of [
      () => postgres.close(),
      ...(redisHarnessToClose === undefined
        ? []
        : [() => redisHarnessToClose.close()]),
    ]) {
      try {
        await close();
      }
      catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [setupFailure, ...cleanupErrors],
        "Client Runtime hard-cutover rehearsal setup and cleanup failed",
      );
    }
    throw setupFailure;
  }
}

function createMutation(
  postgres: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>,
  invalidateClient: (clientCode: string) => Promise<void>,
) {
  const unitOfWork = createAdminApiUnitOfWork({
    db: postgres.db,
    logger: {
      error: mock(() => undefined),
      warn: mock(() => undefined),
    },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: {
      nowDate: () => new Date("2026-09-03T00:00:00Z"),
    },
  });
  const clientUnitOfWork = mapUnitOfWork(unitOfWork, tx => ({
    clientRepository: tx.repositories.client,
  }));

  return createAdminClientMutation({
    invalidation: { invalidateClient },
    logger: { error: mock(() => undefined) },
    uow: clientUnitOfWork,
  });
}

async function acquirePublicFacts(options: {
  readonly clientCode: string;
  readonly customSso: ReturnType<typeof createCustomSsoClientRuntimeReader>;
  readonly oidc: ReturnType<typeof createOidcClientRuntimeStore>;
  readonly trafficGate: ReturnType<typeof createClientTrafficGateReader>;
}) {
  const [oidc, customSso, trafficGate] = await Promise.all([
    options.oidc.findRuntime(options.clientCode),
    options.customSso.findRuntimeRecord(options.clientCode),
    options.trafficGate.check(options.clientCode),
  ]);
  return {
    oidc: oidc === null ? null : { clientName: oidc.client_name },
    customSso: customSso === null
      ? null
      : { clientName: customSso.clientName, status: customSso.status },
    trafficGate,
  };
}

async function acquireUnavailablePublicFacts(options: {
  readonly clientCode: string;
  readonly customSso: ReturnType<typeof createCustomSsoClientRuntimeReader>;
  readonly oidc: ReturnType<typeof createOidcClientRuntimeStore>;
  readonly trafficGate: ReturnType<typeof createClientTrafficGateReader>;
}) {
  let oidc: unknown;
  try {
    await options.oidc.findRuntime(options.clientCode);
  }
  catch (error) {
    oidc = error;
  }
  let customSso: unknown;
  try {
    await options.customSso.findRuntimeRecord(options.clientCode);
  }
  catch (error) {
    customSso = error;
  }
  const trafficGate = await options.trafficGate.check(options.clientCode);
  return { customSso, oidc, trafficGate };
}
