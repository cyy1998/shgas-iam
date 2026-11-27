import { resetRedisTestDatabase } from "@iam/test-support/external-test-resources";

export { closeRedisTestClient } from "@iam/test-support/external-test-resources";

export function resetRedisTestCase(stopExecutor: () => Promise<void> | void) {
  return resetRedisTestDatabase([stopExecutor]);
}
