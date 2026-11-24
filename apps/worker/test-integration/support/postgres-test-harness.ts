import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type WorkerPostgresTestHarness = Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;

export async function createWorkerPostgresTestHarness() {
  const pg = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_WORKER_TEST_DATABASE_URL",
    client: { max: 4 },
  });
  return { ...pg, db: drizzle({ client: pg.sql, relations }) };
}
