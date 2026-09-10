import type {
  IssuedCredential,
  LifecycleObjectByKind,
  LifecycleObjectKind,
  ProtocolArtifact,
  RevokedTombstone,
} from "../state/model";
import type {
  ConsumedReplayResult,
  LifecycleFailureResult,
  ResolvedResult,
  ResolveResult,
  RevokedResult,
} from "../state/result";
import type { DirectStateTransitions } from "./direct-state-transitions";
import type { SessionKernelKeyBuilder } from "./keys";
import type { SessionKernelObservation } from "./observation";
import { tokenDigest } from "../security/digest";
import {
  parseLifecycleObject,
  parseRevokedTombstone,
  stringifyLifecycleObject,
  stringifyRevokedTombstone,
} from "../state/model";
import { failClosed } from "../state/result";

type RedisResult = [Error | null, unknown];

const REMOVE_INDEX_MEMBER_IF_OBJECT_INACTIVE_SCRIPT = `
-- remove_index_member_if_object_inactive
if redis.call("EXISTS", KEYS[1]) == 0 then
  return redis.call("ZREM", KEYS[2], ARGV[1])
end
return 0
`;

const REMOVE_DIRECT_INDEX_MEMBER_IF_INACTIVE_SCRIPT = `
-- remove_index_member_if_object_inactive_direct
local hash = redis.call("GET", KEYS[1])
if hash and (string.len(hash) ~= 64 or string.find(hash, "[^a-f0-9]")) then return 0 end
local value = hash and redis.call("GET", ARGV[2] .. hash)
if value then
  local ok, state = pcall(cjson.decode, value)
  if not ok or type(state) ~= "table" or state.state ~= "revoked" then
    return 0
  end
end
return redis.call("ZREM", KEYS[2], ARGV[1])
`;

type StoredResolveResult<T>
  = | LifecycleFailureResult
    | (ResolvedResult<T> & { serialized: string });

export type SessionKernelRedisTransaction = {
  set: (key: string, value: string) => SessionKernelRedisTransaction;
  pexpireat: (key: string, expiresAt: number) => SessionKernelRedisTransaction;
  del: (...keys: string[]) => SessionKernelRedisTransaction;
  zadd: (key: string, score: number, member: string) => SessionKernelRedisTransaction;
  zrem: (key: string, member: string) => SessionKernelRedisTransaction;
  exec: () => Promise<RedisResult[] | null>;
};

export type SessionKernelRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  pexpireat: (key: string, expiresAt: number) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<unknown>;
  zcard: (key: string) => Promise<number>;
  zrange: (key: string, start: number, stop: number) => Promise<string[]>;
  zrevrange: (key: string, start: number, stop: number) => Promise<string[]>;
  zrem: (key: string, member: string) => Promise<unknown>;
  zremrangebyscore: (key: string, min: string | number, max: string | number) => Promise<number>;
  multi: () => SessionKernelRedisTransaction;
  eval?: (
    script: string,
    keyCount: number,
    ...args: Array<number | string>
  ) => Promise<unknown>;
  ttl?: (key: string) => Promise<number>;
  expire?: (key: string, seconds: number) => Promise<number>;
};

type ExternalKind = Extract<LifecycleObjectKind, "principal_session" | "credential" | "artifact">;

export type StoreIndexWrite = {
  key: string;
  score: number;
  member: string;
};

export type SessionKernelRevocationTransitions = {
  updateActiveObject: (input: {
    activeKey: string;
    expectedActive: string;
    expiresAt: number;
    indexes: StoreIndexWrite[];
    serializedObject: string;
    tombstoneKey: string;
  }) => Promise<boolean>;
  revokeActiveObject: (input: {
    activeKey: string;
    cleanupPending?: { key: string; member: string; score: number };
    expectedActive: string;
    expiresAt: number;
    indexRemovals: Array<{ key: string; member: string }>;
    serializedTombstone: string;
    tombstoneKey: string;
  }) => Promise<boolean>;
  finalizeCleanupPending: (input: {
    expiresAt: number;
    indexKey: string;
    member: string;
    now: number;
    serializedTombstone: string;
    tombstoneKey: string;
  }) => Promise<boolean>;
};

