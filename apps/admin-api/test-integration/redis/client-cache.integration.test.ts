import type { AdminClientRecord } from "@admin-api/services/client/client.type";
import type { DedicatedRedisTestConfig } from "@iam/api-core/testing/external-test-resources";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { Redis } from "ioredis";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createFakePasswordHasher,
  createFakeRandom,
  createImmediateUnitOfWork,
} from "@admin-api/test/fakes";
import {
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  SubjectClaim,
} from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  createCustomSsoClientRuntimeReader,
  createCustomSsoClientRuntimeSnapshotAdapter,
} from "../../../api/src/services/client/custom-sso-client-runtime.reader";
import { createClientService } from "../../src/services/client/client.service";
import { createAdminSessionRevocationPort } from "../../src/services/session-revocation/session-revocation.port";
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

  test("deletes exactly the four generic cache identities through the production update entry", async () => {
    const scope = await harness.createScope();
    try {
      const oldClientCode = scope.clientCode("update-old");
      const newClientCode = scope.clientCode("update-new");
      const oldSecret = `secret-${oldClientCode}`;
      const newSecret = `secret-${newClientCode}`;
      const expectedDeletedKeys = [
        `cache:client:code:${oldClientCode}`,
        `cache:client:secret:${oldSecret}`,
        `cache:client:code:${newClientCode}`,
        `cache:client:secret:${newSecret}`,
      ] as const;
      const unrelatedKey = `cache:client:code:${scope.clientCode("unrelated")}`;
      await scope.redis.mset(
        expectedDeletedKeys[0],
        "old-code",
        expectedDeletedKeys[1],
        "old-secret",
        expectedDeletedKeys[2],
        "new-code",
        expectedDeletedKeys[3],
        "new-secret",
        unrelatedKey,
        "unrelated",
      );

      await runCacheRuntimeEntry(
        ["update", oldClientCode, oldSecret, newClientCode, newSecret],
        harness.redisConfig,
      );

      const deletedValues = await scope.observer.mget(...expectedDeletedKeys);
      const unrelatedValue = await scope.observer.get(unrelatedKey);
      expect(deletedValues).toEqual([null, null, null, null]);
      expect(unrelatedValue).toBe("unrelated");
    }
    finally {
      await scope.close();
    }
  });

  test("propagates a Custom SSO mutation through the production Snapshot seam", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("invalidate");
      let current = runtimeClient(clientCode, 3);
      const source = mock(async () => current);
      const reader = createCustomSsoSnapshotRuntime(scope.observer, source);
      const before = await reader.findRuntimeRecord(clientCode);
      expect(before).toEqual(current);

      current = { ...current, customSsoEnabled: false, customSsoConfigVersion: 4 };
      await runCacheRuntimeEntry(
        ["custom-sso-disable", clientCode],
        harness.redisConfig,
      );

      const after = await reader.findRuntimeRecord(clientCode);
      expect(after).toBeNull();
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });

  test("Custom SSO no-ops invalidate Redis without advancing the epoch and repair a committed disable", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("custom-sso-noop");
      const configuration = runtimeClient(clientCode, 3).customSsoConfig!;
      let current: AdminClientRecord = {
        ...oidcAdminClient(clientCode),
        customSsoEnabled: true,
        customSsoConfig: configuration,
        customSsoConfigVersion: 3,
      };
      const source = mock(async () => current);
      const snapshots = createClientRuntimeSnapshotModule({
        redis: scope.observer,
        adapters: [createCustomSsoClientRuntimeSnapshotAdapter({ repository: { findRuntimeRecord: source } })],
      });
      const reader = createCustomSsoClientRuntimeReader(snapshots.reader("custom-sso"));
      let failInvalidation = false;
      const tx = {
        auditService: { recordAuditLog: mock(async () => undefined) },
        clientRepository: {
          lockClientByCode: mock(async () => current),
          updateClientCustomSsoByCode: mock(async (_code: string, update: Partial<AdminClientRecord>) => {
            current = { ...current, ...update, customSsoConfigVersion: current.customSsoConfigVersion + 1 };
            return current;
          }),
        },
      };
      const service = createTestClientService(current, tx, async (code) => {
        if (failInvalidation)
          throw new Error("Injected Custom SSO propagation failure");
        await snapshots.invalidateClient(code);
      });
      const before = await reader.findRuntimeRecord(clientCode);
      const configured = await service.configureClientCustomSso(clientCode, configuration);
      const same = await reader.findRuntimeRecord(clientCode);
      expect(configured.changed).toBe(false);
      expect(configured.result.client.customSsoConfigVersion).toBe(3);
      expect(same).toEqual(before);
      expect(source).toHaveBeenCalledTimes(2);
      expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();

      failInvalidation = true;
      let failure: unknown;
      try {
        await service.disableClientCustomSso(clientCode);
      }
      catch (error) {
        failure = error;
      }
      const stale = await reader.findRuntimeRecord(clientCode);
      expect(failure).toMatchObject({ code: "ADMIN_MUTATION_COMMITTED" });
      expect(current.customSsoEnabled).toBe(false);
      expect(current.customSsoConfigVersion).toBe(4);
      expect(stale).toEqual(before);

      failInvalidation = false;
      const retried = await service.disableClientCustomSso(clientCode);
      const repaired = await reader.findRuntimeRecord(clientCode);
      expect(retried.changed).toBe(false);
      expect(retried.result.client.customSsoConfigVersion).toBe(4);
      expect(repaired).toBeNull();
      expect(source).toHaveBeenCalledTimes(3);
      expect(tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledTimes(1);
    }
    finally {
      await scope.close();
    }
  });

  test("reloads the canonical OIDC Snapshot after a production Admin mutation", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("oidc-mutation");
      let sourceVersion = 1;
      const source = mock(async () => ({ version: sourceVersion }));
      const snapshots = createClientRuntimeSnapshotModule({
        redis: scope.observer,
        adapters: [testOidcAdapter(source)],
      });
      const reader = snapshots.reader("oidc");
      const before = await reader.acquire(clientCode);

      const service = createOidcMutationService({
        clientCode,
        onCommittedVersion(version) {
          sourceVersion = version;
        },
        async invalidateClientRuntime(targetClientCode) {
          await snapshots.invalidateClient(targetClientCode);
        },
      });
      const configuration = { ...oidcConfiguration(), redirectUris: ["https://portal.example.com/new-callback"] };
      const configured = await service.configureClientOidc(clientCode, configuration);
      const after = await reader.acquire(clientCode);

      expect(before).toEqual({ kind: "present", value: { version: 1 } });
      expect(after).toEqual({ kind: "present", value: { version: 2 } });
      expect(source).toHaveBeenCalledTimes(2);
      const unchanged = await service.configureClientOidc(clientCode, configuration);
      const afterNoop = await reader.acquire(clientCode);
      expect(configured.changed).toBe(true);
      expect(unchanged.changed).toBe(false);
      expect(afterNoop).toEqual(after);
      expect(source).toHaveBeenCalledTimes(3);
    }
    finally {
      await scope.close();
    }
  });

  test("keeps the old normal Gate Snapshot on failed propagation until targeted repair", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-propagation");
      let status = ClientStatus.Enable;
      let failInvalidation = true;
      const source = mock(async () => ({ clientCode, isDelete: false, status }));
      const snapshots = createClientRuntimeSnapshotModule({
        redis: scope.observer,
        adapters: [createClientTrafficGateSnapshotAdapter({
          source: { findClientTrafficState: source },
        })],
      });
      const gate = createClientTrafficGateReader(snapshots.reader("traffic-gate"));
      const service = createStatusMutationService({
        clientCode,
        onCommittedStatus(nextStatus) {
          status = nextStatus;
        },
        async invalidateClientRuntime(targetClientCode) {
          if (failInvalidation)
            throw new Error("simulated shared invalidation failure");
          await snapshots.invalidateClient(targetClientCode);
        },
      });

      const before = await gate.check(clientCode);
      let mutationFailure: unknown;
      try {
        await service.updateClientStatus(clientCode, ClientStatus.Maintenance);
      }
      catch (error) {
        mutationFailure = error;
      }
      const acceptedBeforeRepair = await gate.check(clientCode);

      failInvalidation = false;
      await snapshots.invalidateClient(clientCode);
      const afterRepair = await gate.check(clientCode);

      expect(mutationFailure).toMatchObject({ name: "AdminMutationCommittedError" });
      expect(before).toEqual({ outcome: "enabled" });
      expect(acceptedBeforeRepair).toEqual({ outcome: "enabled" });
      expect(afterRepair).toEqual({ outcome: "maintenance" });
      expect(source).toHaveBeenCalledTimes(2);
    }
    finally {
      await scope.close();
    }
  });
});

