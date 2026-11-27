import {
  createExclusiveRedisTestHarness,
  requireDedicatedRedisTestUrl,
  resetRedisTestDatabase,
  seedRedisTestSentinels,
} from "@iam/test-support/external-test-resources";

export type WorkerRedisTestHarness = Awaited<ReturnType<typeof createWorkerRedisTestHarness>>;

export async function createWorkerRedisTestHarness(source: NodeJS.ProcessEnv = process.env) {
  const harness = createExclusiveRedisTestHarness({ environment: source });
  const {
    clients: { writer, observer },
    close,
  } = await harness.openScope("worker", ["writer", "observer"]);
  return {
    writer,
    observer,
    seedNonOwnerSentinels: (prefixes: readonly string[]) => seedRedisTestSentinels(writer, prefixes),
    commandEnvironment: (): NodeJS.ProcessEnv => ({ NODE_ENV: "test", IAM_WORKER_REDIS_URL: harness.url }),
    close,
  };
}

export function resetWorkerRedisTestDatabase(stopExecutors: ReadonlyArray<() => Promise<void> | void>) {
  return resetRedisTestDatabase(stopExecutors);
}

export function resolveWorkerRedisTestUrl(environment: NodeJS.ProcessEnv) {
  return requireDedicatedRedisTestUrl({ environment });
}
