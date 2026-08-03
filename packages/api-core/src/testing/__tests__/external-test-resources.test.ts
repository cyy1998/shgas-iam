import { expect, test } from "bun:test";
import {
  cleanupRedisKeysAddedSince,
  parseDedicatedRedisTestUrl,
  requireDedicatedPostgresTestUrl,
  requireExternalTestUrl,
  runWithOwnedTestResources,
} from "../external-test-resources";

test("preserves the body failure while attempting every owned resource cleanup", async () => {
  const bodyFailure = new Error("body failed");
  const firstCleanupFailure = new Error("first cleanup failed");
  const thirdCleanupFailure = new Error("third cleanup failed");
  const attempted: string[] = [];
  let caught: unknown;

  try {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      registerCleanup(async () => {
        attempted.push("first");
        throw firstCleanupFailure;
      });
      registerCleanup(async () => {
        attempted.push("second");
      });
      registerCleanup(async () => {
        attempted.push("third");
        throw thirdCleanupFailure;
      });
      throw bodyFailure;
    });
  }
  catch (error) {
    caught = error;
  }

  expect({
    attempted,
    errors: caught instanceof AggregateError ? caught.errors : [],
    isAggregate: caught instanceof AggregateError,
  }).toEqual({
    attempted: ["third", "second", "first"],
    errors: [bodyFailure, thirdCleanupFailure, firstCleanupFailure],
    isAggregate: true,
  });
});

test("continues deleting later Redis inventory batches after one batch fails", async () => {
  const existingKeys = new Set(["existing"]);
  const addedKeys = Array.from(
    { length: 202 },
    (_, index) => `added-${index.toString().padStart(3, "0")}`,
  );
  const allKeys = ["existing", ...addedKeys];
  const attempted: string[][] = [];
  const batchFailure = new Error("first batch failed");
  const redis = {
    async removeKeys(keys: readonly string[]) {
      attempted.push([...keys]);
      if (attempted.length === 1)
        throw batchFailure;
      return keys.length;
    },
    async scanPage(cursor: string) {
      return cursor === "0"
        ? ["1", allKeys.slice(0, 101)] as [string, string[]]
        : ["0", allKeys.slice(101)] as [string, string[]];
    },
  };
  let caught: unknown;

  try {
    await cleanupRedisKeysAddedSince(redis, existingKeys);
  }
  catch (error) {
    caught = error;
  }

  expect({
    attempted: attempted.map(batch => batch.length),
    caught,
  }).toEqual({
    attempted: [100, 100, 2],
    caught: batchFailure,
  });
});

test("rejects rediss when the production Redis configuration cannot carry TLS", () => {
  const name = "IAM_EXAMPLE_TEST_REDIS_URL";
  let redissFailure: unknown;
  try {
    parseDedicatedRedisTestUrl({
      name,
      value: "rediss://localhost:6380/12",
    });
  }
  catch (error) {
    redissFailure = error;
  }

  expect({
    redissMessage: redissFailure instanceof Error
      ? redissFailure.message
      : null,
    redis: parseDedicatedRedisTestUrl({
      name,
      value: "redis://:password@redis.test:6380/12",
    }),
  }).toEqual({
    redissMessage:
      `${name} does not support rediss because the production Redis configuration has no TLS settings; use redis with a dedicated test resource`,
    redis: {
      db: 12,
      host: "redis.test",
      password: "password",
      port: 6380,
    },
  });
});

test("requires a dedicated PostgreSQL URL without falling back to a runtime database", () => {
  const name = "IAM_EXAMPLE_TEST_DATABASE_URL";
  const lane = "the explicit example external lane";
  const missing = captureErrorMessage(() => requireExternalTestUrl({
    environment: {},
    lane,
    name,
  }));
  const value = requireExternalTestUrl({
    environment: { [name]: "postgres://test@db.test/dedicated" },
    lane,
    name,
  });
  const runtimeIdentity = captureErrorMessage(() =>
    requireDedicatedPostgresTestUrl({
      forbidden: [{
        name: "IAM_EXAMPLE_DATABASE_URL",
        value: "postgresql://runtime-secret@db.test:5432/dedicated",
      }],
      name,
      value: "postgres://test-secret@DB.TEST/dedicated",
    }));

  expect({ missing, runtimeIdentity, value }).toEqual({
    missing:
      `${name} is required for ${lane}; provide dedicated disposable test resources`,
    runtimeIdentity:
      `${name} must not identify the same database as IAM_EXAMPLE_DATABASE_URL`,
    value: "postgres://test@db.test/dedicated",
  });
});

function captureErrorMessage(operation: () => unknown) {
  try {
    operation();
    return null;
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
