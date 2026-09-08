import { createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";

export type { RedisTestHarness, SessionKernelRedisTestScope } from "@iam/session-kernel/testing";
export { waitForRedisCondition } from "@iam/session-kernel/testing";
export async function createRedisTestHarness() {
  const redisUrl = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!redisUrl)
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL must point to a caller-provided dedicated Redis test instance; no fallback is allowed");
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL must use the redis or rediss protocol");
  return await createSessionKernelRedisTestHarness(redisUrl);
}
