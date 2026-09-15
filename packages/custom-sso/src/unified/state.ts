import { createHash, randomBytes } from "node:crypto";
import { RETRYABLE_SERVICE_UNAVAILABLE } from "@iam/contracts";
import { z } from "zod";

export interface CustomSsoStateRedis {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}

const acceptedSchema = z
  .object({
    clientCode: z.string().min(1),
    redirectUrl: z.url(),
    callbackEndpoint: z.url(),
    redeemer: z.enum(["business", "managed"]),
    state: z.string().optional(),
  })
  .strict();
export type AcceptedAuthorization = z.infer<typeof acceptedSchema>;
export const codeRecordSchema = acceptedSchema
  .extend({
    version: z.literal(1),
    protocol: z.literal("custom_sso"),
    codeId: z.string().regex(/^[\w-]{43}$/u),
    userSessionId: z.uuid(),
    clientSessionId: z.uuid(),
    userSessionInstance: z.uuid(),
    clientSessionInstance: z.uuid(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type CustomSsoCodeRecord = z.infer<typeof codeRecordSchema>;
export const continuationSchema = acceptedSchema
  .extend({ browserDigest: z.string(), expiresAt: z.number() })
  .strict();
const handleSchema = z.string().regex(/^[\w-]{43}$/u);
export const randomHandle = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class CustomSsoStateUnavailableError extends Error {
  readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;
  constructor(readonly outcome: "unknown" | "corrupt" = "unknown") {
    super("Custom SSO state unavailable");
  }
}

export function parseBusinessCode(code: string) {
  if (code.length > 200)
    return null;
  const parts = code.split(".");
  if (
    parts.length !== 3
    || !handleSchema.safeParse(parts[0]).success
    || !z.uuid().safeParse(parts[1]).success
    || !z.uuid().safeParse(parts[2]).success
  ) {
    return null;
  }
  return { codeId: parts[0]!, userSessionId: parts[1]!, clientSessionId: parts[2]! };
}

/** All state is owned by this protocol. No legacy namespace or consumed record is read. */
export function createCustomSsoState(redis: CustomSsoStateRedis, namespace: string) {
  const prefix = `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:custom-sso:v1:`;
  async function execute(script: string, key: string, ...args: string[]) {
    try {
      return await redis.eval(script, 1, key, ...args);
    }
    catch {
      throw new CustomSsoStateUnavailableError();
    }
  }
  const codeKey = (clientCode: string, userSessionId: string, clientSessionId: string, codeId: string) =>
    `${prefix}code:${digest(JSON.stringify([clientCode, userSessionId, clientSessionId, codeId]))}`;
  return {
    async consumeCode(record: CustomSsoCodeRecord) {
      const key = codeKey(record.clientCode, record.userSessionId, record.clientSessionId, record.codeId);
      const result = await execute(
        `local v=redis.call('GET',KEYS[1]); if not v then return 'missing' end; if v~=ARGV[1] then return 'changed' end; local t=redis.call('TIME'); if tonumber(ARGV[2])<=t[1]*1000+math.floor(t[2]/1000) then return 'missing' end; redis.call('DEL',KEYS[1]); return 'consumed'`,
        key,
        JSON.stringify(record),
        String(record.expiresAt),
      );
      if (result !== "consumed" && result !== "missing" && result !== "changed")
        throw new CustomSsoStateUnavailableError("corrupt");
      return result;
    },
    async saveCode(record: CustomSsoCodeRecord) {
      const value = codeRecordSchema.parse(record);
      const result = await execute(
        "return redis.call('SET', KEYS[1], ARGV[1], 'PXAT', ARGV[2], 'NX')",
        codeKey(value.clientCode, value.userSessionId, value.clientSessionId, value.codeId),
        JSON.stringify(value),
        String(value.expiresAt),
      );
      if (result !== "OK")
        throw new CustomSsoStateUnavailableError();
    },
    async readCode(clientCode: string, code: string) {
      if (code.length > 200)
        return null;
      const parts = code.split(".");
      if (
        parts.length !== 3
        || !handleSchema.safeParse(parts[0]).success
        || !z.uuid().safeParse(parts[1]).success
        || !z.uuid().safeParse(parts[2]).success
      ) {
        return null;
      }
      const [codeId, userSessionId, clientSessionId] = parts as [string, string, string];
      const raw = await execute(
        "return redis.call('GET', KEYS[1])",
        codeKey(clientCode, userSessionId, clientSessionId, codeId),
      );
      if (raw === null)
        return null;
      try {
        const record = codeRecordSchema.parse(JSON.parse(String(raw)));
        if (
          record.clientCode !== clientCode
          || record.codeId !== codeId
          || record.userSessionId !== userSessionId
          || record.clientSessionId !== clientSessionId
        ) {
          throw new Error("Code identity mismatch");
        }
        return record;
      }
      catch {
        throw new CustomSsoStateUnavailableError("corrupt");
      }
    },
    async saveContinuation(accepted: AcceptedAuthorization, browserBinding: string, ttlSeconds: number) {
      const handle = randomHandle();
      const result = await execute(
        `local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000); local v=cjson.decode(ARGV[1]); v.expiresAt=now+tonumber(ARGV[2]); redis.call('SET',KEYS[1],cjson.encode(v),'PX',ARGV[2]); return 'OK'`,
        `${prefix}continuation:${digest(handle)}`,
        JSON.stringify({ ...acceptedSchema.parse(accepted), browserDigest: digest(browserBinding) }),
        String(ttlSeconds * 1000),
      );
      if (result !== "OK")
        throw new CustomSsoStateUnavailableError();
      return handle;
    },
    async readContinuation(handle: string, browserBinding: string) {
      if (!handleSchema.safeParse(handle).success || !browserBinding)
        return null;
      const raw = await execute(
        "return redis.call('GET',KEYS[1])",
        `${prefix}continuation:${digest(handle)}`,
      );
      if (raw === null)
        return null;
      try {
        const value = continuationSchema.parse(JSON.parse(String(raw)));
        if (value.browserDigest !== digest(browserBinding))
          return null;
        return {
          clientCode: value.clientCode,
          redirectUrl: value.redirectUrl,
          callbackEndpoint: value.callbackEndpoint,
          redeemer: value.redeemer,
          ...(value.state === undefined ? {} : { state: value.state }),
        };
      }
      catch {
        throw new CustomSsoStateUnavailableError();
      }
    },
  };
}
