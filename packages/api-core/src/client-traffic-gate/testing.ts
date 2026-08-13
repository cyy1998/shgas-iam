import type { Redis } from "ioredis";
import { clientTrafficGateRuntimeKeys } from "./runtime-keys";

export async function deleteClientTrafficGateTestState(
  redis: Pick<Redis, "unlink">,
  clientCode: string,
) {
  const keys = clientTrafficGateRuntimeKeys(clientCode);
  await redis.unlink(keys.cacheKey, keys.generationKey, keys.mutationKey);
}
