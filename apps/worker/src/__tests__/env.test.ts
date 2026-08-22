import { beforeAll, describe, expect, test } from "bun:test";

type ParseWorkerEnv = typeof import("../env").parseWorkerEnv;
type ParsePostgresReadinessEnv = typeof import("../env").parseUserProfilePostgresReadinessCommandEnv;

let parseWorkerEnv: ParseWorkerEnv;
let parsePostgresReadinessEnv: ParsePostgresReadinessEnv;

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
    ({
      parseUserProfilePostgresReadinessCommandEnv: parsePostgresReadinessEnv,
      parseWorkerEnv,
    } = await import("../env"));
  });

  test("parses PostgreSQL readiness without Redis or Worker runtime configuration", () => {
    expect(parsePostgresReadinessEnv({
      IAM_WORKER_DATABASE_URL: "postgresql://iam:password@localhost/iam",
      IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE: "25",
      IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: "200",
    })).toEqual({
      databaseUrl: "postgresql://iam:password@localhost/iam",
      nodeEnv: "development",
      log: { level: "info", format: "auto" },
      userProfile: { rebuildBatchSize: 25, backfillBatchSize: 200 },
    });
  });

  test("exports grouped runtime config from IAM_WORKER raw env", () => {
    const env = parseWorkerEnv({
      ...validEnv(),
      IAM_WORKER_ENABLED_MODULES: "user-profile",
      IAM_WORKER_HTTP_PORT: "30003",
      IAM_WORKER_BULL_BOARD_ENABLED: "true",
      IAM_WORKER_BULL_BOARD_USERNAME: "ops",
      IAM_WORKER_BULL_BOARD_PASSWORD: "secret",
      IAM_WORKER_BULL_BOARD_READ_ONLY: "false",
      IAM_WORKER_USER_PROFILE_CONCURRENCY: "4",
      IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE: "25",
      IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: "200",
      IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS: "600",
    });

    expect(env.databaseUrl).toBe("postgresql://iam:password@localhost/iam");
    expect(env.redis.host).toBe("localhost");
    expect(env.modules.enabled).toEqual({ mode: "list", keys: ["user-profile"] });
    expect(env.dashboard.enabled).toBe(true);
    expect(env.dashboard.readOnly).toBe(false);
    expect(env.userProfile).toEqual({
      concurrency: 4,
      rebuildBatchSize: 25,
      backfillBatchSize: 200,
      repairStaleSeconds: 600,
    });
    expect("IAM_WORKER_DATABASE_URL" in env).toBe(false);
  });

  test("requires dashboard credentials in production", () => {
    expect(() => parseWorkerEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_WORKER_BULL_BOARD_ENABLED: "true",
    })).toThrow("IAM_WORKER_BULL_BOARD_USERNAME and IAM_WORKER_BULL_BOARD_PASSWORD are required in production");

    expect(parseWorkerEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_WORKER_BULL_BOARD_ENABLED: "true",
      IAM_WORKER_BULL_BOARD_USERNAME: "ops",
      IAM_WORKER_BULL_BOARD_PASSWORD: "secret",
    }).dashboard).toMatchObject({
      username: "ops",
      password: "secret",
    });
  });
});