export class SessionKernelStore {
  constructor(
    private readonly redis: SessionKernelRedis,
    private readonly keys: SessionKernelKeyBuilder,
    private readonly revocationTransitions: SessionKernelRevocationTransitions,
    private readonly observation: SessionKernelObservation,
    private readonly direct: DirectStateTransitions,
  ) {}

  tokenMatchesObject(token: string, object: ProtocolArtifact) {
    return tokenDigest(token) === object.lookupHash;
  }

  async now() {
    return await this.observation.now();
  }

  async resolveByExternalToken<K extends ExternalKind>(
    kind: K,
    externalToken: string,
  ): Promise<ResolveResult<LifecycleObjectByKind[K]>> {
    return withoutSerialized(
      await this.resolveStoredByExternalToken(kind, externalToken),
    );
  }

  async resolveStoredByExternalToken<K extends ExternalKind>(
    kind: K,
    externalToken: string,
  ): Promise<StoredResolveResult<LifecycleObjectByKind[K]>> {
    return await this.resolveDirectState(kind, tokenDigest(externalToken));
  }

  async resolveObject<K extends LifecycleObjectKind>(
    kind: K,
    id: string,
  ): Promise<ResolveResult<LifecycleObjectByKind[K]>> {
    return withoutSerialized(await this.resolveStoredObject(kind, id));
  }

  async resolveObjectForUpdate<K extends LifecycleObjectKind>(
    kind: K,
    id: string,
  ) {
    return await this.resolveStoredObject(kind, id);
  }

  private async resolveStoredObject<K extends LifecycleObjectKind>(
    kind: K,
    id: string,
  ): Promise<StoredResolveResult<LifecycleObjectByKind[K]>> {
    if (isExternalKind(kind)) {
      const hash = await this.redis.get(this.keys.identity(kind, id));
      if (hash === null)
        return { status: "missing_or_expired" };
      return await this.resolveDirectState(kind, hash, id);
    }
    const tombstone = await this.readTombstoneKey(this.keys.tombstone(kind, id));
    if (tombstone.status === "schema_invalid")
      return tombstone;
    if (tombstone.status === "revoked")
      return tombstoneResolveResult(tombstone.tombstone);

    const { serialized, observedAt } = await this.observation.read(this.keys.active(kind, id));
    if (!serialized)
      return { status: "missing_or_expired" };

    const parsed = parseLifecycleObject(kind, serialized);
    if (!parsed.success) {
      return {
        status: "schema_invalid",
        objectKind: kind,
        objectId: id,
        issues: parsed.issues,
      };
    }
    if (parsed.data.expiresAt <= observedAt)
      return { status: "missing_or_expired" };
    return { status: "resolved", value: parsed.data, observedAt, serialized };
  }

  async putObject<K extends LifecycleObjectKind>(input: {
    kind: K;
    id: string;
    object: LifecycleObjectByKind[K];
    lookupHash?: string;
    indexes?: StoreIndexWrite[];
  }) {
    if (isExternalKind(input.kind)) {
      if (!input.lookupHash)
        throw new Error("Direct state creation requires a token digest");
      const created = await this.direct.create({
        ...this.directLocation(input.kind, input.id, input.lookupHash),
        serialized: stringifyLifecycleObject(input.object),
        expiresAt: input.object.expiresAt,
        indexes: input.indexes ?? [],
      });
      if (!created)
        throw new Error("lifecycle identity or token state is already owned");
      return;
    }
    const transaction = this.redis.multi()
      .set(this.keys.active(input.kind, input.id), stringifyLifecycleObject(input.object))
      .pexpireat(this.keys.active(input.kind, input.id), input.object.expiresAt);

    for (const index of input.indexes ?? [])
      transaction.zadd(index.key, index.score, index.member);

    await assertTransaction(transaction.exec());
  }

  async putCredential(input: {
    credential: IssuedCredential;
    indexes: StoreIndexWrite[];
  }) {
    return await this.direct.create({
      ...this.directLocation("credential", input.credential.credentialId, input.credential.lookupHash),
      serialized: stringifyLifecycleObject(input.credential),
      expiresAt: input.credential.expiresAt,
      indexes: input.indexes,
    });
  }

