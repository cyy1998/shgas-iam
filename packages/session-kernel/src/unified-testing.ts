import type { UnifiedSessionKernelOptions } from "./unified/factory";
import type { CapturedSession, SessionRecord } from "./unified/model";
import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";

import { createUnifiedSessionKernel } from "./unified/factory";
import { SessionObservationRequiredError, sessionRecordSchema } from "./unified/model";

/** Owner-only real Redis fixture; it never emulates Redis commands or lifecycle transitions. */
export async function createUnifiedSessionRedisTestScope(
  redisUrl: string,
  ttl: { user?: number; client?: number } = {},
) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  await redis.ping();
  const namespace = `test:unified:${randomUUID()}`;
  const prefix = `${namespace}:unified:v1:`;
  const operations = new WeakSet<object>();
  let fault: { action: string; after: boolean; remaining: number } | undefined;
  let interception: { action: string; callback: () => Promise<void> } | undefined;
  const adapter = {
    async eval(script: string, keyCount: number, ...args: Array<string | number>) {
      const request: { action: string } = JSON.parse(String(args[1]));
      const currentFault = fault?.action === request.action ? fault : undefined;
      if (currentFault && --currentFault.remaining === 0)
        fault = undefined;
      if (currentFault && !currentFault.after)
        throw new Error("Injected Redis transport failure before execution");
      const result = await redis.eval(script, keyCount, ...args);
      if (interception?.action === request.action) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      if (currentFault?.after)
        throw new Error("Injected Redis response loss after execution");
      return result;
    },
  };
  function assertOperationActive(operation: object) {
    if (!operations.has(operation))
      throw new SessionObservationRequiredError();
  }
  function createFactory(
    overrides: Partial<
      Pick<UnifiedSessionKernelOptions<object>, "userSessionTtlSeconds" | "clientSessionTtlSeconds">
    > = {},
  ) {
    return createUnifiedSessionKernel({
      redis: adapter,
      namespace,
      assertOperationActive,
      userSessionTtlSeconds: ttl.user ?? 3600,
      clientSessionTtlSeconds: ttl.client ?? 1800,
      ...overrides,
    });
  }
  async function recordKey(target: CapturedSession) {
    if (target.kind === "clientSession")
      return `${prefix}client:${target.id}`;
    const hash = await redis.get(`${prefix}user-id:${target.id}`);
    if (!hash)
      throw new Error("Fixture UserSession reverse ID missing");
    return `${prefix}user:${hash}`;
  }
  async function inspect(target: CapturedSession) {
    const key = await recordKey(target);
    const raw = await redis.get(key);
    const record = raw ? sessionRecordSchema.parse(JSON.parse(raw)) : null;
    const expiresAt = await redis.pexpiretime(key);
    const relatedKey
      = target.kind === "userSession"
        ? `${prefix}user-id:${target.id}`
        : `${prefix}slot:${target.userSessionId}:${target.clientId}`;
    return {
      record,
      expiresAt,
      relatedExpiresAt: await redis.pexpiretime(relatedKey),
      relatedValue: await redis.get(relatedKey),
    };
  }
  return {
    kernel: createFactory(),
    createFactory,
    createFactoryForOperations<Operation extends object>(assertActive: (operation: Operation) => void) {
      return createUnifiedSessionKernel({
        redis: adapter,
        namespace,
        assertOperationActive: assertActive,
        userSessionTtlSeconds: ttl.user ?? 3600,
        clientSessionTtlSeconds: ttl.client ?? 1800,
      });
    },
    createOperation() {
      const operation = Object.freeze({});
      operations.add(operation);
      return { operation, close: () => operations.delete(operation) };
    },
    failNext(
      action: "create" | "open" | "resolveUser" | "resolveClient" | "revoke" | "capture" | "list",
      after = false,
      count = 1,
    ) {
      fault = { action, after, remaining: count };
    },
    afterNext(
      action: "create" | "open" | "resolveUser" | "resolveClient" | "revoke" | "capture",
      callback: () => Promise<void>,
    ) {
      interception = { action, callback };
    },
    inspect,
    async forgetInventory(kind: "userSession" | "clientSession") {
      await redis.del(`${prefix}inventory:${kind}`);
    },
    async forgetChildIndex(userSessionId: string) {
      await redis.del(`${prefix}children:${userSessionId}`);
    },
    async corruptReclamationIndex(target: CapturedSession) {
      const key
        = target.kind === "userSession"
          ? `${prefix}subject:${target.subjectIdentifier}`
          : `${prefix}children:${target.userSessionId}`;
      await redis.set(key, "wrong-type", "EX", 3600);
    },
    async replaceInstance(target: CapturedSession) {
      const key = await recordKey(target);
      const raw = await redis.get(key);
      if (!raw)
        throw new Error("Fixture target missing");
      const record: SessionRecord = sessionRecordSchema.parse(JSON.parse(raw));
      record.instance = randomUUID();
      await redis.set(key, JSON.stringify(record), "KEEPTTL");
      return record;
    },
    async removeRecord(target: CapturedSession) {
      await redis.del(await recordKey(target));
    },
    async replaceSubjectContext(target: CapturedSession, context: unknown) {
      const key = await recordKey(target);
      const raw = await redis.get(key);
      if (!raw)
        throw new Error("Fixture target missing");
      await redis.set(key, JSON.stringify({ ...JSON.parse(raw), subjectContext: context }), "KEEPTTL");
    },
    async corruptRecord(target: CapturedSession) {
      const key = await recordKey(target);
      const original = await redis.get(key);
      const expiresAt = await redis.pexpiretime(key);
      if (!original || expiresAt < 0)
        throw new Error("Fixture target or expiry missing");
      await redis.set(key, "broken", "KEEPTTL");
      return async () => {
        await redis.set(key, original, "PXAT", expiresAt);
      };
    },
    async countRecords() {
      return (await redis.keys(`${prefix}user:*`)).length + (await redis.keys(`${prefix}client:*`)).length;
    },
    async bearerStored(bearer: string) {
      const hash = createHash("sha256").update(bearer).digest("hex");
      return await redis.get(`${prefix}user:${hash}`);
    },
    async close() {
      try {
        const keys = await redis.keys(`${namespace}:*`);
        if (keys.length)
          await redis.del(...keys);
      }
      finally {
        redis.disconnect();
      }
    },
  };
}
