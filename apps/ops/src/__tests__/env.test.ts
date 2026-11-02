import { expect, test } from "bun:test";
import {
  parseAuditActionMaintenanceCommandEnv,
  parseOrganizationDocumentBackfillCommandEnv,
  parseUserDocumentPostgresReadinessCommandEnv,
} from "../env";

test("audit maintenance validates only its PostgreSQL URL and never changes global database configuration", () => {
  const previous = process.env.DATABASE_URL;
  expect(
    parseAuditActionMaintenanceCommandEnv({
      IAM_OPS_DATABASE_URL: "postgresql://iam:password@localhost/iam?options=-csearch_path%3Daudit",
      IAM_OPS_REDIS_PORT: "invalid-unused",
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
      IAM_OPS_REDIS_PORT: "invalid-unused",
      IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS: "invalid-unused",
    }),
  ).toEqual({
    databaseUrl: "postgresql://iam:password@localhost/iam",
    nodeEnv: "development",
    log: { level: "info", format: "auto" },
    userDocument: { rebuildBatchSize: 25, backfillBatchSize: 200 },
  });
});

test("organization maintenance refuses a namespace unavailable to its formal source producers", () => {
  expect(() =>
    parseOrganizationDocumentBackfillCommandEnv({ IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "unconsumed" }),
  ).toThrow("Organization Search queue prefix is fixed to iam");
});
