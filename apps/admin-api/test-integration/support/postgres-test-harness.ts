import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type AdminApiPostgresTestHarness = Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

export async function createAdminApiPostgresTestHarness() {
  const harness = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_ADMIN_API_TEST_DATABASE_URL",
  });
  return { ...harness, db: drizzle({ client: harness.sql, relations }) };
}
