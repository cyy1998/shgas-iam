import type { OidcStateRedis } from "./state";
import { z } from "zod";
import { OidcStateUnavailableError } from "./errors";
import { digest, statePrefix } from "./state";

export const tokenRecordSchema = z.object({
  issuer: z.url(),
  version: z.literal(1),
  purpose: z.literal("oidc_access"),
  id: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  clientId: z.string().min(1),
  userSessionId: z.uuid(),
  clientSessionId: z.uuid(),
  userSessionInstance: z.uuid(),
  clientSessionInstance: z.uuid(),
  scope: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();
export type OidcTokenRecord = z.infer<typeof tokenRecordSchema>;

export function createOidcTokenState(redis: OidcStateRedis, namespace: string) {
  const prefix = statePrefix(namespace);
  return {
    async save(bearer: string, record: OidcTokenRecord) {
      const value = tokenRecordSchema.parse(record);
      if (value.digest !== digest(bearer))
        throw new OidcStateUnavailableError("corrupt");
      try {
        const result = await redis.eval("if redis.call('EXISTS',KEYS[1],KEYS[2])>0 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2]); redis.call('SET',KEYS[2],ARGV[3],'PXAT',ARGV[2]); return 1", 2, `${prefix}token:${value.digest}`, `${prefix}token-id:${value.id}`, JSON.stringify(value), String(value.expiresAt), value.digest);
        if (result !== 1)
          throw new OidcStateUnavailableError();
      }
      catch { throw new OidcStateUnavailableError(); }
    },
    async read(bearer: string) {
      if (!/^oa_[\w-]{43}$/u.test(bearer))
        return null;
      let raw;
      try {
        raw = await redis.eval("local v=redis.call('GET',KEYS[1]); if not v then return nil end; local t=redis.call('TIME'); return {v,t[1]*1000+math.floor(t[2]/1000)}", 1, `${prefix}token:${digest(bearer)}`);
      }
      catch { throw new OidcStateUnavailableError(); }
      if (raw === null)
        return null;
      try {
        const [text, now] = z.tuple([z.string(), z.number()]).parse(raw);
        const record = tokenRecordSchema.parse(JSON.parse(text));
        if (record.digest !== digest(bearer) || record.issuedAt > now || record.expiresAt <= record.issuedAt)
          throw new Error("Token integrity failure");
        return record.expiresAt > now ? record : null;
      }
      catch { throw new OidcStateUnavailableError("corrupt"); }
    },
  };
}