function testOidcAdapter(source: () => Promise<{ version: number }>) {
  return {
    kind: "oidc" as const,
    presentTtlMs: 60_000,
    async load() {
      return { kind: "present" as const, value: await source() };
    },
    codec: {
      encode: (value: unknown) => value,
      decode(payload: unknown) {
        if (typeof payload !== "object" || payload === null
          || typeof Reflect.get(payload, "version") !== "number") {
          throw new Error("invalid OIDC runtime test payload");
        }
        return { version: Reflect.get(payload, "version") as number };
      },
    },
  };
}

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
          env: createCacheRuntimeEnvironment(temporaryDirectory, redisConfig),
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
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com/*"],
    },
    customSsoConfigVersion,
  };
}

function createCustomSsoSnapshotRuntime(
  redis: Redis,
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
  return createCustomSsoClientRuntimeReader(snapshots.reader("custom-sso"));
}

function createOidcMutationService(input: {
  readonly clientCode: string;
  readonly invalidateClientRuntime: (clientCode: string) => Promise<void>;
  readonly onCommittedVersion: (version: number) => void;
}) {
  let client = oidcAdminClient(input.clientCode);
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    clientRepository: {
      lockClientByCode: mock(async () => client),
      updateClientOidcByCode: mock(async (
        _clientCode: string,
        update: Partial<AdminClientRecord>,
      ) => {
        client = { ...client, ...update, oidcConfigVersion: client.oidcConfigVersion + 1 };
        input.onCommittedVersion(client.oidcConfigVersion);
        return client;
      }),
    },
  };
  return createTestClientService(client, tx, input.invalidateClientRuntime);
}

function createStatusMutationService(input: {
  readonly clientCode: string;
  readonly invalidateClientRuntime: (clientCode: string) => Promise<void>;
  readonly onCommittedStatus: (status: ClientStatus) => void;
}) {
  let client = oidcAdminClient(input.clientCode);
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    clientRepository: {
      lockClientByCode: mock(async () => client),
      updateClientByCode: mock(async (_clientCode: string, update: { status?: ClientStatus }) => {
        client = { ...client, ...update };
        input.onCommittedStatus(client.status);
        return client;
      }),
      updateClientByCodeWithProtocolEpochs: mock(async (
        _clientCode: string,
        update: { status?: ClientStatus },
      ) => {
        client = { ...client, ...update };
        input.onCommittedStatus(client.status);
        return client;
      }),
    },
  };
  return createTestClientService(client, tx, input.invalidateClientRuntime);
}

function createTestClientService(
  client: AdminClientRecord,
  tx: Record<string, unknown>,
  invalidateClientRuntime: (clientCode: string) => Promise<void>,
) {
  const revocation = createAdminSessionRevocationPort({
    sessionKernel: {
      revokePrincipalSession: async () => emptyRevocationSummary(),
      revokeUserSessionsByContext: async () => emptyRevocationSummary(),
      revokeClientProtocol: mock(async () => emptyRevocationSummary()),
      revokeClient: mock(async () => emptyRevocationSummary()),
      prepareUserSessionRevocationByContext: mock(async () => ({ revoke: async () => emptyRevocationSummary() })),
      revokeUserSessionRecords: mock(async () => emptyRevocationSummary()),
    },
    logger: {
      logPreparationFailure: () => undefined,
      logClientAllProtocolsRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logUserRevocation: mock(() => undefined),
    },
  });
  return createClientService({
    clientRepository: {
      getClientByCode: mock(async () => client),
      searchClientsPaged: mock(async () => ({ rows: [client], total: 1 })),
    },
    clientCache: {
      invalidateClient: mock(async () => undefined),
      invalidateUpdatedClient: mock(async () => undefined),
    },
    clientRuntimeInvalidation: { invalidateClient: invalidateClientRuntime },
    clientMutationLogger: { error: mock(() => undefined) },
    sessionRevocation: revocation,
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow: createImmediateUnitOfWork(tx as never),
  });
}

function oidcAdminClient(clientCode: string): AdminClientRecord {
  return {
    id: 7,
    clientCode,
    clientName: clientCode,
    clientSecret: `secret-${clientCode}`,
    url: "https://client.example.com",
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-09-03T00:00:00Z"),
    updateTime: new Date("2026-09-03T00:00:00Z"),
    extAttributes: {},
    oidcEnabled: true,
    oidcConfig: oidcConfiguration(),
    oidcSecretHash: "managed-secret-hash",
    oidcConfigVersion: 1,
    customSsoEnabled: false,
    customSsoConfig: null,
    customSsoSecretHash: null,
    customSsoConfigVersion: 0,
  };
}

function oidcConfiguration() {
  return {
    clientType: OidcClientType.Confidential as const,
    redirectUris: ["https://client.example.com/callback"],
    postLogoutRedirectUris: ["https://client.example.com/logout"],
    allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic as const,
  };
}

function emptyRevocationSummary() {
  return {
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  };
}
