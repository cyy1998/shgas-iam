import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type OpsPostgresTestHarness = Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;

export async function createOpsPostgresTestHarness() {
  const pg = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_OPS_TEST_DATABASE_URL",
    client: { max: 4 },
  });
  return { ...pg, db: drizzle({ client: pg.sql, relations }) };
}

export async function reserveOpsPostgresConnection(
  harness: OpsPostgresTestHarness,
  stopExecutors: Array<() => Promise<void> | void>,
) {
  const sql = await harness.sql.reserve();
  let closePromise: Promise<void> | undefined;
  function close() {
    closePromise ??= (async () => {
      try {
        await sql.unsafe("ROLLBACK");
      } finally {
        sql.release();
      }
    })();
    return closePromise;
  }
  stopExecutors.push(close);
  return { sql, close };
}
