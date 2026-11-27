import {
  createExclusiveRedisTestHarness,
  requireDedicatedRedisTestUrl,
  resetRedisTestDatabase,
  seedRedisTestSentinels,
} from "@iam/test-support/external-test-resources";

export type OpsRedisTestHarness = Awaited<ReturnType<typeof createOpsRedisTestHarness>>;

export async function createOpsRedisTestHarness(source: NodeJS.ProcessEnv = process.env) {
  const harness = createExclusiveRedisTestHarness({ environment: source });
  const {
    clients: { writer, observer },
    close,
  } = await harness.openScope("ops", ["writer", "observer"]);
  return {
    writer,
    observer,
    seedNonOwnerSentinels: (prefixes: readonly string[]) => seedRedisTestSentinels(writer, prefixes),
    commandEnvironment: (): NodeJS.ProcessEnv => ({ NODE_ENV: "test", IAM_OPS_REDIS_URL: harness.url }),
    close,
  };
}

export function resetOpsRedisTestDatabase(stopExecutors: ReadonlyArray<() => Promise<void> | void>) {
  return resetRedisTestDatabase(stopExecutors);
}

export function resolveOpsRedisTestUrl(environment: NodeJS.ProcessEnv) {
  return requireDedicatedRedisTestUrl({ environment });
}

export function overrideOpsRedisTestUrl(overrides: { port?: number; username?: string; password?: string }) {
  const url = new URL(resolveOpsRedisTestUrl(process.env));
  if (overrides.port !== undefined) {
    url.hostname = "127.0.0.1";
    url.port = String(overrides.port);
  }
  if (overrides.username !== undefined) url.username = encodeURIComponent(overrides.username);
  if (overrides.password !== undefined) url.password = encodeURIComponent(overrides.password);
  return url.href;
}
