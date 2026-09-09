import type {
  CleanupAdapter,
  PrincipalRef,
  SessionKernel,
  SessionKernelConfigInput,
  SessionKernelLogger,
  SessionKernelRedis,
} from "../index";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import {
  createSessionKernel,
  createSessionKernelConfig,
} from "../index";
import { createSessionKernelKeyBuilder, encodeIndexMember } from "../storage/keys";

export interface RedisTestHarness {
  readonly createSessionKernelScope: (input?: {
    cleanupAdapters?: CleanupAdapter[];
    logger?: SessionKernelLogger;
    writerClock?: { now: () => number };
    observerClock?: { now: () => number };
    lifetime?: Pick<SessionKernelConfigInput, "principalIdleTtlMs" | "principalAbsoluteTtlMs" | "tombstoneTtlMs" | "tombstoneGraceMs">;
  }) => Promise<SessionKernelRedisTestScope>;
  readonly close: () => Promise<void>;
}
export interface SessionKernelRedisTestScope {
  readonly namespace: string;
  readonly redisNow: () => Promise<number>;
  readonly writer: SessionKernel;
  readonly observer: SessionKernel;
  readonly ambiguousWriter: SessionKernel;
  readonly failNextCredentialCreateAfterCommit: () => void;
  readonly failNextUserIndexRead: () => void;
  readonly failNextPrincipalRevoke: () => void;
  readonly seedPrincipalPayload: (id: string, payload: string) => Promise<void>;
  readonly seedUserIndexMember: (principal: PrincipalRef, member: string) => Promise<void>;
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
  readonly pauseNextLifecycleObservation: (kind?: "principal_session" | "artifact") => {
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
export async function createSessionKernelRedisTestHarness(redisUrl: string): Promise<RedisTestHarness> {
  const cleanupRedis = createRedisClient(redisUrl);

  try {
    await connectRedis(cleanupRedis);
  }
  catch (error) {
    cleanupRedis.disconnect();
    throw error;
  }

  return {
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
      let pausedObjectCode = "p";
      let afterNextLifecycleObservation: (() => Promise<void>) | undefined;
      let recreateObjectBeforeNextInactiveIndexRemoval = false;
      let replaceObjectBeforeNextRevoke = false;
      let replaceTombstoneBeforeNextFinalize = false;
      let failNextCredentialCreateAfterCommit = false;
      let failNextUserIndexRead = false;
      let failNextPrincipalRevoke = false;
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
          if (property === "zrange") {
            return async (...args: Parameters<Redis["zrange"]>) => {
              if (failNextUserIndexRead) {
                failNextUserIndexRead = false;
                throw new Error("simulated user index read failure");
              }
              return await target.zrange(...args);
            };
          }
          if (property === "eval") {
            return async (script: string, keyCount: number, ...args: Array<string | number>) => {
              if (failNextPrincipalRevoke && script.includes("session-kernel-revoke-active-object-v1")) {
                failNextPrincipalRevoke = false;
                throw new Error("simulated principal revocation failure");
              }
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
              const result = await target.eval(script, keyCount, ...args);
              if (script.includes("session-kernel-observe-v1") && String(args[0]).includes(`:active:${pausedObjectCode}:`)) {
                const pending = afterNextLifecycleObservation;
                afterNextLifecycleObservation = undefined;
                await pending?.();
              }
              return result;
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
        input.logger,
        { ...input.lifetime, clock: input.writerClock },
      );
      const observer = createSessionKernelClient(
        observerRedis,
        keyPrefix,
        undefined,
        input.cleanupAdapters,
        input.logger,
        { ...input.lifetime, clock: input.observerClock },
      );
      const close = createRedisTestScopeCloser({
        cleanupRedis,
        clients: [writerRedis, observerRedis],
        errorMessage: "Failed to close Session Kernel Redis test scope",
        keyPrefix,
      });

      return {
        namespace: keyPrefix,
        async redisNow() {
          const [seconds, micros] = await observerRedis.time();
          return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
        },
        failNextUserIndexRead() {
          failNextUserIndexRead = true;
        },
        failNextPrincipalRevoke() {
          failNextPrincipalRevoke = true;
        },
        async seedPrincipalPayload(id, payload) {
          await writerRedis.set(createSessionKernelKeyBuilder(keyPrefix).active("principal_session", id), payload);
        },
        async seedUserIndexMember(principal, member) {
          await writerRedis.zadd(
            createSessionKernelKeyBuilder(keyPrefix).index.user(principal),
            Date.now() + 30_000,
            member,
          );
        },
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
        pauseNextLifecycleObservation(kind = "principal_session") {
          pausedObjectCode = kind === "principal_session" ? "p" : "a";
          let markReached = () => {};
          let release = () => {};
          const reached = new Promise<void>((resolve) => {
            markReached = resolve;
          });
          const released = new Promise<void>((resolve) => {
            release = resolve;
          });
          afterNextLifecycleObservation = async () => {
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

function createSessionKernelClient(
  redis: SessionKernelRedis,
  namespace: string,
  beforeArtifactValidation?: () => Promise<void>,
  cleanupAdapters?: CleanupAdapter[],
  logger?: SessionKernelLogger,
  config: Partial<Pick<SessionKernelConfigInput, "clock" | "principalIdleTtlMs" | "principalAbsoluteTtlMs" | "tombstoneTtlMs" | "tombstoneGraceMs">> = {},
) {
  const kernel = createSessionKernel({
    cleanupAdapters,
    logger,
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
      ...config,
    }),
    redis,
  });
  return {
    ...kernel,
    async resolveProtocolArtifact(...args: Parameters<SessionKernel["resolveProtocolArtifact"]>) {
      const result = await kernel.resolveProtocolArtifact(...args);
      await beforeArtifactValidation?.();
      return result;
    },
  };
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
          if (args[0].includes("session-kernel-create-credential-v1") && shouldFailAfterCommit())
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

export async function waitForRedisCondition(observe: () => Promise<boolean>, message: string) {
  const deadline = performance.now() + 4_000;
  while (performance.now() < deadline) {
    if (await observe())
      return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(message);
}
