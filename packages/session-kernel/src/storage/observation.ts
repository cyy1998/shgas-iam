import type { SessionKernelRedis } from "./store";

export type SessionKernelObservation = {
  now: () => Promise<number>;
  read: (key: string) => Promise<{ observedAt: number; serialized: string | null }>;
};

const OBSERVE_SCRIPT = `
-- session-kernel-observe-v1
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if #KEYS == 0 then
  return { now, false }
end
return { now, redis.call("GET", KEYS[1]) }
`;

export function createRedisSessionKernelObservation(redis: SessionKernelRedis): SessionKernelObservation {
  if (!redis.eval)
    throw new Error("session kernel Redis eval is required for lifecycle observation");

  async function observe(key?: string) {
    const result = await redis.eval!(OBSERVE_SCRIPT, key === undefined ? 0 : 1, ...(key === undefined ? [] : [key]));
    if (
      !Array.isArray(result)
      || result.length !== 2
      || !Number.isSafeInteger(result[0])
      || (result[1] !== null && typeof result[1] !== "string")
    ) {
      throw new Error("session kernel Redis returned an invalid lifecycle observation");
    }
    return { observedAt: result[0] as number, serialized: result[1] as string | null };
  }

  return {
    async now() { return (await observe()).observedAt; },
    read: observe,
  };
}
