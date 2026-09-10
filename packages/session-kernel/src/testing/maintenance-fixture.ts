import type Redis from "ioredis";
import type { LifecycleObjectKind, ProtocolArtifact } from "../state/model";
import { randomUUID } from "node:crypto";
import { parseLifecycleObject } from "../state/model";
import { createSessionKernelKeyBuilder, encodeIndexMember } from "../storage/keys";

/** Semantic inventory faults and byte/absolute-expiry observations owned by Kernel. */
export function createKernelMaintenanceFixture(redis: Redis, namespace: string) {
  const keys = createSessionKernelKeyBuilder(namespace);
  async function objectKey(kind: LifecycleObjectKind, id: string) {
    if (kind === "client_binding")
      return keys.active(kind, id);
    const hash = await redis.get(keys.identity(kind, id));
    if (!hash)
      throw new Error("Expected direct state identity");
    return keys.state(kind, hash);
  }
  async function artifact(id: string) {
    const raw = await redis.get(await objectKey("artifact", id));
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
    async expireArtifactGeneration(value: ProtocolArtifact) {
      await redis.del(keys.state("artifact", value.lookupHash), keys.identity("artifact", value.artifactId));
    },
    async seedDirectStateMaintenanceFaults(kind: "principal_session" | "credential" | "artifact") {
      const id = randomUUID();
      const hash = "f".repeat(64);
      const references = [
        keys.state(kind, hash),
        keys.identity(kind, id),
        keys.active(kind, id),
        keys.lookup(kind, hash),
        keys.tombstone(kind, id),
        keys.lookupTombstone(kind, hash),
      ];
      for (const key of references)
        await redis.set(key, "malformed-orphan-without-ttl");
      return {
        async observe() { return await redis.mget(...references); },
      };
    },
    pauseNextPrincipalObservation(principalSessionId: string) {
      let reached!: () => void;
      let release!: () => void;
      const paused = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = redis.sendCommand;
      redis.sendCommand = function (command, stream) {
        const result = original.call(this, command, stream);
        if (command.name === "eval" && String(command.args[0]).includes("session-kernel-observe-v1")
          && command.getKeys().some(key => String(key).startsWith(`${keys.namespace}state:p:`))) {
          return Promise.resolve(result).then(async (value) => {
            if (!Array.isArray(value) || typeof value[1] !== "string"
              || JSON.parse(value[1]).principalSessionId !== principalSessionId) {
              return value;
            }
            redis.sendCommand = original;
            reached();
            await resumed;
            return value;
          });
        }
        return result;
      };
      return {
        reached: paused,
        release,
        restore() {
          redis.sendCommand = original;
          release();
        },
      };
    },
    async forgetPrincipalChildIndex(principalSessionId: string) {
      await redis.del(keys.index.principal(principalSessionId));
    },
    async corruptBinding(id: string, problem: "authentication_time" | "expired") {
      const key = keys.active("client_binding", id);
      const raw = await redis.get(key);
      const parsed = raw === null ? null : parseLifecycleObject("client_binding", raw);
      if (!parsed?.success)
        throw new Error("Expected fixture Binding");
      const value = parsed.data;
      if (problem === "authentication_time")
        value.authTime += 1000;
      else
        value.expiresAt = value.issuedAt;
      await redis.set(key, JSON.stringify(value), "KEEPTTL");
    },
    async replaceCredentialSubject(id: string, subjectId: string) {
      const key = await objectKey("credential", id);
      const raw = await redis.get(key);
      const parsed = raw === null ? null : parseLifecycleObject("credential", raw);
      if (!parsed?.success)
        throw new Error("Expected fixture Credential");
      parsed.data.principal.subjectId = subjectId;
      await redis.set(key, JSON.stringify(parsed.data), "KEEPTTL");
    },
    async corruptCredential(id: string, problem: "empty" | "json" | "redis_type") {
      const key = await objectKey("credential", id);
      if (problem === "redis_type") {
        await redis.del(key);
        await redis.lpush(key, "wrong-type");
      }
      else {
        await redis.set(key, problem === "empty" ? "" : "{broken", "KEEPTTL");
      }
    },
    async patchCredentialMetadata(id: string, metadata: Record<string, unknown>) {
      const key = await objectKey("credential", id);
      const raw = await redis.get(key);
      const parsed = raw === null ? null : parseLifecycleObject("credential", raw);
      if (!parsed?.success)
        throw new Error("Expected fixture Credential");
      parsed.data.metadata = { ...parsed.data.metadata, ...metadata };
      await redis.set(key, JSON.stringify(parsed.data), "KEEPTTL");
    },
    async removeObjectPayload(kind: LifecycleObjectKind, id: string) {
      await redis.del(await objectKey(kind, id));
    },
    async observeArtifactReferences(value: ProtocolArtifact) {
      const references = [keys.state("artifact", value.lookupHash), keys.identity("artifact", value.artifactId)];
      return await Promise.all(references.map(async key => ({ payload: await redis.get(key), expiresAt: await redis.pexpiretime(key) })));
    },
    async redirectArtifactLookup(from: ProtocolArtifact, to: ProtocolArtifact) {
      await redis.set(keys.identity("artifact", from.artifactId), to.lookupHash, "KEEPTTL");
    },
    async observe(kind: LifecycleObjectKind, id: string) {
      if (kind !== "client_binding" && await redis.get(keys.identity(kind, id)) === null)
        return { payload: null, expiresAt: -2, references: [], memberships: [] };
      const key = await objectKey(kind, id);
      const payload = await redis.get(key);
      const parsed = payload === null ? null : parseLifecycleObject(kind, payload);
      const object = parsed?.success ? parsed.data : undefined;
      const references = kind !== "client_binding" ? [keys.identity(kind, id)] : [];
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
      if (await redis.get(keys.identity("artifact", id)) === null)
        return { payload: null, expiresAt: -2 };
      const key = await objectKey("artifact", id);
      return { payload: await redis.get(key), expiresAt: await redis.pexpiretime(key) };
    },
    async forgetArtifactIndexes(id: string) {
      const value = await artifact(id);
      for (const key of indexes(value)) await redis.zrem(key, encodeIndexMember("artifact", id));
    },
    async removeArtifactPayload(id: string) { await redis.del(await objectKey("artifact", id)); },
    async corruptArtifact(id: string, problem: "empty" | "redis_type" | "json" | "version" | "identity") {
      const value = await artifact(id);
      const key = await objectKey("artifact", id);
      if (problem === "redis_type") {
        await redis.del(key);
        await redis.lpush(key, "wrong-type");
        return;
      }
      const raw = problem === "empty" ? "" : problem === "json" ? "{broken" : JSON.stringify({ ...value, ...(problem === "version" ? { version: 999 } : { artifactId: "other-owner" }) });
      await redis.set(await objectKey("artifact", id), raw, "KEEPTTL");
    },
    async replaceArtifact(id: string) {
      const value = await artifact(id);
      await redis.set(await objectKey("artifact", id), JSON.stringify({ ...value, metadata: { replacement: true } }), "KEEPTTL");
    },
    async replaceTombstone(id: string) {
      const key = await objectKey("artifact", id);
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
