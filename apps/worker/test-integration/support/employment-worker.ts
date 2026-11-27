import type { WorkerPostgresTestHarness } from "./postgres-test-harness";
import type { WorkerRedisTestHarness } from "./redis-test-harness";

import { startWorker, waitFor } from "./worker-composition.fixture";

export { waitFor };

export async function startEmploymentWorker(input: {
  pg: WorkerPostgresTestHarness;
  redis: WorkerRedisTestHarness;
  stopExecutors: Array<() => Promise<void> | void>;
  initialTime: string;
  overrides?: NodeJS.ProcessEnv;
}) {
  const { pg, redis, stopExecutors } = input;
  const databaseUrl = new URL(input.overrides?.IAM_WORKER_DATABASE_URL ?? pg.databaseUrl);
  databaseUrl.searchParams.set("application_name", workerApplicationName(pg));
  let now = Date.parse(input.initialTime);
  const worker = await startWorker(
    {
      ...redis.commandEnvironment(),
      IAM_WORKER_ENABLED_MODULES: "user-document",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
      IAM_WORKER_LOG_LEVEL: "info",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "false",
      ...input.overrides,
      IAM_WORKER_DATABASE_URL: databaseUrl.toString(),
    },
    { now: () => now, nowDate: () => new Date(now) },
  );
  stopExecutors.push(worker.stop);
  return {
    async waitForEvent(event: string, count = 1) {
      await waitFor(
        event,
        async () => {
          const output = worker.output();
          return output.split(`"event":"${event}"`).length > count ? true : undefined;
        },
        worker.output,
      );
    },
    async setClock(instant: string) {
      now = Date.parse(instant);
    },
    output: worker.output,
    stop: worker.stop,
  };
}

export async function waitForEmploymentWorkerLock(pg: WorkerPostgresTestHarness, blockerPid: number, count = 1) {
  return await waitFor("Worker waiting for the held PostgreSQL lock", async () => {
    const rows = await pg.sql<{ pid: number }[]>`
      WITH RECURSIVE waiting(pid) AS (
        VALUES (${blockerPid}::integer)
        UNION
        SELECT activity.pid FROM pg_stat_activity activity
        JOIN waiting ON waiting.pid = ANY(pg_blocking_pids(activity.pid))
        WHERE activity.application_name = ${workerApplicationName(pg)}
      )
      SELECT pid FROM waiting WHERE pid <> ${blockerPid}`;
    return rows.length >= count ? rows.map(({ pid }) => pid) : undefined;
  });
}

function workerApplicationName(pg: WorkerPostgresTestHarness) {
  return `iam-sweep-${new URL(pg.databaseUrl).pathname.slice(1)}`;
}
