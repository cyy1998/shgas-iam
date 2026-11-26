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

export async function waitForOpsPostgresLock(
  harness: OpsPostgresTestHarness,
  scope: "user" | "org",
  signal = AbortSignal.timeout(5_000),
) {
  while (!signal.aborted) {
    const [owner] = await harness.sql<{ application_name: string }[]>`
      SELECT application_name FROM pg_stat_activity
      WHERE datname = current_database() AND usename = current_user
        AND application_name LIKE ${`iam-${scope}-%`} AND wait_event_type = 'Lock'`;
    if (owner) return owner.application_name;
    await Bun.sleep(10);
  }
  throw new Error(`Did not observe the Ops ${scope} PostgreSQL lock wait`, { cause: signal.reason });
}
