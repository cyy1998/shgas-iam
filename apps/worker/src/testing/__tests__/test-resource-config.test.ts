import { expect, test } from "bun:test";
import process from "node:process";
import { createWorkerPostgresTestHarness } from "~worker/test-integration/support/postgres-test-harness";
import {
  createWorkerRedisTestHarness,
  resolveWorkerRedisTestUrl,
} from "~worker/test-integration/support/redis-test-harness";

// These failure paths stop before resource creation; real isolation stays in resource contracts.
test.each([
  { name: "IAM_WORKER_TEST_DATABASE_URL", create: createWorkerPostgresTestHarness },
  { name: "IAM_WORKER_TEST_REDIS_URL", create: createWorkerRedisTestHarness },
])("$name is required even when runtime configuration is present", async ({ name, create }) => {
  const runtimePrefix = name.replace(/_TEST_(DATABASE|REDIS)_URL$/u, "");
  const overrides: Record<string, string | undefined> = {
    [name]: undefined,
    DATABASE_URL: "postgres://127.0.0.1:1/runtime-sentinel",
    [`${runtimePrefix}_DATABASE_URL`]: "postgres://127.0.0.1:1/runtime-sentinel",
    REDIS_URL: "redis://127.0.0.1:1/0",
    [`${runtimePrefix}_REDIS_URL`]: "redis://127.0.0.1:1/0",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  let harness: Awaited<ReturnType<typeof create>> | undefined;
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    let error: unknown;
    try {
      harness = await create();
    } catch (failure) {
      error = failure;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(name);
  } finally {
    try {
      await harness?.close();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
});

test("Redis test resources cannot identify the runtime database with different credentials or omitted defaults", () => {
  expect(() =>
    resolveWorkerRedisTestUrl({
      IAM_WORKER_TEST_REDIS_URL: "redis://test-user:test-secret@LOCALHOST/0",
      IAM_WORKER_REDIS_URL: "redis://runtime-user:runtime-secret@localhost:6379",
    }),
  ).toThrow("must not identify the Worker runtime Redis resource");
});

test("Redis test resources retain a distinct database and its complete credentials", () => {
  const testUrl = "redis://test-user:p%40ss%3Aword@[::1]:6379/1";
  expect(
    resolveWorkerRedisTestUrl({
      IAM_WORKER_TEST_REDIS_URL: testUrl,
      IAM_WORKER_REDIS_URL: "redis://runtime-user:runtime-secret@[::1]:6379/0",
    }),
  ).toBe(testUrl);
});
