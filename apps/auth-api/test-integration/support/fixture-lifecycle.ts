import { createOwnedRedisTestLifecycle } from "@iam/test-support/external-test-resources";

export { closeRedisTestClient as closeAuthApiRedisConnection } from "@iam/test-support/external-test-resources";

const lifecycle = createOwnedRedisTestLifecycle();
export const ownAuthApiTestExecutor = lifecycle.registerStopExecutor;
export const resetAuthApiRedisTestDatabase = () => lifecycle.reset(true);

export async function closeFixtureResources(tasks: Array<() => unknown | Promise<unknown>>) {
  const failures: unknown[] = [];
  for (const task of tasks.toReversed()) {
    try {
      await task();
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Auth API fixture resource cleanup failed");
}

export async function cleanupAfterFixtureFailure(failure: unknown, close: () => Promise<void>): Promise<never> {
  try {
    await close();
  } catch (cleanupFailure) {
    throw new AggregateError([failure, cleanupFailure], "Auth API fixture initialization and cleanup failed", {
      cause: failure,
    });
  }
  throw failure;
}
