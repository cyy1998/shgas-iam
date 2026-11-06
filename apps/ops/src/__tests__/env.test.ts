import { expect, test } from "bun:test";
import { resolveOpsRedisTestUrl } from "../../test-integration/support/redis-test-harness";
import {
  parseAuditActionMaintenanceCommandEnv,
  parseEmploymentCommandEnv,
  parseOfflineMaintenanceEnv,
  parseOrganizationDocumentBackfillCommandEnv,
  parseOrganizationDocumentVerifyCommandEnv,
  parseUserDocumentPostgresReadinessCommandEnv,
} from "../env";

test("audit maintenance validates only its PostgreSQL URL and never changes global database configuration", () => {
  const previous = process.env.DATABASE_URL;
  expect(
    parseAuditActionMaintenanceCommandEnv({
      IAM_OPS_DATABASE_URL: "postgresql://iam:password@localhost/iam?options=-csearch_path%3Daudit",
      IAM_OPS_REDIS_URL: "invalid-unused",
      IAM_OPS_LOG_FORMAT: "invalid-unused",
    }),
  ).toEqual({ databaseUrl: "postgresql://iam:password@localhost/iam?options=-csearch_path%3Daudit" });
  for (const databaseUrl of [undefined, "", "not-a-url", "https://localhost/iam"])
    expect(() =>
      parseAuditActionMaintenanceCommandEnv({
        IAM_OPS_DATABASE_URL: databaseUrl,
        DATABASE_URL: "postgresql://unused/iam",
      }),
    ).toThrow();
  expect(
    parseAuditActionMaintenanceCommandEnv({ IAM_OPS_DATABASE_URL: "postgres://iam:password@localhost/iam" }),
  ).toEqual({ databaseUrl: "postgres://iam:password@localhost/iam" });
  expect(process.env.DATABASE_URL).toBe(previous);
});

test("PostgreSQL gate configuration ignores unrelated Redis and repair-only values", () => {
  expect(
    parseUserDocumentPostgresReadinessCommandEnv({
      IAM_OPS_DATABASE_URL: "postgresql://iam:password@localhost/iam",
      IAM_OPS_USER_DOCUMENT_REBUILD_BATCH_SIZE: "25",
      IAM_OPS_USER_DOCUMENT_BACKFILL_BATCH_SIZE: "200",
      IAM_OPS_REDIS_URL: "invalid-unused",
      IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS: "invalid-unused",
    }),
  ).toEqual({
    databaseUrl: "postgresql://iam:password@localhost/iam",
    nodeEnv: "development",
    log: { level: "info", format: "auto" },
    userDocument: { rebuildBatchSize: 25, backfillBatchSize: 200 },
  });
});

test("PostgreSQL command configuration honors logging overrides without requiring Redis", () => {
  const source = {
    IAM_OPS_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    NODE_ENV: "production",
    IAM_OPS_LOG_LEVEL: "warn",
    IAM_OPS_LOG_FORMAT: "json",
    IAM_OPS_REDIS_URL: "invalid-unused",
    IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS: "invalid-unused",
    IAM_OPS_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS: "invalid-unused",
  };
  for (const parseCommandEnv of [
    parseEmploymentCommandEnv,
    parseOrganizationDocumentVerifyCommandEnv,
    parseUserDocumentPostgresReadinessCommandEnv,
  ]) {
    expect(parseCommandEnv(source)).toMatchObject({
      databaseUrl: source.IAM_OPS_DATABASE_URL,
      nodeEnv: "production",
      log: { level: "warn", format: "json" },
    });
  }
});

test("organization maintenance refuses a namespace unavailable to its formal source producers", () => {
  expect(() =>
    parseOrganizationDocumentBackfillCommandEnv({ IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "unconsumed" }),
  ).toThrow("Organization Search queue prefix is fixed to iam");
});

test("Redis maintenance requires its own URL and preserves encoded authentication", () => {
  expect(
    parseOfflineMaintenanceEnv({ IAM_OPS_REDIS_URL: "redis://ops%3Areader:%20secret%40%2F%20@LOCALHOST:6390/12" }),
  ).toMatchObject({ host: "LOCALHOST", port: 6390, db: 12, username: "ops:reader", password: " secret@/ " });
  expect(parseOfflineMaintenanceEnv({ IAM_OPS_REDIS_URL: "redis://127.0.0.1" })).toMatchObject({
    host: "127.0.0.1",
    port: 6379,
    db: 0,
  });
  expect(() => parseOfflineMaintenanceEnv({ IAM_WORKER_REDIS_URL: "redis://127.0.0.1:6379/0" })).toThrow(
    "Invalid Ops configuration",
  );
});

test("maintenance URLs are validated without rendering supplied credentials", () => {
  const secretUrl = "redis://private-user:private-password@host/invalid-db";
  const output: string[] = [];
  const write = process.stderr.write;
  try {
    process.stderr.write = (value) => {
      output.push(String(value));
      return true;
    };
    expect(() => parseOfflineMaintenanceEnv({ IAM_OPS_REDIS_URL: secretUrl })).toThrow("Invalid Ops configuration");
  } finally {
    process.stderr.write = write;
  }
  expect(output.join("")).toContain("IAM_OPS_REDIS_URL");
  expect(output.join("")).not.toContain("private-");
  expect(output.join("")).not.toContain(secretUrl);
});

test("Redis test resources remain separate from the normalized runtime database", () => {
  expect(() =>
    resolveOpsRedisTestUrl({
      IAM_OPS_TEST_REDIS_URL: "redis://test-reader:test-password@LOCALHOST/0",
      IAM_OPS_REDIS_URL: "redis://runtime-writer:runtime-password@localhost:6379/0",
    }),
  ).toThrow("must not identify the Ops runtime Redis resource");
  const separateDb = "redis://reader:password@localhost/1";
  expect(
    resolveOpsRedisTestUrl({ IAM_OPS_TEST_REDIS_URL: separateDb, IAM_OPS_REDIS_URL: "redis://localhost:6379/0" }),
  ).toBe(separateDb);
  expect(() =>
    resolveOpsRedisTestUrl({
      IAM_OPS_TEST_REDIS_URL: "redis://localhost/1",
      IAM_OPS_REDIS_URL: "redis://private-user:private-password@localhost/invalid-db",
    }),
  ).toThrow("IAM_OPS_REDIS_URL must contain a valid Ops runtime Redis URL");
});
