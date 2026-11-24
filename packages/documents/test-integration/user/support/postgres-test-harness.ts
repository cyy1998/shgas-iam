import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import postgres from "postgres";
import { createDocumentsPostgresTestHarness } from "../../support/postgres-test-harness";

export type PostgresTestHarness = Awaited<ReturnType<typeof createPostgresTestHarness>>;

export async function createPostgresTestHarness(max = 4) {
  const pg = await createDocumentsPostgresTestHarness(max);
  // Keep lock holders and lock observation independent of the client under test,
  // including the test that pins its session settings to one connection.
  const blocker = postgres(pg.databaseUrl, { max: 2, connect_timeout: 5 });
  return {
    ...pg,
    async waitForScopedClientLock() {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const [row] = await blocker<{ blocked: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
          ) AS blocked
        `;
        if (row?.blocked) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("scoped PostgreSQL client did not block on a row lock");
    },
    async holdDirtyRowLock(userId: number) {
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const transaction = blocker.begin(async (tx) => {
        await tx`SELECT user_id FROM user_document_rebuild_state WHERE user_id = ${userId} FOR UPDATE`;
        locked.resolve();
        await release.promise;
      });
      void transaction.catch(locked.reject);
      await locked.promise;
      return async () => {
        release.resolve();
        await transaction;
      };
    },
    async close() {
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        registerCleanup(pg.close);
        registerCleanup(() => blocker.end({ timeout: 5 }));
      });
    },
  };
}
