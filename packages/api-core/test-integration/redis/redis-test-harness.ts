import type { AuthorizationGrantRedemption } from "../../src/authorization-grant";
import type { LoginRestriction } from "../../src/login-restriction";
import type {
  CleanupAdapter,
  SessionKernel,
  SessionKernelRedis,
} from "../../src/session/kernel";
import type {
  SubjectAccessBarrier,
  SubjectAccessBootstrap,
} from "../../src/subject-access";
import type { SubjectAccessAtomicStore } from "../../src/subject-access/store";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import {
  createAuthorizationGrantRedemption,
  createRedisAuthorizationGrantRedemptionStore,
} from "../../src/authorization-grant";
import {
  createLoginRestriction,
  createRedisLoginRestrictionStore,
} from "../../src/login-restriction";
import {
  createSessionKernel,
  createSessionKernelConfig,
  createSessionKernelKeyBuilder,
  encodeIndexMember,
} from "../../src/session/kernel";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
} from "../../src/subject-access";

const TEST_REDIS_URL_ENV = "IAM_API_CORE_TEST_REDIS_URL";
const OBSERVER_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export interface RedisTestScope {
  readonly writer: LoginRestriction;
  readonly observer: LoginRestriction;
  readonly close: () => Promise<void>;
}

export interface RedisTestHarness {
  readonly createScope: () => Promise<RedisTestScope>;
  readonly createAuthorizationGrantScope: (input: {
    readonly leaseDurationMs: number;
    readonly observerAttemptIds: readonly string[];
    readonly writerAttemptIds: readonly string[];
  }) => Promise<AuthorizationGrantRedisTestScope>;
  readonly createSessionKernelScope: (input?: {
    cleanupAdapters?: CleanupAdapter[];
  }) => Promise<SessionKernelRedisTestScope>;
  readonly createSubjectAccessScope: (input: {
    writerTransitionIds: readonly string[];
    observerTransitionIds: readonly string[];
  }) => Promise<SubjectAccessRedisTestScope>;
  readonly close: () => Promise<void>;
}

export interface AuthorizationGrantRedisTestScope {
  readonly writer: AuthorizationGrantRedemption;
  readonly observer: AuthorizationGrantRedemption;
  readonly close: () => Promise<void>;
}

