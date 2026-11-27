import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type AuthApiPostgresTestHarness = Awaited<ReturnType<typeof createAuthApiPostgresTestHarness>>;

export function createAuthApiPostgresTestHarness(trackStop?: (close: () => Promise<void>) => void) {
  return createDrizzlePostgresTestHarness({
    createDb: (client) => drizzle({ client, relations }),
    trackStop,
  });
}