  async updateObject<K extends LifecycleObjectKind>(input: {
    expectedSerialized: string;
    kind: K;
    id: string;
    object: LifecycleObjectByKind[K];
    indexes?: StoreIndexWrite[];
  }) {
    const lookupHash = "externalTokenLookupHash" in input.object
      ? input.object.externalTokenLookupHash
      : "lookupHash" in input.object ? input.object.lookupHash : undefined;
    if (isExternalKind(input.kind)) {
      if (!lookupHash)
        throw new Error("Direct state update requires a token digest");
      return await this.direct.update({
        ...this.directLocation(input.kind, input.id, lookupHash),
        expected: input.expectedSerialized,
        serialized: stringifyLifecycleObject(input.object),
        expiresAt: input.object.expiresAt,
        indexes: input.indexes ?? [],
      });
    }
    return await this.revocationTransitions.updateActiveObject({
      activeKey: this.keys.active(input.kind, input.id),
      expectedActive: input.expectedSerialized,
      expiresAt: input.object.expiresAt,
      indexes: input.indexes ?? [],
      serializedObject: stringifyLifecycleObject(input.object),
      tombstoneKey: this.keys.tombstone(input.kind, input.id),
    });
  }

  async revokeActiveObject(input: {
    expectedSerialized?: string;
    kind: LifecycleObjectKind;
    id: string;
    lookupHash?: string;
    tombstone: RevokedTombstone;
    indexRemovals?: Array<{ key: string; member: string }>;
    cleanupPending?: { key: string; member: string };
  }) {
    if (isExternalKind(input.kind)) {
      if (!input.lookupHash)
        throw new Error("Direct state revocation requires a token digest");
      // The facade already acquired validity. Compare that observation without rejudging its deadline.
      const current = await this.redis.get(this.keys.state(input.kind, input.lookupHash));
      if (current === null)
        return { status: "missing" as const };
      const transitioned = await this.direct.revoke({
        ...this.directLocation(input.kind, input.id, input.lookupHash),
        expected: input.expectedSerialized ?? current,
        serialized: directTombstone(input.tombstone),
        expiresAt: input.tombstone.expiresAt,
        indexRemovals: input.indexRemovals ?? [],
        pending: input.cleanupPending ? { ...input.cleanupPending, score: input.tombstone.revokedAt } : undefined,
      });
      if (transitioned)
        return { status: "revoked" as const };
      const concurrent = await this.resolveStoredObject(input.kind, input.id);
      if (concurrent.status === "schema_invalid")
        return concurrent;
      if (concurrent.status === "revoked" || concurrent.status === "consumed_replay")
        return { status: "already_revoked" as const, tombstone: concurrent.tombstone };
      return { status: "comparison_conflict" as const };
    }
    const existing = await this.readTombstoneKey(this.keys.tombstone(input.kind, input.id));
    if (existing.status === "schema_invalid")
      return existing;
    if (existing.status === "revoked")
      return { status: "already_revoked" as const, tombstone: existing.tombstone };

    const active = await this.redis.get(this.keys.active(input.kind, input.id));
    if (!active)
      return { status: "missing" as const };

    const tombstoneKey = this.keys.tombstone(input.kind, input.id);
    const transitioned = await this.revocationTransitions.revokeActiveObject({
      activeKey: this.keys.active(input.kind, input.id),
      ...(input.cleanupPending
        ? {
            cleanupPending: {
              ...input.cleanupPending,
              score: input.tombstone.revokedAt,
            },
          }
        : {}),
      expectedActive: input.expectedSerialized ?? active,
      expiresAt: input.tombstone.expiresAt,
      indexRemovals: input.indexRemovals ?? [],
      serializedTombstone: stringifyRevokedTombstone(input.tombstone),
      tombstoneKey,
    });
    if (!transitioned) {
      const concurrent = await this.readTombstoneKey(tombstoneKey);
      if (concurrent.status === "schema_invalid")
        return concurrent;
      if (concurrent.status === "revoked")
        return { status: "already_revoked" as const, tombstone: concurrent.tombstone };
      return { status: "comparison_conflict" as const };
    }
    return { status: "revoked" as const };
  }