export interface SubjectAccessRedisTestScope {
  readonly bootstrap: SubjectAccessBootstrap;
  readonly writer: SubjectAccessBarrier;
  readonly observer: SubjectAccessBarrier;
  readonly writerBacklog: Pick<
    SubjectAccessAtomicStore,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly observerBacklog: Pick<
    SubjectAccessAtomicStore,
    | "claimRepairSubject"
    | "finalize"
    | "finalizeRepairSubject"
    | "inspectRepairBacklog"
    | "prepareRepair"
    | "rescheduleRepairSubject"
  >;
  readonly seedRepairIndex: (
    subjectIdentifiers: readonly string[],
    score?: number,
  ) => Promise<void>;
  readonly seedRepairAgeIndex: (
    subjectIdentifiers: readonly string[],
    score?: number,
  ) => Promise<void>;
  readonly removeRepairAgeEntry: (
    subjectIdentifier: string,
  ) => Promise<void>;
  readonly seedRecord: (
    subjectIdentifier: string,
    serializedRecord: string,
  ) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface SessionKernelRedisTestScope {
  readonly writer: SessionKernel;
  readonly observer: SessionKernel;
  readonly ambiguousWriter: SessionKernel;
  readonly failNextCredentialCreateAfterCommit: () => void;
  readonly cleanupTombstoneTtl: (input: {
    id: string;
    kind: "artifact" | "client_binding" | "credential";
  }) => Promise<number>;
  readonly activeObjectExists: (input: {
    id: string;
    kind: "artifact" | "client_binding" | "credential" | "principal_session";
  }) => Promise<boolean>;
  readonly recreateObjectBeforeNextInactiveIndexRemoval: () => void;
  readonly replaceObjectBeforeNextRevoke: () => void;
  readonly replaceTombstoneBeforeNextFinalize: () => void;
  readonly pauseNextPrincipalValidation: () => {
    reached: Promise<void>;
    release: () => void;
  };
  readonly seedClientProtocolIndexMember: (input: {
    clientCode: string;
    id: string;
    kind: "artifact" | "client_binding" | "credential";
    protocol: string;
  }) => Promise<void>;
  readonly replaceArtifactPayloadBeforeNextValidation: (input: {
    artifactId: string;
    serializedPayload: string;
  }) => void;
  readonly close: () => Promise<void>;
}

export async function createRedisTestHarness(): Promise<RedisTestHarness> {
  const redisUrl = requireDedicatedRedisTestUrl();
  const cleanupRedis = createRedisClient(redisUrl);

  try {
    await connectRedis(cleanupRedis);
  }
  catch (error) {
    cleanupRedis.disconnect();
    throw error;
  }

  return {
    async createAuthorizationGrantScope(input) {
      const keyPrefix = `iam:test:authorization-grant:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(writerRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        writerRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      const writer = createAuthorizationGrantClient({
        attemptIds: input.writerAttemptIds,
        keyPrefix,
        leaseDurationMs: input.leaseDurationMs,
        redis: writerRedis,
      });
      const observer = createAuthorizationGrantClient({
        attemptIds: input.observerAttemptIds,
        keyPrefix,
        leaseDurationMs: input.leaseDurationMs,
        redis: observerRedis,
      });
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close Authorization Grant Redis test scope",
        keyPrefix,
      });

      return {
        close,
        observer,
        writer,
      };
    },
    async createScope() {
      const keyPrefix = `iam:test:login-restriction:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(writerRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        writerRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      const writer = createLoginRestrictionClient({
        clock: { now: Date.now },
        keyPrefix,
        redis: writerRedis,
      });
      const observer = createLoginRestrictionClient({
        clock: { now: () => Date.now() - OBSERVER_CLOCK_SKEW_MS },
        keyPrefix,
        redis: observerRedis,
      });
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close LoginRestriction Redis test scope",
        keyPrefix,
      });

      return {
        close,
        observer,
        writer,
      };
    },
    async createSessionKernelScope(input = {}) {
      const keyPrefix = `iam:test:session-kernel:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(writerRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        writerRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      let beforeNextArtifactValidation: (() => Promise<void>) | undefined;
      let beforeNextPrincipalValidation: (() => Promise<void>) | undefined;
      let recreateObjectBeforeNextInactiveIndexRemoval = false;
      let replaceObjectBeforeNextRevoke = false;
      let replaceTombstoneBeforeNextFinalize = false;
      let failNextCredentialCreateAfterCommit = false;
      const ambiguousWriter = createSessionKernelClient(
        createCommitThenErrorRedis(writerRedis, () => {
          if (!failNextCredentialCreateAfterCommit)
            return false;
          failNextCredentialCreateAfterCommit = false;
          return true;
        }),
        keyPrefix,
      );
      const writerRedisWithHooks = new Proxy(writerRedis, {
        get(target, property) {
          if (property === "eval") {
            return async (script: string, keyCount: number, ...args: Array<string | number>) => {
              if (
                recreateObjectBeforeNextInactiveIndexRemoval
                && script.includes("remove_index_member_if_object_inactive")
              ) {
                recreateObjectBeforeNextInactiveIndexRemoval = false;
                await target.set(String(args[0]), "concurrent replacement");
              }
              if (
                replaceObjectBeforeNextRevoke
                && script.includes("session-kernel-revoke-active-object-v1")
              ) {
                replaceObjectBeforeNextRevoke = false;
                const key = String(args[0]);
                const current = await target.get(key);
                if (!current)
                  throw new Error("expected active object before concurrent replacement");
                const replacement = JSON.parse(current) as Record<string, unknown>;
                replacement.metadata = { concurrentReplacement: true };
                await target.set(key, JSON.stringify(replacement), "KEEPTTL");
              }
              if (
                replaceTombstoneBeforeNextFinalize
                && script.includes("session-kernel-finalize-cleanup-pending-v1")
              ) {
                replaceTombstoneBeforeNextFinalize = false;
                const key = String(args[0]);
                const current = await target.get(key);
                if (!current)
                  throw new Error("expected tombstone before concurrent replacement");
                const replacement = JSON.parse(current) as {
                  expiresAt: number;
                  revokedAt: number;
                };
                replacement.expiresAt += 1;
                replacement.revokedAt += 1;
                await target.set(key, JSON.stringify(replacement));
              }
              return await target.eval(script, keyCount, ...args);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as SessionKernelRedis;
      const writer = createSessionKernelClient(
        writerRedisWithHooks,
        keyPrefix,
        async () => {
          const pending = beforeNextArtifactValidation;
          beforeNextArtifactValidation = undefined;
          await pending?.();
        },
        input.cleanupAdapters,
        async () => {
          const pending = beforeNextPrincipalValidation;
          beforeNextPrincipalValidation = undefined;
          await pending?.();
        },
      );
      const observer = createSessionKernelClient(
        observerRedis,
        keyPrefix,
        undefined,
        input.cleanupAdapters,
      );
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close Session Kernel Redis test scope",
        keyPrefix,
      });

      return {
        async activeObjectExists(input) {
          return await observerRedis.get(
            createSessionKernelKeyBuilder(keyPrefix).active(input.kind, input.id),
          ) !== null;
        },
        ambiguousWriter,
        async cleanupTombstoneTtl(tombstone) {
          return await writerRedis.pttl(
            createSessionKernelKeyBuilder(keyPrefix).tombstone(tombstone.kind, tombstone.id),
          );
        },
        close,
        failNextCredentialCreateAfterCommit() {
          failNextCredentialCreateAfterCommit = true;
        },
        observer,
        recreateObjectBeforeNextInactiveIndexRemoval() {
          recreateObjectBeforeNextInactiveIndexRemoval = true;
        },
        replaceObjectBeforeNextRevoke() {
          replaceObjectBeforeNextRevoke = true;
        },
        replaceTombstoneBeforeNextFinalize() {
          replaceTombstoneBeforeNextFinalize = true;
        },
        pauseNextPrincipalValidation() {
          let markReached = () => {};
          let release = () => {};
          const reached = new Promise<void>((resolve) => {
            markReached = resolve;
          });
          const released = new Promise<void>((resolve) => {
            release = resolve;
          });
          beforeNextPrincipalValidation = async () => {
            markReached();
            await released;
          };
          return { reached, release };
        },
        writer,
        replaceArtifactPayloadBeforeNextValidation(input) {
          const key = createSessionKernelKeyBuilder(keyPrefix).active(
            "artifact",
            input.artifactId,
          );
          beforeNextArtifactValidation = async () => {
            await writerRedis.set(key, input.serializedPayload);
          };
        },
        async seedClientProtocolIndexMember(index) {
          const key = createSessionKernelKeyBuilder(keyPrefix).index.clientProtocol(
            index.clientCode,
            index.protocol,
          );
          await writerRedis.zadd(
            key,
            Date.now() + 30_000,
            encodeIndexMember(index.kind, index.id),
          );
        },
      };
    },
    async createSubjectAccessScope(input) {
      const keyPrefix = `iam:test:subject-access:${randomUUID()}:`;
      const writerRedis = createRedisClient(redisUrl);
      const observerRedis = createRedisClient(redisUrl);

      try {
        await Promise.all([
          connectRedis(writerRedis),
          connectRedis(observerRedis),
        ]);
      }
      catch (error) {
        writerRedis.disconnect();
        observerRedis.disconnect();
        throw error;
      }

      const writerClient = createSubjectAccessClient({
        keyPrefix,
        redis: writerRedis,
        transitionIds: input.writerTransitionIds,
      });
      const observerClient = createSubjectAccessClient({
        keyPrefix,
        redis: observerRedis,
        transitionIds: input.observerTransitionIds,
      });
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close Subject Access Redis test scope",
        keyPrefix,
      });

      return {
        bootstrap: createSubjectAccessBootstrap({
          keyPrefix,
          random: { uuid: randomUUID },
          redis: writerRedis,
        }),
        close,
        observer: observerClient.barrier,
        observerBacklog: observerClient.backlog,
        async seedRepairIndex(subjectIdentifiers, score = 0) {
          if (subjectIdentifiers.length === 0)
            return;
          await writerRedis.zadd(
            `${keyPrefix}idx:repair`,
            ...subjectIdentifiers.flatMap(subject => [score, subject]),
          );
        },
        async seedRepairAgeIndex(subjectIdentifiers, score = 0) {
          if (subjectIdentifiers.length === 0)
            return;
          await writerRedis.zadd(
            `${keyPrefix}idx:repair:age`,
            ...subjectIdentifiers.flatMap(subject => [score, subject]),
          );
        },
        async removeRepairAgeEntry(subjectIdentifier) {
          await writerRedis.zrem(
            `${keyPrefix}idx:repair:age`,
            subjectIdentifier,
          );
        },
        async seedRecord(subjectIdentifier, serializedRecord) {
          await writerRedis.set(
            `${keyPrefix}record:${subjectIdentifier}`,
            serializedRecord,
          );
        },
        writer: writerClient.barrier,
        writerBacklog: writerClient.backlog,
      };
    },
    async close() {
      await cleanupRedis.quit();
    },
  };
}

function createRedisTestScopeCloser(input: {
  cleanupRedis: Redis;
  clients: readonly Redis[];
  errorMessage: string;
  keyPrefix: string;
}) {
  let closed = false;
  return async function close() {
    if (closed)
      return;
    closed = true;

    const errors: unknown[] = [];
    const closeResults = await Promise.allSettled(
      input.clients.map(client => client.quit()),
    );
    for (const result of closeResults) {
      if (result.status === "rejected")
        errors.push(result.reason);
    }

    try {
      await deleteOwnedKeys(input.cleanupRedis, input.keyPrefix);
    }
    catch (error) {
      errors.push(error);
    }

    if (errors.length > 0)
      throw new AggregateError(errors, input.errorMessage);
  };
}

function createAuthorizationGrantClient(input: {
  attemptIds: readonly string[];
  keyPrefix: string;
  leaseDurationMs: number;
  redis: Redis;
}) {
  let attemptIndex = 0;
  return createAuthorizationGrantRedemption({
    leaseDurationMs: input.leaseDurationMs,
    random: {
      uuid() {
        const attemptId = input.attemptIds[attemptIndex];
        if (attemptId === undefined)
          throw new Error("Authorization Grant Redis test attempt ID fixture exhausted");
        attemptIndex += 1;
        return attemptId;
      },
    },
    store: createRedisAuthorizationGrantRedemptionStore({
      keyPrefix: input.keyPrefix,
      redis: input.redis,
    }),
  });
}

function createSubjectAccessClient(input: {
  keyPrefix: string;
  redis: Redis;
  transitionIds: readonly string[];
}) {
  let transitionIdIndex = 0;
  const backlog = createRedisSubjectAccessStore({
    keyPrefix: input.keyPrefix,
    redis: input.redis,
  });
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: {
      uuid() {
        const transitionId = input.transitionIds[transitionIdIndex];
        if (transitionId === undefined)
          throw new Error("Subject Access Redis test transition ID fixture exhausted");
        transitionIdIndex += 1;
        return transitionId;
      },
    },
    store: backlog,
  });
  return { backlog, barrier };
}

function createSessionKernelClient(
  redis: SessionKernelRedis,
  namespace: string,
  beforeArtifactValidation?: () => Promise<void>,
  cleanupAdapters?: CleanupAdapter[],
  beforePrincipalValidation?: () => Promise<void>,
) {
  return createSessionKernel({
    cleanupAdapters,
    config: createSessionKernelConfig({
      lookupHmacKeys: {
        current: {
          id: "redis-test-current",
          secret: "session-kernel-redis-test-secret-0000000000000000",
        },
      },
      namespace,
      principalAbsoluteTtlMs: 60_000,
      principalIdleTtlMs: 30_000,
    }),
    principalAccessFence: {
      capture: async () => "00000000-0000-4000-8000-000000000002",
      validate: async () => {
        await beforePrincipalValidation?.();
        return { ok: true };
      },
    },
    validationHooks: beforeArtifactValidation
      ? {
          validateClient: async (object) => {
            if ("artifactId" in object)
              await beforeArtifactValidation();
            return { ok: true };
          },
        }
      : undefined,
    redis,
  });
}

function createCommitThenErrorRedis(
  redis: Redis,
  shouldFailAfterCommit: () => boolean,
): SessionKernelRedis {
  return new Proxy(redis, {
    get(target, property) {
      if (property === "eval") {
        return async (...args: Parameters<NonNullable<SessionKernelRedis["eval"]>>) => {
          const result = await target.eval(...args);
          if (shouldFailAfterCommit())
            throw new Error("simulated connection loss after Redis commit");
          return result;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as SessionKernelRedis;
}

function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
}

async function connectRedis(redis: Redis) {
  await redis.connect();
  await redis.ping();
}

function createLoginRestrictionClient(input: {
  clock: {
    now: () => number;
  };
  keyPrefix: string;
  redis: Redis;
}) {
  return createLoginRestriction({
    clock: input.clock,
    random: { uuid: randomUUID },
    store: createRedisLoginRestrictionStore({
      keyPrefix: input.keyPrefix,
      redis: input.redis,
    }),
  });
}

function requireDedicatedRedisTestUrl() {
  const redisUrl = process.env[TEST_REDIS_URL_ENV];
  if (!redisUrl) {
    throw new Error(
      `${TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`,
    );
  }

  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${TEST_REDIS_URL_ENV} must use the redis or rediss protocol`);

  return redisUrl;
}

async function deleteOwnedKeys(redis: Redis, keyPrefix: string) {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${keyPrefix}*`,
      "COUNT",
      100,
    );
    cursor = nextCursor;
    if (keys.length > 0)
      await redis.unlink(...keys);
  } while (cursor !== "0");
}
