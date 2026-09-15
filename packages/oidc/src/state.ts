import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { OidcStateUnavailableError } from "./errors";
import { OidcResponseModeSchema, OidcReturnHandleSchema } from "./wire";

export interface OidcStateRedis {
  eval: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
}
export const randomHandle = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const acceptedAuthorizationSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.url(),
  scope: z.string().min(1),
  state: z.string().min(1),
  responseMode: OidcResponseModeSchema,
  codeChallenge: z.string().regex(/^[\w.~-]{43,128}$/u),
  codeChallengeMethod: z.literal("S256"),
  nonce: z.string().optional(),
  prompt: z.string(),
  maxAge: z.number().int().nonnegative().optional(),
}).strict();
export type AcceptedAuthorization = z.infer<typeof acceptedAuthorizationSchema>;
export const codeRecordSchema = acceptedAuthorizationSchema.extend({
  version: z.literal(1),
  protocol: z.literal("oidc"),
  codeId: OidcReturnHandleSchema,
  userSessionId: z.uuid(),
  clientSessionId: z.uuid(),
  userSessionInstance: z.uuid(),
  clientSessionInstance: z.uuid(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();
export type OidcCodeRecord = z.infer<typeof codeRecordSchema>;
export const continuationSchema = z.object({
  version: z.literal(1),
  authorization: acceptedAuthorizationSchema,
  browserDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  completionDigest: z.string().nullable(),
  expiresAt: z.number().int().positive(),
}).strict();
export type OidcContinuation = z.infer<typeof continuationSchema>;

export function statePrefix(namespace: string) {
  return `${z.string().regex(/^[\w:-]+$/u).parse(namespace)}:oidc:v1:`;
}
export function parseOidcCode(code: string) {
  if (code.length > 200)
    return null;
  const [codeId, userSessionId, clientSessionId, extra] = code.split(".");
  if (extra !== undefined || !OidcReturnHandleSchema.safeParse(codeId).success
    || !z.uuid().safeParse(userSessionId).success || !z.uuid().safeParse(clientSessionId).success) {
    return null;
  }
  return { codeId: codeId!, userSessionId: userSessionId!, clientSessionId: clientSessionId! };
}
export function codeDigest(clientId: string, code: NonNullable<ReturnType<typeof parseOidcCode>>) {
  return digest(JSON.stringify([clientId, code.userSessionId, code.clientSessionId, code.codeId]));
}

/** The protocol alone owns these records. Every Code key includes the original Client and both session IDs. */
export function createOidcState(redis: OidcStateRedis, namespace: string) {
  const prefix = statePrefix(namespace);
  async function execute(script: string, key: string, ...args: string[]) {
    try {
      return await redis.eval(script, 1, key, ...args);
    }
    catch { throw new OidcStateUnavailableError(); }
  }
  async function readContinuation(handle: string, browserBinding: string) {
    if (!OidcReturnHandleSchema.safeParse(handle).success || !browserBinding)
      return null;
    const raw = await execute("local v=redis.call('GET',KEYS[1]); if not v then return nil end; local t=redis.call('TIME'); return {v,t[1]*1000+math.floor(t[2]/1000)}", `${prefix}continuation:${digest(handle)}`);
    if (raw === null)
      return null;
    try {
      const [text, now] = z.tuple([z.string(), z.number()]).parse(raw);
      const value = continuationSchema.parse(JSON.parse(text));
      if (value.expiresAt <= now || value.browserDigest !== digest(browserBinding))
        return null;
      return value;
    }
    catch { throw new OidcStateUnavailableError("corrupt"); }
  }
  return {
    async takeCode(clientId: string, identity: NonNullable<ReturnType<typeof parseOidcCode>>) {
      const raw = await execute("local v=redis.call('GETDEL',KEYS[1]); if not v then return nil end; local t=redis.call('TIME'); return {v,t[1]*1000+math.floor(t[2]/1000)}", `${prefix}code:${codeDigest(clientId, identity)}`);
      if (raw === null)
        return null;
      const result = z.tuple([z.string(), z.number().int().nonnegative()]).safeParse(raw);
      if (!result.success)
        throw new OidcStateUnavailableError();
      return { raw: result.data[0], now: result.data[1] };
    },
    async saveCode(record: OidcCodeRecord) {
      const value = codeRecordSchema.parse(record);
      const result = await execute("return redis.call('SET',KEYS[1],ARGV[1],'PXAT',ARGV[2],'NX')", `${prefix}code:${codeDigest(value.clientId, value)}`, JSON.stringify(value), String(value.expiresAt));
      if (result !== "OK")
        throw new OidcStateUnavailableError();
    },
    async readCode(clientId: string, code: string) {
      const identity = parseOidcCode(code);
      if (!identity)
        return null;
      const raw = await execute("return redis.call('GET',KEYS[1])", `${prefix}code:${codeDigest(clientId, identity)}`);
      if (raw === null)
        return null;
      try {
        const value = codeRecordSchema.parse(JSON.parse(String(raw)));
        if (value.clientId !== clientId || codeDigest(value.clientId, value) !== codeDigest(clientId, identity))
          throw new Error("Code identity mismatch");
        return value;
      }
      catch { throw new OidcStateUnavailableError("corrupt"); }
    },
    async saveContinuation(input: Omit<OidcContinuation, "version" | "expiresAt" | "browserDigest">, browserBinding: string, ttl: number) {
      const handle = randomHandle();
      const value = { ...input, version: 1, browserDigest: digest(browserBinding) };
      const result = await execute("local t=redis.call('TIME'); local v=cjson.decode(ARGV[1]); v.expiresAt=t[1]*1000+math.floor(t[2]/1000)+tonumber(ARGV[2]); redis.call('SET',KEYS[1],cjson.encode(v),'PX',ARGV[2],'NX'); return 'OK'", `${prefix}continuation:${digest(handle)}`, JSON.stringify(value), String(ttl * 1000));
      if (result !== "OK")
        throw new OidcStateUnavailableError();
      return handle;
    },
    readContinuation,
    async allowCompletion(handle: string, browserBinding: string, completion: string) {
      const key = `${prefix}continuation:${digest(handle)}`;
      const result = await execute("local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local ok,v=pcall(cjson.decode,raw); if not ok then return -1 end; if v.browserDigest~=ARGV[1] then return 0 end; v.completionDigest=ARGV[2]; redis.call('SET',KEYS[1],cjson.encode(v),'KEEPTTL'); return 1", key, digest(browserBinding), digest(completion));
      if (result !== 0 && result !== 1)
        throw new OidcStateUnavailableError("corrupt");
      return result === 1;
    },
    async consumeContinuation(handle: string, browserBinding: string) {
      const result = await execute("local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local ok,v=pcall(cjson.decode,raw); if not ok then return -1 end; local t=redis.call('TIME'); if v.browserDigest==ARGV[1] and v.expiresAt>t[1]*1000+math.floor(t[2]/1000) then return redis.call('DEL',KEYS[1]) end; return 0", `${prefix}continuation:${digest(handle)}`, digest(browserBinding));
      if (result !== 0 && result !== 1)
        throw new OidcStateUnavailableError("corrupt");
      return result === 1;
    },
  };
}
