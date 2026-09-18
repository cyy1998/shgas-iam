import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { createUnifiedCustomSsoInventory, createUnifiedCustomSsoMaintenance } from "./unified-maintenance";
import { createCustomSsoState } from "./unified/state";
import { createCustomSsoTokenState, tokenDigest } from "./unified/token-state";

export async function createUnifiedCustomSsoRedisTestScope(url: string) {
  const redis = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  await redis.ping();
  const namespace = `test:custom:${randomUUID()}`;
  let fault: { after: boolean; match?: string } | undefined;
  let interception: { match: string; callback: () => Promise<void> } | undefined;
  const adapter = {
    async eval(script: string, keyCount: number, ...args: string[]) {
      const current = fault && (!fault.match || script.includes(fault.match)) ? fault : undefined;
      if (current)
        fault = undefined;
      if (current && !current.after)
        throw new Error("Injected protocol state transport failure");
      const result = await redis.eval(script, keyCount, ...args);
      if (interception && script.includes(interception.match)) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      if (current?.after)
        throw new Error("Injected protocol state response loss");
      return result;
    },
  };
  const state = createCustomSsoState(adapter, namespace);
  const tokens = createCustomSsoTokenState(adapter, namespace);
  return {
    redis: adapter,
    failNext(after = false) {
      fault = { after };
    },
    failAction(action: "consume" | "saveToken" | "removeToken", after = false) {
      fault = {
        after,
        match:
          action === "consume"
            ? "return 'consumed'"
            : action === "saveToken"
              ? "return 'saved'"
              : "return 'removed'",
      };
    },
    afterAction(action: "consume" | "saveToken", callback: () => Promise<void>) {
      interception = { match: action === "consume" ? "return 'consumed'" : "return 'saved'", callback };
    },
    namespace,
    inspectCode: state.readCode,
    inspectToken: tokens.read,
    maintenance: createUnifiedCustomSsoMaintenance(redis, namespace),
    async independentInventory() {
      const reader = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
      try {
        return await createUnifiedCustomSsoInventory(reader, namespace).inventory({ limit: 1000 });
      }
      finally {
        reader.disconnect();
      }
    },
    async removeTokenIndex(bearer: string) {
      const token = await tokens.read(bearer);
      if (!token)
        throw new Error("Token fixture missing");
      await redis.del(`${namespace}:custom-sso:v1:token-id:${token.record.tokenId}`);
    },
    async removeTokenTtl(bearer: string) {
      await redis.persist(`${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`);
    },
    async corruptToken(bearer: string) {
      await redis.set(`${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`, "broken", "KEEPTTL");
    },
    async replaceToken(bearer: string, patch: object) {
      const token = await tokens.read(bearer);
      if (!token)
        throw new Error("Token fixture missing");
      await redis.set(`${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`, JSON.stringify({ ...token.record, ...patch }), "KEEPTTL");
    },
    async tokenInventory() {
      const keys = await redis.keys(`${namespace}:custom-sso:v1:token:*`);
      return await Promise.all(
        keys.map(async key => ({ raw: await redis.get(key), expiresAt: await redis.pexpiretime(key) })),
      );
    },
    async corruptCode(clientCode: string, code: string) {
      const record = await state.readCode(clientCode, code);
      if (!record)
        throw new Error("Code fixture missing");
      const key = `${namespace}:custom-sso:v1:code:${tokenDigest(JSON.stringify([clientCode, record.userSessionId, record.clientSessionId, record.codeId]))}`;
      await redis.set(key, "broken", "KEEPTTL");
    },
    async replaceCode(clientCode: string, code: string, patch: object) {
      const record = await state.readCode(clientCode, code);
      if (!record)
        throw new Error("Code fixture missing");
      const key = `${namespace}:custom-sso:v1:code:${tokenDigest(JSON.stringify([clientCode, record.userSessionId, record.clientSessionId, record.codeId]))}`;
      await redis.set(key, JSON.stringify({ ...record, ...patch }), "KEEPTTL");
    },
    async close() {
      try {
        const keys = await redis.keys(`${namespace}:custom-sso:v1:*`);
        if (keys.length)
          await redis.del(...keys);
      }
      finally {
        redis.disconnect();
      }
    },
  };
}
