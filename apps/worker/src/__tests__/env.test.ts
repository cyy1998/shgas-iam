import { beforeAll, describe, expect, test } from "bun:test";

type ParseWorkerEnv = typeof import("../env").parseWorkerEnv;

let parseWorkerEnv: ParseWorkerEnv;

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_WORKER_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_WORKER_REDIS_HOST: "localhost",
    IAM_WORKER_REDIS_PORT: "6379",
    IAM_WORKER_REDIS_DB: "0",
  };
}

describe("worker environment", () => {
  beforeAll(async () => {
    Object.assign(process.env, validEnv());
    ({ parseWorkerEnv } = await import("../env"));
  });

  test("runtime rejects a queue namespace unavailable to formal source producers", () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    for (const parse of [parseWorkerEnv]) {
      expect(() =>
        parse({
          ...validEnv(),
          IAM_WORKER_DATABASE_URL: "postgresql://iam:password@different-host/iam",
          IAM_WORKER_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "isolated-but-unconsumed",
        }),
      ).toThrow("Organization Search queue prefix is fixed to iam");
    }
    expect(process.env.DATABASE_URL).toBe(previousDatabaseUrl);
  });

  test("exports grouped runtime config from IAM_WORKER raw env", () => {
    const env = parseWorkerEnv({
      ...validEnv(),
      IAM_WORKER_ENABLED_MODULES: "user-document",
      IAM_WORKER_HTTP_PORT: "30003",
      IAM_WORKER_BULL_BOARD_ENABLED: "true",
      IAM_WORKER_BULL_BOARD_USERNAME: "ops",
      IAM_WORKER_BULL_BOARD_PASSWORD: "secret",
      IAM_WORKER_BULL_BOARD_READ_ONLY: "false",
      IAM_WORKER_USER_DOCUMENT_CONCURRENCY: "4",
      IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE: "25",
      IAM_WORKER_USER_DOCUMENT_REPAIR_STALE_SECONDS: "600",
    });

    expect(env.databaseUrl).toBe("postgresql://iam:password@localhost/iam");
    expect(env.redis.host).toBe("localhost");
    expect(env.modules.enabled).toEqual({ mode: "list", keys: ["user-document"] });
    expect(env.dashboard.enabled).toBe(true);
    expect(env.dashboard.readOnly).toBe(false);
    expect(env.userDocument).toEqual({
      concurrency: 4,
      rebuildBatchSize: 25,
      repairStaleSeconds: 600,
      repair: { enabled: false, intervalMs: 60_000, limit: 500, deadlineMs: 30_000 },
    });
    expect(env.organizationDocument).toEqual({
      concurrency: 2,
      repairStaleSeconds: 300,
      repair: { enabled: false, intervalMs: 60_000, limit: 500, deadlineMs: 30_000 },
    });
    expect("IAM_WORKER_DATABASE_URL" in env).toBe(false);
  });

  test("parses an enabled User Document repair schedule", () => {
    const env = parseWorkerEnv({
      ...validEnv(),
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
      IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "15000",
      IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: "100",
      IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "10000",
    });
    expect(env.userDocument.repair).toEqual({ enabled: true, intervalMs: 15_000, limit: 100, deadlineMs: 10_000 });
    expect(env.organizationDocument.repair.enabled).toBe(false);
  });

  test("configures Organization Document repair independently from User Document repair", () => {
    const env = parseWorkerEnv({
      ...validEnv(),
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: "true",
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS: "45000",
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT: "50",
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: "20000",
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS: "600",
    });
    expect(env.organizationDocument.repair).toEqual({
      enabled: true,
      intervalMs: 45_000,
      limit: 50,
      deadlineMs: 20_000,
    });
    expect(env.organizationDocument.repairStaleSeconds).toBe(600);
    expect(env.userDocument.repair).toEqual({ enabled: false, intervalMs: 60_000, limit: 500, deadlineMs: 30_000 });
    expect(env.userDocument.repairStaleSeconds).toBe(300);
  });

  test.each([
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS", "0"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS", "2147483648"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT", "0"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT", "9007199254740992"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS", "0"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS", "300001"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS", "-1"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT", "1.5"],
    ["IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS", "invalid"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS", "0"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS", "2147483648"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT", "0"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT", "9007199254740992"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS", "0"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS", "300001"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS", "-1"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT", "1.5"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS", "invalid"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS", "0"],
    ["IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS", "86401"],
  ])("rejects invalid document repair configuration %s=%s", (key, value) => {
    expect(() => parseWorkerEnv({ ...validEnv(), [key]: value })).toThrow();
  });

  test("requires dashboard credentials in production", () => {
    expect(() =>
      parseWorkerEnv({
        ...validEnv(),
        NODE_ENV: "production",
        IAM_WORKER_BULL_BOARD_ENABLED: "true",
      }),
    ).toThrow("IAM_WORKER_BULL_BOARD_USERNAME and IAM_WORKER_BULL_BOARD_PASSWORD are required in production");

    expect(
      parseWorkerEnv({
        ...validEnv(),
        NODE_ENV: "production",
        IAM_WORKER_BULL_BOARD_ENABLED: "true",
        IAM_WORKER_BULL_BOARD_USERNAME: "ops",
        IAM_WORKER_BULL_BOARD_PASSWORD: "secret",
      }).dashboard,
    ).toMatchObject({
      username: "ops",
      password: "secret",
    });
  });
});
