import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { UnifiedSessionKernelOptions } from "./unified/factory";
import { createUnifiedSessionKernel } from "./unified/factory";
import type { CapturedSession, ClientSession, SessionRecord, UserSession } from "./unified/model";
import { captureIdentity, SessionObservationRequiredError, sessionRecordSchema } from "./unified/model";

const SEED_CLIENT_SESSIONS = `
local prefix, userId, subject, expiresAt = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local function index(key, id)
  redis.call('ZADD', key, expiresAt, id)
  redis.call('PEXPIREAT', key, expiresAt, 'NX')
  redis.call('PEXPIREAT', key, expiresAt, 'GT')
end
for i = 5, #ARGV, 3 do
  local id, clientId, record = ARGV[i], ARGV[i + 1], ARGV[i + 2]
  redis.call('SET', prefix .. 'client:' .. id, record, 'PXAT', expiresAt)
  redis.call('SET', prefix .. 'slot:' .. userId .. ':' .. clientId, id, 'PXAT', expiresAt)
  index(prefix .. 'children:' .. userId, id)
  index(prefix .. 'client-index:' .. clientId, id)
  index(prefix .. 'inventory:clientSession', id)
  index(prefix .. 'subject-clients:' .. subject, id)
end
return (#ARGV - 4) / 3
`;

/** Owner-only real Redis fixture; it never emulates Redis commands or lifecycle transitions. */
export async function createUnifiedSessionRedisTestScope(
  redisUrl: string,
  ttl: { user?: number; client?: number } = {},
  trackStop?: (stop: () => Promise<void>) => void,
) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  let closePromise: Promise<void> | undefined;
  let initialized = false;
  function close() {
    closePromise ??= (async () => {
      const ended =
        redis.status === "end" ? Promise.resolve() : new Promise<void>((resolve) => redis.once("end", resolve));
      try {
        if (initialized && redis.status !== "end") await redis.quit();
      } finally {
        redis.disconnect();
        await ended;
      }
    })();
    return closePromise;
  }
  try {
    trackStop?.(close);
    await redis.ping();
    if (closePromise) throw new Error("Kernel Redis test scope stopped during setup");
    initialized = true;
  } catch (error) {
    try {
      await close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], "Kernel Redis test scope setup failed");
    }
    throw error;
  }
  const namespace = `test:unified:${randomUUID()}`;
  const prefix = `${namespace}:unified:v1:`;
  const operations = new WeakSet<object>();
  let fault: { action: string; after: boolean; remaining: number } | undefined;
  let interception: { action: string; callback: () => Promise<void> } | undefined;
  const adapter = {
    async eval(script: string, keyCount: number, ...args: Array<string | number>) {
      const request: { action: string } = JSON.parse(String(args[1]));
      const currentFault = fault?.action === request.action ? fault : undefined;
      if (currentFault && --currentFault.remaining === 0) fault = undefined;
      if (currentFault && !currentFault.after) throw new Error("Injected Redis transport failure before execution");
      const result = await redis.eval(script, keyCount, ...args);
      if (interception?.action === request.action) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      if (currentFault?.after) throw new Error("Injected Redis response loss after execution");
      return result;
    },
  };
  function assertOperationActive(operation: object) {
    if (!operations.has(operation)) throw new SessionObservationRequiredError();
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
    if (target.kind === "clientSession") return `${prefix}client:${target.id}`;
    const hash = await redis.get(`${prefix}user-id:${target.id}`);
    if (!hash) throw new Error("Fixture UserSession reverse ID missing");
    return `${prefix}user:${hash}`;
  }
  async function inspect(target: CapturedSession) {
    const key = await recordKey(target);
    const raw = await redis.get(key);
    const record = raw ? sessionRecordSchema.parse(JSON.parse(raw)) : null;
    const expiresAt = await redis.pexpiretime(key);
    const relatedKey =
      target.kind === "userSession"
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
    // Aggregate tests supply fresh client IDs and seed storage without exercising the open-session workflow.
    async seedClientSessions(parent: Readonly<UserSession>, clientIds: readonly string[]) {
      if (clientIds.length === 0) return [];
      const createdAt = parent.createdAt;
      const expiresAt = Math.min(parent.expiresAt, createdAt + (ttl.client ?? 1800) * 1000);
      const pipeline = redis.pipeline();
      const records = clientIds.map(
        (clientId): ClientSession => ({
          version: 1,
          kind: "clientSession",
          state: "active",
          instance: randomUUID(),
          clientSessionId: randomUUID(),
          clientId,
          userSessionId: parent.userSessionId,
          parentInstance: parent.instance,
          subjectIdentifier: parent.subjectIdentifier,
          subjectContext: parent.subjectContext,
          protocol: "oidc",
          createdAt,
          authorizedAt: createdAt,
          expiresAt,
        }),
      );
      const batchSize = 500;
      for (let start = 0; start < records.length; start += batchSize) {
        const batch = records.slice(start, start + batchSize);
        pipeline.eval(
          SEED_CLIENT_SESSIONS,
          0,
          prefix,
          parent.userSessionId,
          parent.subjectIdentifier,
          expiresAt,
          ...batch.flatMap((record) => [record.clientSessionId, record.clientId, JSON.stringify(record)]),
        );
      }
      const replies = await pipeline.exec();
      let seeded = 0;
      for (const [error, count] of replies ?? []) {
        if (error) throw error;
        if (typeof count !== "number") throw new Error("Invalid client session seed reply");
        seeded += count;
      }
      if (seeded !== records.length) throw new Error("Incomplete client session seed batch");
      return records.map(captureIdentity);
    },
    inspect,
    async forgetInventory(kind: "userSession" | "clientSession") {
      await redis.del(`${prefix}inventory:${kind}`);
    },
    async forgetChildIndex(userSessionId: string) {
      await redis.del(`${prefix}children:${userSessionId}`);
    },
    async corruptReclamationIndex(target: CapturedSession) {
      const key =
        target.kind === "userSession"
          ? `${prefix}subject:${target.subjectIdentifier}`
          : `${prefix}children:${target.userSessionId}`;
      await redis.set(key, "wrong-type", "EX", 3600);
    },
    async replaceInstance(target: CapturedSession) {
      const key = await recordKey(target);
      const raw = await redis.get(key);
      if (!raw) throw new Error("Fixture target missing");
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
      if (!raw) throw new Error("Fixture target missing");
      await redis.set(key, JSON.stringify({ ...JSON.parse(raw), subjectContext: context }), "KEEPTTL");
    },
    async corruptRecord(target: CapturedSession) {
      const key = await recordKey(target);
      const original = await redis.get(key);
      const expiresAt = await redis.pexpiretime(key);
      if (!original || expiresAt < 0) throw new Error("Fixture target or expiry missing");
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
    close,
  };
}
