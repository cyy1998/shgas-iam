import { expect, test } from "bun:test";
import process from "node:process";
import { createPostgresTestHarness } from "../../test-integration/support/postgres-harness";

// These failure paths stop before resource creation; real isolation stays in resource contracts.
test.each([{ name: "IAM_TEST_POSTGRES_URL", runtimePrefix: "IAM_DB", create: createPostgresTestHarness }])(
  "$name is required even when runtime configuration is present",
  async ({ name, runtimePrefix, create }) => {
    const overrides: Record<string, string | undefined> = {
      [name]: undefined,
      DATABASE_URL: "postgres://127.0.0.1:1/runtime-sentinel",
      [`${runtimePrefix}_DATABASE_URL`]: "postgres://127.0.0.1:1/runtime-sentinel",
      REDIS_URL: "redis://127.0.0.1:1/0",
      [`${runtimePrefix}_REDIS_URL`]: "redis://127.0.0.1:1/0",
      [`${runtimePrefix}_REDIS_HOST`]: "127.0.0.1",
      [`${runtimePrefix}_REDIS_PORT`]: "1",
      [`${runtimePrefix}_REDIS_DB`]: "0",
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
  },
);
