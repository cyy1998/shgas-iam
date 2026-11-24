import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export async function createMigratedPostgresTestHarness() {
  const harness = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_DB_TEST_DATABASE_URL",
  });
  return { ...harness, db: drizzle({ client: harness.sql, relations }) };
}
