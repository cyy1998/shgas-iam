import { expect, test } from "bun:test";
import { requireDedicatedPostgresTestUrl } from "@iam/test-support/postgres-test-harness";

const name = "IAM_EXAMPLE_TEST_DATABASE_URL";

test.each(["postgres", "template0", "template1", "%70ostgres"])("rejects system database %s", (databaseName) => {
  expect(() =>
    requireDedicatedPostgresTestUrl({ name, value: `postgres://127.0.0.1/${databaseName}`, forbidden: [] }),
  ).toThrow("must name a dedicated, non-system test database");
});

test("rejects a development database even when URL spelling and credentials differ", () => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://test-user@DB.TEST/iam%5Fdev",
      forbidden: [{ name: "DATABASE_URL", value: "postgresql://dev-user@db.test:5432/iam_dev" }],
    }),
  ).toThrow("must not identify the same database as DATABASE_URL");
});

test("rejects URL parameters that can redirect a pool from its named database", () => {
  expect(() =>
    requireDedicatedPostgresTestUrl({
      name,
      value: "postgres://127.0.0.1/iam_test?database=postgres",
      forbidden: [],
    }),
  ).toThrow("must identify PostgreSQL through its URL host and path");
});

test("accepts a dedicated database with the same name on a different port", () => {
  const value = "postgres://test-user@localhost:5433/iam_test";
  const validated = requireDedicatedPostgresTestUrl({
    name,
    value,
    forbidden: [{ name: "DATABASE_URL", value: "postgresql://dev-user@localhost:5432/iam_test" }],
  });
  expect(validated).toBe(value);
});