  async deleteOwnedCleanupKeys(tombstone: RevokedTombstone, payloadKeys: readonly string[]) {
    if (payloadKeys.length === 0)
      return;
    if (!tombstone.lookupHash || !isExternalKind(tombstone.objectKind))
      throw new Error("external payload cleanup requires a lookup-bound revoked object");

    await this.direct.deleteOwned({
      ...this.directLocation(tombstone.objectKind, tombstone.objectId, tombstone.lookupHash),
      expected: directTombstone(tombstone),
      payloadKeys,
    });
  }

  async finalizeCleanupPending(input: {
    tombstone: RevokedTombstone;
    indexKey: string;
    member: string;
  }) {
    if (isExternalKind(input.tombstone.objectKind)) {
      if (!input.tombstone.lookupHash)
        throw new Error("Direct state cleanup requires a token digest");
      await this.direct.finalize({
        ...this.directLocation(input.tombstone.objectKind, input.tombstone.objectId, input.tombstone.lookupHash),
        expected: directTombstone(input.tombstone),
        expiresAt: input.tombstone.expiresAt,
        now: await this.now(),
        indexKey: input.indexKey,
        member: input.member,
      });
      return;
    }
    const tombstoneKey = this.keys.tombstone(input.tombstone.objectKind, input.tombstone.objectId);
    await this.revocationTransitions.finalizeCleanupPending({
      expiresAt: input.tombstone.expiresAt,
      indexKey: input.indexKey,
      member: input.member,
      now: await this.now(),
      serializedTombstone: stringifyRevokedTombstone(input.tombstone),
      tombstoneKey,
    });
  }

  async consumeArtifact(input: {
    artifact: ProtocolArtifact;
    serializedArtifact: string;
    observedAt: number;
    tombstone: RevokedTombstone;
    indexRemovals: Array<{ key: string; member: string }>;
  }): Promise<ResolveResult<ProtocolArtifact>> {
    const consumed = await this.direct.revoke({
      ...this.directLocation("artifact", input.artifact.artifactId, input.artifact.lookupHash),
      expected: input.serializedArtifact,
      serialized: directTombstone(input.tombstone),
      expiresAt: input.tombstone.expiresAt,
      indexRemovals: input.indexRemovals,
    });
    if (consumed)
      return { status: "resolved", value: input.artifact, observedAt: input.observedAt };
    const current = await this.resolveDirectState("artifact", input.artifact.lookupHash, input.artifact.artifactId);
    if (current.status !== "resolved")
      return current;
    return failClosed("artifact changed since observation");
  }

  async readIndex(key: string) {
    await this.redis.zremrangebyscore(key, "-inf", await this.now());
    return await this.redis.zrange(key, 0, -1);
  }

  async readIndexWithoutMutation(key: string) {
    return await this.redis.zrange(key, 0, -1);
  }

  async cleanExpiredIndex(key: string) {
    await this.redis.zremrangebyscore(key, "-inf", await this.now());
  }

  async readIndexChunkDescending(key: string, start: number, stop: number) {
    return await this.redis.zrevrange(key, start, stop);
  }

  async countIndexMembers(key: string) {
    return await this.redis.zcard(key);
  }

  async removeIndexMembers(key: string, members: string[]) {
    if (members.length === 0)
      return;
    const transaction = this.redis.multi();
    for (const member of members)
      transaction.zrem(key, member);
    await assertTransaction(transaction.exec());
  }

  async removeIndexMemberIfObjectInactive(
    indexKey: string,
    member: string,
    kind: LifecycleObjectKind,
    id: string,
  ) {
    if (!this.redis.eval)
      throw new Error("Session Kernel stale index cleanup requires Redis EVAL");
    await this.redis.eval(
      isExternalKind(kind) ? REMOVE_DIRECT_INDEX_MEMBER_IF_INACTIVE_SCRIPT : REMOVE_INDEX_MEMBER_IF_OBJECT_INACTIVE_SCRIPT,
      2,
      isExternalKind(kind) ? this.keys.identity(kind, id) : this.keys.active(kind, id),
      indexKey,
      member,
      ...(isExternalKind(kind) ? [this.keys.state(kind, "")] : []),
    );
  }

