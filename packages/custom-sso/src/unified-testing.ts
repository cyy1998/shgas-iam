import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { createCustomSsoState } from "./unified/state";
import { createCustomSsoTokenState, tokenDigest } from "./unified/token-state";
import { createUnifiedCustomSsoInventory, createUnifiedCustomSsoMaintenance } from "./unified-maintenance";

export async function createUnifiedCustomSsoRedisTestScope(
  url: string,
  trackStop?: (stop: () => Promise<void>) => void,
) {
  const redis = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  let closePromise: Promise<void> | undefined;
  let initialized = false;
  function close() {
    closePromise ??= (async () => {
      const ended =
        redis.status === "end" ? Promise.resolve() : new Promise<void>((resolve) => redis.once("end", resolve));
      try {
        if (initialized && redis.status !== "end") await redis.quit();
      } finally {
        redis.disconnect();
        await ended;
      }
    })();
    return closePromise;
  }
  try {
    trackStop?.(close);
    await redis.ping();
    if (closePromise) throw new Error("Custom SSO Redis test scope stopped during setup");
    initialized = true;
  } catch (error) {
    try {
      await close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], "Custom SSO Redis test scope setup failed");
    }
    throw error;
  }
  const namespace = `test:custom:${randomUUID()}`;
  const prefix = `${namespace}:custom-sso:v1:`;
  type Action = "consume" | "saveToken" | "removeToken";
  let fault: { after: boolean; action?: Action } | undefined;
  let interception: { action: "consume" | "saveToken"; callback: () => Promise<void> } | undefined;
  const adapter = {
    async eval(script: string, keyCount: number, ...args: string[]) {
      const action = script.includes("return 'consumed'")
        ? "consume"
        : script.includes("return 'removed'")
          ? "removeToken"
          : args[0]?.startsWith(`${prefix}token:`) && script.includes("'NX'")
            ? "saveToken"
            : undefined;
      const current = fault && (!fault.action || fault.action === action) ? fault : undefined;
      if (current) fault = undefined;
      if (current && !current.after) throw new Error("Injected protocol state transport failure");
      const result = await redis.eval(script, keyCount, ...args);
      if (interception && interception.action === action) {
        const callback = interception.callback;
        interception = undefined;
        await callback();
      }
      if (current?.after) throw new Error("Injected protocol state response loss");
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
    failAction(action: Action, after = false) {
      fault = { after, action };
    },
    afterAction(action: "consume" | "saveToken", callback: () => Promise<void>) {
      interception = { action, callback };
    },
    namespace,
    inspectCode: state.readCode,
    inspectToken: tokens.read,
    saveToken: tokens.save,
    removeToken: tokens.remove,
    maintenance: createUnifiedCustomSsoMaintenance(redis, namespace),
    async independentInventory() {
      const reader = new Redis(url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
      try {
        return await createUnifiedCustomSsoInventory(reader, namespace).inventory({ limit: 1000 });
      } finally {
        reader.disconnect();
      }
    },
    async seedLegacyTokenIndex(bearer: string) {
      const token = await tokens.read(bearer);
      if (!token) throw new Error("Token fixture missing");
      await redis.set(`${prefix}token-id:${token.record.tokenId}`, tokenDigest(bearer), "PXAT", token.record.expiresAt);
    },
    async tokenKeyExpiries(bearer: string, tokenId: string) {
      return await Promise.all([
        redis.pexpiretime(`${prefix}token:${tokenDigest(bearer)}`),
        redis.pexpiretime(`${prefix}token-id:${tokenId}`),
      ]);
    },
    async removeTokenTtl(bearer: string) {
      await redis.persist(`${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`);
    },
    async corruptToken(bearer: string) {
      await redis.set(`${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`, "broken", "KEEPTTL");
    },
    async replaceToken(bearer: string, patch: object) {
      const token = await tokens.read(bearer);
      if (!token) throw new Error("Token fixture missing");
      await redis.set(
        `${namespace}:custom-sso:v1:token:${tokenDigest(bearer)}`,
        JSON.stringify({ ...token.record, ...patch }),
        "KEEPTTL",
      );
    },
    async tokenInventory() {
      const keys = await redis.keys(`${namespace}:custom-sso:v1:token:*`);
      return await Promise.all(
        keys.map(async (key) => ({ raw: await redis.get(key), expiresAt: await redis.pexpiretime(key) })),
      );
    },
    async corruptCode(clientCode: string, code: string) {
      const record = await state.readCode(clientCode, code);
      if (!record) throw new Error("Code fixture missing");
      const key = `${namespace}:custom-sso:v1:code:${tokenDigest(JSON.stringify([clientCode, record.userSessionId, record.clientSessionId, record.codeId]))}`;
      await redis.set(key, "broken", "KEEPTTL");
    },
    async replaceCode(clientCode: string, code: string, patch: object) {
      const record = await state.readCode(clientCode, code);
      if (!record) throw new Error("Code fixture missing");
      const key = `${namespace}:custom-sso:v1:code:${tokenDigest(JSON.stringify([clientCode, record.userSessionId, record.clientSessionId, record.codeId]))}`;
      await redis.set(key, JSON.stringify({ ...record, ...patch }), "KEEPTTL");
    },
    close,
  };
}
