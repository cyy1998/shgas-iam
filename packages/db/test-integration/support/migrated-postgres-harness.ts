import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export function createMigratedPostgresTestHarness() {
  return createDrizzlePostgresTestHarness({
    createDb: (client) => drizzle({ client, relations }),
  });
}
