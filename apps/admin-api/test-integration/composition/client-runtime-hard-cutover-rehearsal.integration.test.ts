import type { ClientRuntimeSnapshotAdapter, ClientRuntimeSnapshotKind } from "@iam/api-core/client-runtime-snapshot";
import { randomUUID } from "node:crypto";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import { createClientService } from "@admin-api/services/client/client.service";
import { createFakePasswordHasher, createFakeRandom } from "@admin-api/test/fakes";
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
  CustomSsoClientState,
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
    let invalidationFails = false;

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

      const observedAdapters = [
        observeAdapter(createOidcClientRuntimeSnapshotAdapter({
          repository: createOidcClientRepository(postgres.db),
          cacheTtlSeconds: 30,
        })),
        observeAdapter(createCustomSsoClientRuntimeSnapshotAdapter({
          repository: createCustomSsoClientRepository(postgres.db),
        })),
        observeAdapter(createClientTrafficGateSnapshotAdapter({
          source: createTrafficGateSource(postgres.db),
        })),
      ] as const;
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
        adapters: observedAdapters,
      });
      const oidc = createOidcClientRuntimeStore(snapshots.reader("oidc"));
      const customSso = createCustomSsoClientRuntimeReader(
        snapshots.reader("custom-sso"),
      );
      const trafficGate = createClientTrafficGateReader(
        snapshots.reader("traffic-gate"),
      );
      const mutation = createMutation(postgres, async (code) => {
        if (invalidationFails)
          throw new Error("Injected Snapshot propagation failure");
        await snapshots.invalidateClient(code);
      });

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

      const updated = await mutation.updateClient(clientCode, {
        clientName: afterName,
        status: ClientStatus.Maintenance,
      });
      expect(updated).toEqual({ changed: true, result: null });
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

      const updatedBack = await mutation.updateClient(clientCode, {
        clientName: beforeName,
        status: ClientStatus.Enable,
      });
      expect(updatedBack).toEqual({ changed: true, result: null });
      const restored = await acquirePublicFacts({
        clientCode,
        customSso,
        oidc,
        trafficGate,
      });
      expect(restored).toEqual(before);

      invalidationFails = true;
      let propagationError: unknown;
      try {
        await mutation.updateClient(clientCode, { clientName: afterName, status: ClientStatus.Maintenance });
      }
      catch (error) {
        propagationError = error;
      }
      expect(propagationError).toBeInstanceOf(AdminMutationCommittedError);
      const committed = await mutation.getClientDetailByCode(clientCode);
      expect(committed).toMatchObject({ clientName: afterName, status: ClientStatus.Maintenance });
      const stale = await acquirePublicFacts({ clientCode, customSso, oidc, trafficGate });
      expect(stale).toEqual(before);

      // A legal no-op must still invalidate the old Snapshot after propagation is available again.
      invalidationFails = false;
      const noop = await mutation.updateClientStatus(clientCode, ClientStatus.Maintenance);
      expect(noop).toEqual({ changed: false, result: null });
      const repairedByNoop = await acquirePublicFacts({ clientCode, customSso, oidc, trafficGate });
      expect(repairedByNoop).toEqual(changed);

      const beforeOidc = await mutation.getClientDetailByCode(clientCode);
      const nextConfig = {
        clientType: OidcClientType.Confidential,
        redirectUris: ["https://client.example.com/new-callback"],
        postLogoutRedirectUris: ["https://client.example.com/logout"],
        allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
        tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
      } as const;
      invalidationFails = true;
      let secretDeliveryError: unknown;
      try {
        await mutation.configureClientOidc(clientCode, {
          ...nextConfig,
          redirectUris: [...nextConfig.redirectUris],
          postLogoutRedirectUris: [...nextConfig.postLogoutRedirectUris],
          allowedScopes: [...nextConfig.allowedScopes],
        });
      }
      catch (error) {
        secretDeliveryError = error;
      }
      expect(secretDeliveryError).toBeInstanceOf(AdminMutationCommittedError);
      const staleOidc = await oidc.findRuntime(clientCode);
      expect(staleOidc?.redirect_uris).toEqual(["https://client.example.com/callback"]);
      const committedOidc = await mutation.getClientDetailByCode(clientCode);
      expect(committedOidc).toMatchObject({ hasOidcSecret: true, oidcConfigVersion: beforeOidc.oidcConfigVersion + 1 });

      invalidationFails = false;
      const oidcNoop = await mutation.configureClientOidc(clientCode, committedOidc.oidcConfig!);
      expect(oidcNoop.changed).toBe(false);
      expect(oidcNoop.result.clientSecret).toBeUndefined();
      const freshOidc = await oidc.findRuntime(clientCode);
      expect(freshOidc?.redirect_uris).toEqual(["https://client.example.com/new-callback"]);
      expect(freshOidc?.oidc_config_version).toBe(committedOidc.oidcConfigVersion);
      const rotated = await mutation.rotateClientOidcSecret(clientCode);
      expect(rotated.changed).toBe(true);
      expect(rotated.result.clientSecret).toBeTruthy();
      const rotatedVersion = await oidc.findActiveVersion(clientCode);
      expect(rotatedVersion).toBe(committedOidc.oidcConfigVersion + 1);
      await mutation.disableClientOidc(clientCode);
      const disabledOidc = await oidc.findRuntime(clientCode);
      expect(disabledOidc).toBeNull();
      await mutation.enableClientOidc(clientCode);
      const enabledOidc = await oidc.findRuntime(clientCode);
      expect(enabledOidc?.oidc_config_version).toBe(committedOidc.oidcConfigVersion + 3);
      await mutation.disableClientOidc(clientCode);
      await mutation.removeClientOidc(clientCode);
      const removedOidc = await oidc.findRuntime(clientCode);
      expect(removedOidc).toBeNull();

      await mutation.disableClientCustomSso(clientCode);
      const independentConfig = {
        mode: CustomSsoClientMode.Independent as const,
        validRedirectUrls: ["https://independent.example.com/*"],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        callbackEndpoint: "https://independent.example.com/callback",
        logoutEndpoint: "https://independent.example.com/logout",
      };
      const initialCustomSso = await mutation.getClientDetailByCode(clientCode);
      let expectedVersion = initialCustomSso.customSsoConfigVersion;
      for (const operation of ["first-independent", "rotation"] as const) {
        const beforeDeliveryFailure = await acquirePublicFacts({ clientCode, customSso, oidc, trafficGate });
        invalidationFails = true;
        let deliveryFailure: unknown;
        try {
          if (operation === "first-independent")
            await mutation.configureClientCustomSso(clientCode, independentConfig);
          else
            await mutation.rotateClientCustomSsoSecret(clientCode);
        }
        catch (error) {
          deliveryFailure = error;
        }
        expectedVersion += 1;
        expect(deliveryFailure).toBeInstanceOf(AdminMutationCommittedError);
        expect(deliveryFailure).not.toHaveProperty("result");
        expect(JSON.stringify(deliveryFailure)).not.toContain("iam_sso_test_secret");
        const committedCustomSso = await mutation.getClientDetailByCode(clientCode);
        expect(committedCustomSso).toMatchObject({
          customSsoConfigVersion: expectedVersion,
          customSsoState: CustomSsoClientState.Disabled,
          hasCustomSsoSecret: true,
        });
        expect(committedCustomSso).not.toHaveProperty("customSsoSecret");
        expect(committedCustomSso).not.toHaveProperty("customSsoSecretHash");
        const staleCustomSso = await acquirePublicFacts({ clientCode, customSso, oidc, trafficGate });
        expect(staleCustomSso).toEqual(beforeDeliveryFailure);

        invalidationFails = false;
        const loadCounts = observedAdapters.map(adapter => adapter.load.mock.calls.length);
        const repaired = await mutation.configureClientCustomSso(clientCode, independentConfig);
        expect(repaired.changed).toBe(false);
        expect(repaired.result.client.customSsoConfigVersion).toBe(expectedVersion);
        expect(repaired.result.customSsoSecret).toBeUndefined();
        await acquirePublicFacts({ clientCode, customSso, oidc, trafficGate });
        for (const [index, adapter] of observedAdapters.entries())
          expect(adapter.load).toHaveBeenCalledTimes(loadCounts[index]! + 1);

        // Recovery requires a new, explicitly requested rotation; detail reads cannot recover the lost secret.
        const delivered = await mutation.rotateClientCustomSsoSecret(clientCode);
        expectedVersion += 1;
        expect(delivered.changed).toBe(true);
        expect(delivered.result.customSsoSecret).toBeTruthy();
        expect(delivered.result.client.customSsoConfigVersion).toBe(expectedVersion);
      }
      await mutation.enableClientCustomSso(clientCode);
      const enabledCustomSso = await customSso.findRuntimeRecord(clientCode);
      expect(enabledCustomSso).toMatchObject({
        customSsoConfig: independentConfig,
        customSsoConfigVersion: expectedVersion + 1,
      });
      const repeatedEnable = await mutation.enableClientCustomSso(clientCode);
      expect(repeatedEnable.changed).toBe(false);
      const sameConfig = await mutation.configureClientCustomSso(clientCode, independentConfig);
      expect(sameConfig.changed).toBe(false);
      const sameRuntime = await customSso.findRuntimeRecord(clientCode);
      expect(sameRuntime).toEqual(enabledCustomSso);
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
    auditService: tx.auditService,
  }));

  return createClientService({
    clientRepository: createClientRepository(postgres.db),
    clientRuntimeInvalidation: { invalidateClient },
    clientMutationLogger: { error: mock(() => undefined) },
    clientCache: {
      invalidateClient: async () => undefined,
      invalidateUpdatedClient: async () => undefined,
    },
    sessionRevocation: {
      revokeClientProtocol: async () => revokeSummary(),
      revokeClientAllProtocols: async () => revokeSummary(),
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
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

function revokeSummary() {
  return {
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  };
}

function observeAdapter<K extends ClientRuntimeSnapshotKind, T>(adapter: ClientRuntimeSnapshotAdapter<K, T>) {
  return { ...adapter, load: mock(adapter.load) };
}
