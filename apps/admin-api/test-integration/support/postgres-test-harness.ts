import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type AdminApiPostgresTestHarness = Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

export function createAdminApiPostgresTestHarness() {
  return createDrizzlePostgresTestHarness({
    createDb: (client) => drizzle({ client, relations }),
  });
}
