import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { destroySingleton, getSingletonKeys } from "@iam/api-core/core/singleton";
import { createOfflineMaintenanceRedis } from "@iam/api-core/maintenance";
import { createRedisClient } from "@iam/api-core/redis";
import { redisUrlString } from "@iam/api-core/redis/config";
import { parseDedicatedRedisTestUrl, runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import Redis from "ioredis";

test("URL credentials select distinct cached HTTP clients and retain the maintenance connection policy", async () => {
  const name = "IAM_API_CORE_TEST_REDIS_URL";
  const value = process.env[name];
  if (!value) throw new Error("Root-managed Redis test resource is required");
  const baseUrl = new URL(value);
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const control = new Redis(parseDedicatedRedisTestUrl({ name, value }));
    registerCleanup(async () => void (await control.quit()));
    const previousKeys = new Set(getSingletonKeys());
    const firstUser = `iam-test-first-${randomUUID()}`;
    const secondUser = `iam-test-second-${randomUUID()}`;
    const firstPassword = `first:password/@%${randomUUID()}`;
    const secondPassword = `second:password/@%${randomUUID()}`;
    registerCleanup(async () => void (await control.acl("DELUSER", firstUser, secondUser)));
    registerCleanup(async () => {
      const keys = getSingletonKeys().filter((key) => !previousKeys.has(key));
      const closed = await Promise.allSettled(keys.map(destroySingleton));
      const failures = closed.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      if (failures.length > 0) throw new AggregateError(failures, "Redis HTTP clients failed to close");
    });

    function config(username: string, password: string) {
      const url = new URL(baseUrl.href);
      url.username = encodeURIComponent(username);
      url.password = encodeURIComponent(password);
      return redisUrlString().parse(url.href);
    }

    await control.acl("SETUSER", firstUser, "on", `>${firstPassword}`, `>${secondPassword}`, "allcommands", "allkeys");
    await control.acl("SETUSER", secondUser, "on", `>${firstPassword}`, "allcommands", "allkeys");
    const firstConfig = config(firstUser, firstPassword);
    const first = createRedisClient(firstConfig);
    const same = createRedisClient({ ...firstConfig });
    const otherUser = createRedisClient(config(secondUser, firstPassword));
    const otherPassword = createRedisClient(config(firstUser, secondPassword));
    const identities = await Promise.all([first.call("ACL", "WHOAMI"), otherUser.call("ACL", "WHOAMI")]);
    const alternatePing = await otherPassword.ping();
    expect(identities).toEqual([firstUser, secondUser]);
    expect(alternatePing).toBe("PONG");
    expect(same).toBe(first);
    expect(otherUser).not.toBe(first);
    expect(otherPassword).not.toBe(first);
    expect(first.options.maxRetriesPerRequest).toBe(20);

    const keys = getSingletonKeys().filter((key) => !previousKeys.has(key));
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      expect(key).not.toContain(firstUser);
      expect(key).not.toContain(secondUser);
      expect(key).not.toContain(firstPassword);
      expect(key).not.toContain(secondPassword);
    }

    const offline = createOfflineMaintenanceRedis(firstConfig, new AbortController().signal);
    registerCleanup(() => offline.close());
    await offline.connect();
    const offlineIdentity = await offline.redis.call("ACL", "WHOAMI");
    expect(offlineIdentity).toBe(firstUser);
    expect(offline.redis.options.maxRetriesPerRequest).toBe(0);
    expect(offline.redis.options.enableOfflineQueue).toBe(false);
  });
});
