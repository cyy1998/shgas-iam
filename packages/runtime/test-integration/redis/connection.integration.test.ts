import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createOfflineMaintenanceRedis } from "@iam/runtime/maintenance";
import { redisUrlString } from "@iam/runtime/redis/config";
import { createRedisClient } from "@iam/runtime/redis/connection";
import Redis from "ioredis";
import { destroySingleton, getSingletonKeys } from "../../src/redis/singleton";

test("URL credentials select distinct cached HTTP clients and retain the maintenance connection policy", async () => {
  const value = process.env.IAM_RUNTIME_TEST_REDIS_URL;
  if (!value) throw new Error("Root-managed Redis test resource is required");
  const baseUrl = new URL(value);
  await using cleanup = new AsyncDisposableStack();
  const control = new Redis(redisUrlString().parse(value));
  cleanup.defer(async () => void (await control.quit()));
  const previousKeys = new Set(getSingletonKeys());
  const firstUser = `iam-test-first-${randomUUID()}`;
  const secondUser = `iam-test-second-${randomUUID()}`;
  const firstPassword = `first:password/@%${randomUUID()}`;
  const secondPassword = `second:password/@%${randomUUID()}`;
  cleanup.defer(async () => void (await control.acl("DELUSER", firstUser, secondUser)));
  cleanup.defer(async () => {
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
  for (const key of keys) {
    expect(key).not.toContain(firstUser);
    expect(key).not.toContain(secondUser);
    expect(key).not.toContain(firstPassword);
    expect(key).not.toContain(secondPassword);
  }

  const offline = createOfflineMaintenanceRedis(firstConfig, new AbortController().signal);
  cleanup.defer(() => offline.close());
  await offline.connect();
  const offlineIdentity = await offline.redis.call("ACL", "WHOAMI");
  expect(offlineIdentity).toBe(firstUser);
  expect(offline.redis.options.maxRetriesPerRequest).toBe(0);
  expect(offline.redis.options.enableOfflineQueue).toBe(false);
});
