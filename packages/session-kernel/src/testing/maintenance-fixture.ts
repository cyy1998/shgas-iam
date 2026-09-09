import type Redis from "ioredis";
import type { LifecycleObjectKind, ProtocolArtifact } from "../state/model";
import { parseLifecycleObject } from "../state/model";
import { createSessionKernelKeyBuilder, encodeIndexMember } from "../storage/keys";

/** Semantic inventory faults and byte/absolute-expiry observations owned by Kernel. */
export function createKernelMaintenanceFixture(redis: Redis, namespace: string) {
  const keys = createSessionKernelKeyBuilder(namespace);
  async function artifact(id: string) {
    const raw = await redis.get(keys.active("artifact", id));
    const parsed = raw === null ? null : parseLifecycleObject("artifact", raw);
    if (!parsed?.success)
      throw new Error("Expected fixture artifact");
    return parsed.data;
  }
  function indexes(value: ProtocolArtifact) {
    return [
      ...(value.principalSessionId ? [keys.index.principal(value.principalSessionId)] : []),
      ...(value.bindingId ? [keys.index.binding(value.bindingId)] : []),
      ...(value.clientCode ? [keys.index.client(value.clientCode), keys.index.clientProtocol(value.clientCode, value.protocol)] : []),
      keys.index.protocol(value.protocol),
    ];
  }
  return {
    async observeArtifactReferences(value: ProtocolArtifact) {
      const references = [keys.active("artifact", value.artifactId), keys.lookup("artifact", value.lookupHash), keys.tombstone("artifact", value.artifactId), keys.lookupTombstone("artifact", value.lookupHash)];
      return await Promise.all(references.map(async key => ({ payload: await redis.get(key), expiresAt: await redis.pexpiretime(key) })));
    },
    async redirectArtifactLookup(from: ProtocolArtifact, to: ProtocolArtifact) {
      await redis.set(keys.lookup("artifact", from.lookupHash), to.artifactId, "KEEPTTL");
    },
    async observe(kind: LifecycleObjectKind, id: string) {
      const key = keys.active(kind, id);
      const payload = await redis.get(key);
      const parsed = payload === null ? null : parseLifecycleObject(kind, payload);
      const object = parsed?.success ? parsed.data : undefined;
      const hash = object && "externalTokenLookupHash" in object
        ? object.externalTokenLookupHash
        : object && "lookupHash" in object ? object.lookupHash : undefined;
      const references = kind !== "client_binding" && hash
        ? [keys.lookup(kind, hash), keys.tombstone(kind, id), keys.lookupTombstone(kind, hash)]
        : [];
      const objectIndexes = object
        ? [
            ...(object.principalSessionId ? [keys.index.principal(object.principalSessionId)] : []),
            ...("bindingId" in object && object.bindingId ? [keys.index.binding(object.bindingId)] : []),
            ...("protocol" in object ? [keys.index.protocol(object.protocol)] : []),
            ...("clientCode" in object && object.clientCode ? [keys.index.client(object.clientCode), keys.index.clientProtocol(object.clientCode, object.protocol)] : []),
          ]
        : [];
      return {
        payload,
        expiresAt: await redis.pexpiretime(key),
        references: await Promise.all(references.map(async ref => ({ payload: await redis.get(ref), expiresAt: await redis.pexpiretime(ref) }))),
        memberships: await Promise.all(objectIndexes.map(index => redis.zscore(index, encodeIndexMember(kind, id)))),
      };
    },
    async observeTombstone(id: string) {
      const key = keys.tombstone("artifact", id);
      return { payload: await redis.get(key), expiresAt: await redis.pexpiretime(key) };
    },
    async forgetArtifactIndexes(id: string) {
      const value = await artifact(id);
      for (const key of indexes(value)) await redis.zrem(key, encodeIndexMember("artifact", id));
    },
    async removeArtifactPayload(id: string) { await redis.del(keys.active("artifact", id)); },
    async corruptArtifact(id: string, problem: "json" | "version" | "identity") {
      const value = await artifact(id);
      const raw = problem === "json" ? "{broken" : JSON.stringify({ ...value, ...(problem === "version" ? { version: 999 } : { artifactId: "other-owner" }) });
      await redis.set(keys.active("artifact", id), raw, "KEEPTTL");
    },
    async replaceArtifact(id: string) {
      const value = await artifact(id);
      await redis.set(keys.active("artifact", id), JSON.stringify({ ...value, metadata: { replacement: true } }), "KEEPTTL");
    },
    async replaceTombstone(id: string) {
      const key = keys.tombstone("artifact", id);
      const raw = await redis.get(key);
      if (!raw)
        throw new Error("Expected fixture tombstone");
      const value = JSON.parse(raw);
      await redis.set(key, JSON.stringify({ ...value, revokedAt: value.revokedAt + 1 }), "KEEPTTL");
    },
    async corruptArtifactIndex(id: string) {
      const value = await artifact(id);
      const key = keys.index.protocol(value.protocol);
      await redis.del(key);
      await redis.set(key, "wrong-type");
    },
  };
}
