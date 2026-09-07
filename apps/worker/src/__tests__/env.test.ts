import { beforeAll, describe, expect, test } from "bun:test";

type ParseWorkerEnv = typeof import("../env").parseWorkerEnv;
type ParsePostgresReadinessEnv = typeof import("../env").parseUserProfilePostgresReadinessCommandEnv;
type ParseClientRuntimeMaintenanceEnv = typeof import("../env").parseClientRuntimeMaintenanceCommandEnv;
type ParseAuditActionMaintenanceEnv = typeof import("../env").parseAuditActionMaintenanceCommandEnv;

let parseWorkerEnv: ParseWorkerEnv;
let parsePostgresReadinessEnv: ParsePostgresReadinessEnv;
let parseClientRuntimeMaintenanceEnv: ParseClientRuntimeMaintenanceEnv;
let parseAuditActionMaintenanceEnv: ParseAuditActionMaintenanceEnv;

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
      parseAuditActionMaintenanceCommandEnv: parseAuditActionMaintenanceEnv,
      parseClientRuntimeMaintenanceCommandEnv: parseClientRuntimeMaintenanceEnv,
      parseUserProfilePostgresReadinessCommandEnv: parsePostgresReadinessEnv,
      parseWorkerEnv,
    } = await import("../env"));
  });

  test("audit maintenance accepts only its PostgreSQL configuration without changing global database configuration", () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    expect(parseAuditActionMaintenanceEnv({
      IAM_WORKER_DATABASE_URL: "postgresql://iam:password@localhost/iam?options=-csearch_path%3Daudit",
      IAM_WORKER_REDIS_PORT: "invalid-unused",
      IAM_WORKER_LOG_FORMAT: "invalid-unused",
    })).toEqual({ databaseUrl: "postgresql://iam:password@localhost/iam?options=-csearch_path%3Daudit" });
    expect(process.env.DATABASE_URL).toBe(previousDatabaseUrl);
    for (const databaseUrl of [undefined, "", "not-a-url", "https://localhost/iam"]) {
      expect(() => parseAuditActionMaintenanceEnv({
        IAM_WORKER_DATABASE_URL: databaseUrl,
        DATABASE_URL: "postgresql://unused-fallback/iam",
      })).toThrow();
    }
    expect(parseAuditActionMaintenanceEnv({
      IAM_WORKER_DATABASE_URL: "postgres://iam:password@localhost/iam",
    })).toEqual({ databaseUrl: "postgres://iam:password@localhost/iam" });
  });

  test("parses Client Runtime maintenance without PostgreSQL or general Worker runtime configuration", () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://unchanged-sentinel";
    try {
      expect(parseClientRuntimeMaintenanceEnv({
        IAM_WORKER_REDIS_HOST: "redis.internal",
        IAM_WORKER_REDIS_PORT: "6380",
        IAM_WORKER_REDIS_PASSWORD: "redis-password",
        IAM_WORKER_REDIS_DB: "4",
        NODE_ENV: "production",
        IAM_WORKER_LOG_LEVEL: "warn",
        IAM_WORKER_LOG_FORMAT: "json",
      })).toEqual({
        redis: {
          host: "redis.internal",
          port: 6380,
          password: "redis-password",
          db: 4,
        },
        nodeEnv: "production",
        log: { level: "warn", format: "json" },
      });
      expect(process.env.DATABASE_URL).toBe("postgresql://unchanged-sentinel");
    }
    finally {
      if (previousDatabaseUrl === undefined)
        delete process.env.DATABASE_URL;
      else
        process.env.DATABASE_URL = previousDatabaseUrl;
    }
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
