import type { RedisPort } from "@api/composition/runtime";

const COOLDOWN_MILLISECONDS = 60_000;
const acquireScript = `
if redis.call("SET", KEYS[1], "1", "PX", ARGV[1], "NX") then
  return 0
end
local remaining = redis.call("PTTL", KEYS[1])
if remaining >= 0 then
  return math.max(1, remaining)
end
return remaining
`;

function key(phone: string) {
  return `mobile-code-cooldown:${phone.trim()}`;
}

function seconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid SMS cooldown state");
  return Math.ceil(value / 1000);
}

export function createMobileCodeCooldown(redis: Pick<RedisPort, "eval">) {
  return {
    async acquire(phone: string): Promise<number> {
      return seconds(await redis.eval(acquireScript, 1, key(phone), String(COOLDOWN_MILLISECONDS)));
    },
    async remainingSeconds(phone: string): Promise<number> {
      const remaining = await redis.eval("return redis.call(\"PTTL\", KEYS[1])", 1, key(phone));
      return remaining === -2 ? 0 : seconds(remaining);
    },
  };
}
