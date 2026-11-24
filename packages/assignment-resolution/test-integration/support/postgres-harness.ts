import { relations } from "@iam/db/relations";
import { createPostgresTestHarness as clonePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type PostgresTestHarness = Awaited<ReturnType<typeof createPostgresTestHarness>>;

export async function createPostgresTestHarness() {
  let queryCount = 0;
  let isMeasuringQueries = false;
  const pg = await clonePostgresTestHarness({
    environment: process.env,
    name: "IAM_ASSIGNMENT_RESOLUTION_TEST_DATABASE_URL",
    client: {
      max: 1,
      debug() {
        if (isMeasuringQueries) queryCount += 1;
      },
    },
  });
  return {
    ...pg,
    db: drizzle({ client: pg.sql, relations }),
    async measureQueries<T>(operation: () => Promise<T>) {
      queryCount = 0;
      isMeasuringQueries = true;
      try {
        const result = await operation();
        return { queryCount, result };
      } finally {
        isMeasuringQueries = false;
      }
    },
  };
}
