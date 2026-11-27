import { createOwnedRedisTestLifecycle } from "@iam/test-support/external-test-resources";

export { closeRedisTestClient as closeApiRedisConnection } from "@iam/test-support/external-test-resources";

const lifecycle = createOwnedRedisTestLifecycle();
export const ownApiTestExecutor = lifecycle.registerStopExecutor;
export const resetApiRedisTestDatabase = () => lifecycle.reset(true);
