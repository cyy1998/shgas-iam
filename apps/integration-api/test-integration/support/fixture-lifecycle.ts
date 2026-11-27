import { createOwnedRedisTestLifecycle } from "@iam/test-support/external-test-resources";

export { closeRedisTestClient as closeIntegrationRedisConnection } from "@iam/test-support/external-test-resources";

const lifecycle = createOwnedRedisTestLifecycle();
export const ownIntegrationTestExecutor = lifecycle.registerStopExecutor;
export const resetIntegrationRedisTestDatabase = () => lifecycle.reset(true);
