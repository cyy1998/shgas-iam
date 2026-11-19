import { createHash } from "node:crypto";
import { z } from "zod";
import type { CustomSsoStateRedis } from "./state";
import { CustomSsoStateUnavailableError } from "./state";

export const tokenRecordSchema = z
  .object({
    version: z.literal(1),
    protocol: z.literal("custom_sso"),
    purpose: z.enum(["business", "managed"]),
    tokenId: z.uuid(),
    clientCode: z.string().min(1).max(256),
    userSessionId: z.uuid(),
    clientSessionId: z.uuid(),
    userSessionInstance: z.uuid(),
    clientSessionInstance: z.uuid(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type CustomSsoTokenRecord = z.infer<typeof tokenRecordSchema>;
export const tokenDigest = (bearer: string) => createHash("sha256").update(bearer).digest("hex");

export function createCustomSsoTokenState(redis: CustomSsoStateRedis, namespace: string) {
  const prefix = `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:custom-sso:v1:`;
  async function execute(script: string, key: string, ...args: string[]) {
    try {
      return await redis.eval(script, 1, key, ...args);
    } catch {
      throw new CustomSsoStateUnavailableError();
    }
  }
  return {
    async save(bearer: string, input: CustomSsoTokenRecord) {
      const record = tokenRecordSchema.parse(input);
      const result = await execute(
        "return redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2],'NX')",
        `${prefix}token:${tokenDigest(bearer)}`,
        JSON.stringify(record),
        String(record.expiresAt),
      );
      if (result !== "OK") throw new CustomSsoStateUnavailableError("corrupt");
    },
    async read(bearer: string) {
      if (bearer.length > 4096 || !bearer) return null;
      const raw = await execute(
        `local v=redis.call('GET',KEYS[1]); if not v then return nil end; local t=redis.call('TIME'); return {v,t[1]*1000+math.floor(t[2]/1000)}`,
        `${prefix}token:${tokenDigest(bearer)}`,
      );
      if (raw === null) return null;
      try {
        const [value, now] = z.tuple([z.string(), z.number()]).parse(raw);
        const record = tokenRecordSchema.parse(JSON.parse(value));
        if (record.expiresAt <= now) return null;
        return { record, remainingSeconds: Math.max(0, Math.floor((record.expiresAt - now) / 1000)) };
      } catch {
        throw new CustomSsoStateUnavailableError("corrupt");
      }
    },
    async remove(bearer: string, record: CustomSsoTokenRecord) {
      const result = await execute(
        "local v=redis.call('GET',KEYS[1]); if not v then return 'missing' end; if v~=ARGV[1] then return 'replaced' end; redis.call('DEL',KEYS[1]); return 'removed'",
        `${prefix}token:${tokenDigest(bearer)}`,
        JSON.stringify(record),
      );
      return z.enum(["removed", "missing", "replaced"]).parse(result);
    },
  };
}
