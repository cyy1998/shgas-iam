import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { FatalReadinessError, spawnOwnedProcessTree } from "@iam/test-support/process-smoke-harness";
import { startEmploymentProcess } from "./employment-process.fixture";
import type { WorkerPostgresTestHarness } from "./postgres-test-harness";
import type { WorkerRedisTestHarness } from "./redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

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
  const worker = await startEmploymentProcess({
    label: "Employment lifecycle Worker",
    hostname: "127.0.0.1",
    temporaryDirectoryPrefix: "iam-employment-worker-",
    stopExecutors,
    start({ port, temporaryDirectory }) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          "--preload=./test-integration/support/control-worker-clock.fixture.ts",
          "--preload=./test-integration/support/interrupt-worker.fixture.ts",
          "run",
          "src/index.ts",
        ],
        cwd: workerRoot,
        env: {
          ...redis.commandEnvironment(temporaryDirectory),
          TZ: "America/Los_Angeles",
          IAM_WORKER_ENABLED_MODULES: "user-document",
          IAM_WORKER_HTTP_ENABLED: "true",
          IAM_WORKER_HTTP_PORT: String(port),
          IAM_WORKER_BULL_BOARD_ENABLED: "false",
          IAM_WORKER_LOG_LEVEL: "info",
          IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "false",
          ...input.overrides,
          IAM_WORKER_DATABASE_URL: databaseUrl.toString(),
          IAM_WORKER_TEST_CLOCK_FILE: join(temporaryDirectory, "clock"),
          IAM_WORKER_TEST_INITIAL_TIME: input.initialTime,
          IAM_WORKER_TEST_INTERRUPT_FILE: join(temporaryDirectory, "interrupt"),
        },
      });
    },
    async probe(origin, output, signal) {
      if (!output.includes("worker started")) return false;
      const response = await fetch(`${origin}/healthz`, { signal });
      const health: unknown = await response.json();
      if (response.status !== 200 || typeof health !== "object" || !health || !("ok" in health) || health.ok !== true)
        throw new FatalReadinessError("Worker did not report healthy dependencies");
      return true;
    },
    async stop(child, { temporaryDirectory }, output) {
      if (child.exitCode === null) {
        await writeFile(join(temporaryDirectory, "interrupt"), "stop");
        await waitFor("graceful Worker shutdown", async () => child.exitCode ?? undefined, output, 7_000);
      }
      if (child.exitCode !== 0) throw new Error(`Worker failed to shut down cleanly\n${output()}`);
    },
  });
  const clockFile = join(worker.temporaryDirectory, "clock");
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
      await writeFile(`${clockFile}.next`, instant);
      await rename(`${clockFile}.next`, clockFile);
      await waitFor("clock change acknowledgement", async () => {
        const applied = await readFile(`${clockFile}.applied`, "utf8").catch(() => null);
        return applied === instant ? true : undefined;
      });
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

export async function waitFor<T>(
  description: string,
  probe: () => Promise<T | undefined>,
  details?: () => string,
  timeoutMs = 10_000,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const result = await probe();
    if (result !== undefined) return result;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for ${description}${details ? `\n${details()}` : ""}`);
}