  private directLocation(kind: LifecycleObjectKind, id: string, hash: string) {
    return { stateKey: this.keys.state(kind, hash), idKey: this.keys.identity(kind, id), idOwner: hash };
  }

  private async resolveDirectState<K extends LifecycleObjectKind>(
    kind: K,
    hash: string,
    id?: string,
  ): Promise<StoredResolveResult<LifecycleObjectByKind[K]>> {
    const invalid = { status: "schema_invalid" as const, objectKind: kind, objectId: id, issues: "state identity or schema mismatch" };
    if (!/^[a-f0-9]{64}$/.test(hash))
      return invalid;
    const { serialized, observedAt } = await this.observation.read(this.keys.state(kind, hash));
    if (serialized === null)
      return { status: "missing_or_expired" };
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    }
    catch { return invalid; }
    if (value && typeof value === "object" && "state" in value) {
      if (value.state !== "revoked")
        return invalid;
      const parsed = parseRevokedTombstone(serialized);
      if (!parsed.success || parsed.data.objectKind !== kind || parsed.data.lookupHash !== hash
        || (id !== undefined && parsed.data.objectId !== id)) {
        return invalid;
      }
      // Pending records intentionally outlive their original diagnostic deadline.
      return tombstoneResolveResult(parsed.data);
    }
    const parsed = parseLifecycleObject(kind, serialized);
    if (!parsed.success)
      return invalid;
    const object = parsed.data;
    const objectHash = "externalTokenLookupHash" in object
      ? object.externalTokenLookupHash
      : "lookupHash" in object ? object.lookupHash : undefined;
    const objectId = "credentialId" in object
      ? object.credentialId
      : "artifactId" in object
        ? object.artifactId
        : "principalSessionId" in object ? object.principalSessionId : undefined;
    if (objectHash !== hash || (id !== undefined && objectId !== id)) {
      return invalid;
    }
    if (object.expiresAt <= observedAt)
      return { status: "missing_or_expired" };
    return { status: "resolved", value: object, observedAt, serialized };
  }

  private async readTombstoneKey(key: string): Promise<
    | { status: "none" }
    | { status: "revoked"; tombstone: RevokedTombstone }
    | { status: "schema_invalid"; objectKind: LifecycleObjectKind; issues?: unknown }
  > {
    const serialized = await this.redis.get(key);
    if (!serialized)
      return { status: "none" };
    const parsed = parseRevokedTombstone(serialized);
    if (!parsed.success) {
      return {
        status: "schema_invalid",
        objectKind: "credential",
        issues: parsed.error.issues,
      };
    }
    return { status: "revoked", tombstone: parsed.data };
  }
}

function directTombstone(tombstone: RevokedTombstone) {
  return JSON.stringify({ ...tombstone, state: "revoked" });
}

function withoutSerialized<T>(
  result: StoredResolveResult<T>,
): ResolveResult<T> {
  if (result.status !== "resolved")
    return result;
  return {
    status: "resolved",
    value: result.value,
    observedAt: result.observedAt,
  };
}

function isExternalKind(kind: LifecycleObjectKind): kind is ExternalKind {
  return kind === "principal_session" || kind === "credential" || kind === "artifact";
}

function tombstoneResolveResult(
  tombstone: RevokedTombstone,
): ConsumedReplayResult | RevokedResult {
  if (tombstone.objectKind === "artifact" && tombstone.reason === "consumed")
    return { status: "consumed_replay", tombstone };
  return { status: "revoked", tombstone };
}

async function assertTransaction(promise: Promise<RedisResult[] | null>) {
  const result = await promise;
  if (!result)
    throw new Error("session kernel Redis transaction failed");
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0])
    throw failed[0];
}

export function catchAsFailClosed<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<T | ReturnType<typeof failClosed>> {
  return operation().catch(cause => failClosed(message, cause));
}

export function getLookupHash(object: IssuedCredential | ProtocolArtifact) {
  return object.lookupHash;
}
