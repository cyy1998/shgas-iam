import type postgresFactory from "postgres";
import process from "node:process";
import { afterEach, expect, test } from "bun:test";
import { createPostgresTestHarness } from "./postgres-test-harness";

const testDatabaseUrlName = "IAM_USER_PROFILE_TEST_DATABASE_URL";
const originalTestDatabaseUrl = process.env[testDatabaseUrlName];
const originalRuntimeDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  restoreEnvironmentValue(testDatabaseUrlName, originalTestDatabaseUrl);
  restoreEnvironmentValue("DATABASE_URL", originalRuntimeDatabaseUrl);
});

test("cleans every resource created before PostgreSQL harness setup fails", async () => {
  process.env[testDatabaseUrlName]
    = "postgres://test-user@127.0.0.1/iam_harness_contract";
  delete process.env.DATABASE_URL;

  const setupFailure = new Error("blocker client creation failed");
  const scopedCloseFailure = new Error("scoped client close failed");
  const dropSchemaFailure = new Error("schema drop failed");
  const adminCloseFailure = new Error("admin client close failed");
  const cleanupAttempts = new Set<string>();
  let clientIndex = 0;
  const admin = {
    async end() {
      cleanupAttempts.add("admin-close");
      throw adminCloseFailure;
    },
    async unsafe(statement: string) {
      if (statement.startsWith("DROP SCHEMA")) {
        cleanupAttempts.add("drop-schema");
        throw dropSchemaFailure;
      }
    },
  };
  const scoped = {
    async end() {
      cleanupAttempts.add("scoped-close");
      throw scopedCloseFailure;
    },
  };
  const createSql = (() => {
    clientIndex += 1;
    if (clientIndex === 1)
      return admin;
    if (clientIndex === 2)
      return scoped;
    throw setupFailure;
  }) as unknown as typeof postgresFactory;
  let caught: unknown;

  try {
    await createPostgresTestHarness({ createSql });
  }
  catch (error) {
    caught = error;
  }

  const errors = caught instanceof AggregateError ? caught.errors : [caught];
  expect({
    cleanupAttempts,
    errorCount: errors.length,
    errors: new Set(errors),
  }).toEqual({
    cleanupAttempts: new Set([
      "scoped-close",
      "drop-schema",
      "admin-close",
    ]),
    errorCount: 4,
    errors: new Set([
      setupFailure,
      scopedCloseFailure,
      dropSchemaFailure,
      adminCloseFailure,
    ]),
  });
});

test("attempts every PostgreSQL harness close action and preserves every failure", async () => {
  process.env[testDatabaseUrlName]
    = "postgres://test-user@127.0.0.1/iam_harness_contract";
  delete process.env.DATABASE_URL;

  const scopedCloseFailure = new Error("scoped client close failed");
  const blockerCloseFailure = new Error("blocker client close failed");
  const dropSchemaFailure = new Error("schema drop failed");
  const adminCloseFailure = new Error("admin client close failed");
  const cleanupAttempts = new Set<string>();
  const admin = {
    async end() {
      cleanupAttempts.add("admin-close");
      throw adminCloseFailure;
    },
    async unsafe(statement: string) {
      if (statement.startsWith("DROP SCHEMA")) {
        cleanupAttempts.add("drop-schema");
        throw dropSchemaFailure;
      }
    },
  };
  const scoped = {
    async end() {
      cleanupAttempts.add("scoped-close");
      throw scopedCloseFailure;
    },
  };
  const blocker = {
    async end() {
      cleanupAttempts.add("blocker-close");
      throw blockerCloseFailure;
    },
  };
  const clients = [admin, scoped, blocker];
  const createSql = (() => clients.shift()) as unknown as typeof postgresFactory;
  const harness = await createPostgresTestHarness({
    createDatabase: () => ({}) as never,
    createSql,
    runMigrations: async () => {},
  });
  let caught: unknown;

  try {
    await harness.close();
  }
  catch (error) {
    caught = error;
  }

  const errors = caught instanceof AggregateError ? caught.errors : [caught];
  expect({
    cleanupAttempts,
    errorCount: errors.length,
    errors: new Set(errors),
  }).toEqual({
    cleanupAttempts: new Set([
      "scoped-close",
      "blocker-close",
      "drop-schema",
      "admin-close",
    ]),
    errorCount: 4,
    errors: new Set([
      scopedCloseFailure,
      blockerCloseFailure,
      dropSchemaFailure,
      adminCloseFailure,
    ]),
  });
});

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined)
    delete process.env[name];
  else
    process.env[name] = value;
}
