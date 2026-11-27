import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type DocumentsPostgresTestHarness = Awaited<ReturnType<typeof createDocumentsPostgresTestHarness>>;

export function createDocumentsPostgresTestHarness(max = 6) {
  return createDrizzlePostgresTestHarness({
    client: { max, onnotice() {} },
    createDb: (client) => drizzle({ client, relations }),
  });
}
