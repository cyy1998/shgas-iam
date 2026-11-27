import { expect, test } from "bun:test";
import {
  createDrizzlePostgresTestHarness,
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "@iam/test-support/postgres-test-harness";
import { prepareManagedPostgresTemplate } from "../../../../scripts/test-resources/postgres-template.mjs";

const name = TEST_POSTGRES_URL_ENV;

test.each(["postgres", "template0", "template1", "%70ostgres", "POSTGRES"])(
  "rejects system database %s",
  (databaseName) => {
    expect(() =>
      requireDedicatedPostgresTestUrl({ name, value: `postgres://127.0.0.1/${databaseName}`, forbidden: [] }),
    ).toThrow("must name a dedicated, non-system test database");
  },
);

test("rejects a development database even when URL spelling and credentials differ", () => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://test-user@DB.TEST/iam%5Fdev",
      forbidden: [{ name: "DATABASE_URL", value: "postgresql://dev-user@db.test:5432/iam_dev" }],
    }),
  ).toThrow("must not identify the same database as DATABASE_URL");
});

test("rejects matching DATABASE_URL supplied through environment", () => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://test-user@db.test:5432/iam_test",
      environment: {
        DATABASE_URL: "postgresql://dev-user@DB.TEST/iam_test",
      },
    }),
  ).toThrow("must not identify the same database as DATABASE_URL");
});

test.each([
  "IAM_AUTH_API_DATABASE_URL",
  "IAM_SSO_API_DATABASE_URL",
  "IAM_ADMIN_API_DATABASE_URL",
  "IAM_WORKER_DATABASE_URL",
  "IAM_OPS_DATABASE_URL",
  "IAM_DATABASE_URL",
])("rejects matching %s present in environment", (runtimeVar) => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://iam_test:iam_test@127.0.0.1:5432/iam_test",
      environment: {
        [runtimeVar]: "postgresql://runtime:secret@127.0.0.1/iam_test",
      },
    }),
  ).toThrow(`must not identify the same database as ${runtimeVar}`);
});

test.each(["iam", "iam_dev", "iam_prod", "shgas_iam", "dedicated", "contest", "latest", "testing_db"])(
  "rejects database name %s that lacks an explicit test marker",
  (databaseName) => {
    expect(() =>
      requireDedicatedPostgresTestUrl({
        name,
        value: `postgres://iam_test:iam_test@127.0.0.1:5433/${databaseName}`,
        environment: {},
      }),
    ).toThrow("must name a database containing a test marker");
  },
);

test("rejects URL parameters that can redirect a pool from its named database", () => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://127.0.0.1/iam_test?database=postgres",
      forbidden: [],
    }),
  ).toThrow("must identify PostgreSQL through its URL host and path");
});

test.each(["iam_test", "iam_test_abc123", "shgas_iam_test", "test_iam", "iam-test", "iam%5Ftest"])(
  "accepts dedicated test database %s when distinct from DATABASE_URL and IAM_*_DATABASE_URL",
  (databaseName) => {
    const value = `postgres://test-user@localhost:5433/${databaseName}`;
    const validated = requireDedicatedPostgresTestUrl({
      name,
      value,
      environment: {
        DATABASE_URL: "postgresql://dev-user@localhost:5432/iam_test",
        IAM_AUTH_API_DATABASE_URL: "postgresql://dev-user@localhost:5432/iam_dev",
        IAM_WORKER_DATABASE_URL: "",
      },
    });
    expect(validated).toBe(value);
  },
);

test("prepareManagedPostgresTemplate guards the PostgreSQL URL before running template creation", async () => {
  let failure: unknown;
  try {
    await prepareManagedPostgresTemplate(
      {
        root: process.cwd(),
        recordPath: "test-results/integration/unused/run.json",
        record: {
          schemaVersion: 1,
          runId: "unused",
          project: "iam-integration-unused",
          composeFile: "scripts/test-resources/compose.yaml",
          artifactDirectory: "test-results/integration/unused",
          composeEnvironmentFile: "test-results/integration/unused/compose-environment.json",
          envFile: "test-results/integration/unused/empty.env",
          testEnvironmentFile: "test-results/integration/unused/test-environment.json",
          services: ["postgres"],
          removeLocalImages: false,
          keep: false,
          status: "ready",
          createdAt: new Date(0).toISOString(),
          durations: {},
        },
      },
      {
        databaseUrl: "postgres://iam_test:iam_test@127.0.0.1:5432/iam_dev",
        env: { IAM_AUTH_API_DATABASE_URL: "postgresql://dev:dev@127.0.0.1:5432/iam_dev" },
      },
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("IAM_AUTH_API_DATABASE_URL");
});

test("createDrizzlePostgresTestHarness validates IAM_TEST_POSTGRES_URL before opening connections", async () => {
  let failure: unknown;
  try {
    await createDrizzlePostgresTestHarness({
      environment: {
        IAM_TEST_POSTGRES_URL: "postgres://iam_test:iam_test@127.0.0.1:1/iam_prod",
        IAM_TEST_POSTGRES_TEMPLATE: "iam_test_template",
      },
      createDb: () => ({}),
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("must name a database containing a test marker");
});

test("createDrizzlePostgresTestHarness stops before creating a clone when trackStop fires synchronously", async () => {
  let failure: unknown;
  try {
    await createDrizzlePostgresTestHarness({
      environment: {
        IAM_TEST_POSTGRES_URL: "postgres://iam_test:iam_test@127.0.0.1:1/iam_test",
        IAM_TEST_POSTGRES_TEMPLATE: "iam_test_template",
      },
      createDb: () => ({}),
      trackStop(close) {
        void close();
      },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("stopped during initialization");
});
