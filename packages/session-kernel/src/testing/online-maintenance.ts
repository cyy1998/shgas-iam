import type Redis from "ioredis";
import { createHash, randomUUID } from "node:crypto";
import { createUnifiedSessionKernel } from "../unified/factory";

/** Test-only current inventory and controlled storage faults belong to the Kernel owner. */
export function createSessionMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const prefix = `${namespace}:unified:v1:`;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  function owned(key: string) {
    trackKey(key);
    return key;
  }
  async function put(key: string, value: unknown, ttl = false) {
    owned(key);
    await redis.set(key, typeof value === "string" ? value : JSON.stringify(value));
    if (ttl)
      await redis.pexpire(key, 120000);
    return key;
  }
  return {
    async seedUnified() {
      const kernel = createUnifiedSessionKernel({
        redis,
        namespace,
        userSessionTtlSeconds: 3600,
        clientSessionTtlSeconds: 1800,
        assertOperationActive: () => {},
      }).forOperation({});
      try {
        const root = await kernel.createUserSession({
          subjectIdentifier: randomUUID(),
          subjectContext: "sensitive-fixture",
          amr: ["pwd"],
        });
        const parent = await kernel.resolveUserSession(root.bearer);
        if (parent.status !== "resolved")
          throw new Error("Root fixture unavailable");
        await kernel.openClientSession(parent.value, { clientId: "alpha", protocol: "oidc" });
        const terminal = await kernel.createUserSession({
          subjectIdentifier: randomUUID(),
          subjectContext: "sensitive-fixture",
          amr: [],
        });
        await kernel.revokeObservedUserSession(terminal.observation);
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) {
          if (key.includes(":inventory:") || key.includes(":children:"))
            await redis.del(key);
          else await redis.persist(key);
        }
        return await redis.keys(`${prefix}*`);
      }
      finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedCorruptUnified() {
      const malformed = await put(`${prefix}user:${hash(randomUUID())}`, "sensitive-fixture", true);
      const wrongType = owned(`${prefix}client:${randomUUID()}`);
      await redis.hset(wrongType, "secret", "sensitive-fixture");
      return [malformed, wrongType];
    },
    async seedLargeUnifiedIndex(count: number) {
      const key = owned(`${prefix}inventory:clientSession`);
      const members = Array.from({ length: count }, () => randomUUID());
      await redis.zadd(key, ...members.flatMap(member => [Date.now() + 120000, member]));
      return { count: async () => await redis.zcard(key) };
    },
  };
}
