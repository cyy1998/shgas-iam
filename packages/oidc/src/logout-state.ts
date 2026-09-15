import type { OidcStateRedis } from "./state";
import { z } from "zod";
import { OidcStateUnavailableError } from "./errors";
import { digest, randomHandle, statePrefix } from "./state";
import { OidcReturnHandleSchema } from "./wire";

export const logoutRecordSchema = z
  .object({
    version: z.literal(1),
    clientId: z.string().min(1).nullable(),
    hint: z
      .object({ digest: z.string().regex(/^[a-f0-9]{64}$/u), subjectIdentifier: z.string().min(1) })
      .strict()
      .nullable(),
    redirectUri: z.url().nullable(),
    state: z.string().nullable(),
    browserDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    csrfDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type OidcLogoutRecord = z.infer<typeof logoutRecordSchema>;

export function createOidcLogoutState(redis: OidcStateRedis, namespace: string) {
  const prefix = `${statePrefix(namespace)}logout:`;
  async function execute(script: string, handle: string, ...args: string[]) {
    try {
      return await redis.eval(script, 1, `${prefix}${digest(handle)}`, ...args);
    }
    catch {
      throw new OidcStateUnavailableError();
    }
  }
  return {
    async save(
      input: Omit<OidcLogoutRecord, "version" | "expiresAt" | "browserDigest" | "csrfDigest">,
      binding: string,
      ttl: number,
    ) {
      const handle = randomHandle();
      const xsrf = randomHandle();
      const value = { ...input, version: 1, browserDigest: digest(binding), csrfDigest: digest(xsrf) };
      const result = await execute(
        "local t=redis.call('TIME'); local v=cjson.decode(ARGV[1]); v.expiresAt=t[1]*1000+math.floor(t[2]/1000)+tonumber(ARGV[2]); return redis.call('SET',KEYS[1],cjson.encode(v),'PX',ARGV[2],'NX')",
        handle,
        JSON.stringify(value),
        String(ttl * 1000),
      );
      if (result !== "OK")
        throw new OidcStateUnavailableError();
      return { handle, xsrf };
    },
    async read(handle: string, binding: string, xsrf: string) {
      if (
        !OidcReturnHandleSchema.safeParse(handle).success
        || !OidcReturnHandleSchema.safeParse(binding).success
        || !OidcReturnHandleSchema.safeParse(xsrf).success
      ) {
        return null;
      }
      const raw = await execute(
        "local v=redis.call('GET',KEYS[1]); if not v then return nil end; local t=redis.call('TIME'); return {v,t[1]*1000+math.floor(t[2]/1000)}",
        handle,
      );
      if (raw === null)
        return null;
      try {
        const [text, now] = z.tuple([z.string(), z.number()]).parse(raw);
        const value = logoutRecordSchema.parse(JSON.parse(text));
        if (
          value.browserDigest !== digest(binding)
          || value.csrfDigest !== digest(xsrf)
          || value.expiresAt <= now
        ) {
          return null;
        }
        return { value, raw: text };
      }
      catch {
        throw new OidcStateUnavailableError("corrupt");
      }
    },
    async consume(handle: string, raw: string) {
      const result = await execute(
        "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; return redis.call('DEL',KEYS[1])",
        handle,
        raw,
      );
      if (result !== 0 && result !== 1)
        throw new OidcStateUnavailableError();
      return result === 1;
    },
  };
}
