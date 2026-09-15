import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { codeDigest, createOidcState, digest, parseOidcCode, statePrefix } from "./state";
import { createOidcTokenState } from "./token-state";

export { createOidcMaintenanceTestFixture } from "./offline/testing";

/** Owner-only state observation and faults. Tests do not reimplement persistence or a Redis server. */
export async function createOidcRedisTestScope(url: string) {
  const redis = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  await redis.ping();
  const namespace = `iam-oidc-test:${randomUUID()}`;
  const prefix = statePrefix(namespace);
  const state = createOidcState(redis, namespace);
  const tokens = createOidcTokenState(redis, namespace);
  type Action = "takeCode" | "saveToken" | "logout";
  let fault: { action: Action; after: boolean } | undefined;
  let interception:
    { action: "takeCode" | "saveToken"; callback: () => Promise<void>; before?: boolean } | undefined;
  const adapter = {
    async eval(script: string, count: number, ...args: string[]) {
      const action = args[0]?.startsWith(`${prefix}logout:`)
        ? "logout"
        : script.includes("GETDEL")
          ? "takeCode"
          : count === 2
            ? "saveToken"
            : undefined;
      const current = action && fault?.action === action ? fault : undefined;
      if (current)
        fault = undefined;
      if (current && !current.after)
        throw new Error("Injected OIDC request failure");
      if (action && interception?.action === action && interception.before) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      const result = await redis.eval(script, count, ...args);
      if (action && interception?.action === action) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      if (current?.after)
        throw new Error("Injected OIDC response loss");
      return result;
    },
  };
  async function ownedKeys() {
    let cursor = "0";
    const keys: string[] = [];
    do {
      const page = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = page[0];
      keys.push(...page[1]);
    } while (cursor !== "0");
    return keys;
  }
  function codeKey(clientId: string, code: string) {
    const identity = parseOidcCode(code);
    if (!identity)
      throw new Error("Invalid code fixture");
    return `${prefix}code:${codeDigest(clientId, identity)}`;
  }
  return {
    redis,
    adapter,
    namespace,
    readCode: state.readCode,
    readToken: tokens.read,
    failNext(action: Action, after = false) {
      fault = { action, after };
    },
    afterNext(action: "takeCode" | "saveToken", callback: () => Promise<void>) {
      interception = { action, callback };
    },
    beforeNext(action: "takeCode" | "saveToken", callback: () => Promise<void>) {
      interception = { action, callback, before: true };
    },
    async patchCode(clientId: string, code: string, patch: Record<string, unknown>) {
      const key = codeKey(clientId, code);
      const raw = await redis.get(key);
      if (!raw)
        throw new Error("Missing Code fixture");
      await redis.set(key, JSON.stringify({ ...JSON.parse(raw), ...patch }), "KEEPTTL");
    },
    async forgetTokenIndex(bearer: string) {
      const record = await tokens.read(bearer);
      if (record)
        await redis.del(`${prefix}token-id:${record.id}`);
    },
    async removeTokenTtl(bearer: string) {
      const record = await tokens.read(bearer);
      if (record) {
        await redis.persist(`${prefix}token:${record.digest}`);
        await redis.persist(`${prefix}token-id:${record.id}`);
      }
    },
    async corruptToken(bearer: string) {
      await redis.set(`${prefix}token:${digest(bearer)}`, "corrupt", "KEEPTTL");
    },
    async tokens() {
      const keys = (await ownedKeys()).filter(key => key.startsWith(`${prefix}token:`));
      return await Promise.all(keys.map(async key => JSON.parse((await redis.get(key))!)));
    },
    async codeExpiry(clientId: string, code: string) {
      return await redis.pexpiretime(codeKey(clientId, code));
    },
    async removeCodeTtl(clientId: string, code: string) {
      await redis.persist(codeKey(clientId, code));
    },
    async corruptCode(clientId: string, code: string) {
      await redis.set(codeKey(clientId, code), "corrupt", "KEEPTTL");
    },
    async readContinuation(handle: string, binding: string) {
      return await state.readContinuation(handle, binding);
    },
    async removeContinuationTtl(handle: string) {
      await redis.persist(`${prefix}continuation:${digest(handle)}`);
    },
    async removeLogoutTtl(handle: string) {
      await redis.persist(`${prefix}logout:${digest(handle)}`);
    },
    async patchLogout(handle: string, patch: Record<string, unknown>) {
      const key = `${prefix}logout:${digest(handle)}`;
      const raw = await redis.get(key);
      if (!raw)
        throw new Error("Missing logout fixture");
      await redis.set(key, JSON.stringify({ ...JSON.parse(raw), ...patch }), "KEEPTTL");
    },
    async addUnknown() {
      await redis.set(`${prefix}unknown`, "preserve");
    },
    async snapshot() {
      return await Promise.all(
        (await ownedKeys())
          .sort()
          .map(async key => ({
            key,
            value: await redis.get(key),
            expiresAt: await redis.pexpiretime(key),
          })),
      );
    },
    async close() {
      try {
        const keys = await ownedKeys();
        if (keys.length)
          await redis.del(...keys);
      }
      finally {
        redis.disconnect();
      }
    },
  };
}
