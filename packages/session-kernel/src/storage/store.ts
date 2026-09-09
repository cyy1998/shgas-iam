import type { SessionKernelConfig } from "../config";
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
import type { SessionKernelArtifactConsumer } from "./artifact-consumption";
import type { SessionKernelCredentialCreator } from "./credential-creation";
import type { SessionKernelKeyBuilder } from "./keys";
import type { SessionKernelObservation } from "./observation";
import { createLookupHashCandidates } from "../security/hmac";
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
  deleteOwnedCleanupKeys: (input: {
    lookupKey: string;
    lookupTombstoneKey: string;
    serializedTombstone: string;
    payloadKeys: readonly string[];
  }) => Promise<boolean>;
  updateActiveObject: (input: {
    activeKey: string;
    expectedActive: string;
    expiresAt: number;
    indexes: StoreIndexWrite[];
    lookup?: { key: string; tombstoneKey: string; expectedOwner: string };
    serializedObject: string;
    tombstoneKey: string;
  }) => Promise<boolean>;
  revokeActiveObject: (input: {
    activeKey: string;
    cleanupPending?: { key: string; member: string; score: number };
    expectedActive: string;
    expiresAt: number;
    indexRemovals: Array<{ key: string; member: string }>;
    lookup?: { activeKey: string; tombstoneKey: string; expectedOwner: string };
    serializedTombstone: string;
    tombstoneKey: string;
  }) => Promise<boolean>;
  finalizeCleanupPending: (input: {
    expiresAt: number;
    indexKey: string;
    lookupTombstoneKey?: string;
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
    private readonly config: SessionKernelConfig,
    private readonly artifactConsumer: SessionKernelArtifactConsumer,
    private readonly credentialCreator: SessionKernelCredentialCreator | undefined,
    private readonly revocationTransitions: SessionKernelRevocationTransitions,
    private readonly observation: SessionKernelObservation,
  ) {}

  tokenMatchesObject(token: string, object: ProtocolArtifact) {
    return createLookupHashCandidates(token, this.config).some(candidate => candidate.lookupHash === object.lookupHash);
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
    for (const candidate of createLookupHashCandidates(externalToken, this.config)) {
      const lookupTombstone = await this.readTombstoneKey(this.keys.lookupTombstone(kind, candidate.lookupHash));
      if (lookupTombstone.status === "schema_invalid")
        return lookupTombstone;
      if (lookupTombstone.status === "revoked")
        return tombstoneResolveResult(lookupTombstone.tombstone);

      const id = await this.redis.get(this.keys.lookup(kind, candidate.lookupHash));
      if (!id)
        continue;

      const resolved = await this.resolveStoredObject(kind, id);
      if (resolved.status === "resolved") {
        const objectLookupHash = lookupHashForResolvedObject(resolved.value);
        if (objectLookupHash !== candidate.lookupHash) {
          return {
            status: "schema_invalid",
            objectKind: kind,
            objectId: id,
            issues: "lookup hash mismatch",
          };
        }
        return { ...resolved, lookupKeyId: candidate.keyId };
      }
      return resolved;
    }
    return { status: "missing_or_expired" };
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
    const transaction = this.redis.multi()
      .set(this.keys.active(input.kind, input.id), stringifyLifecycleObject(input.object))
      .pexpireat(this.keys.active(input.kind, input.id), input.object.expiresAt);

    if (input.lookupHash && isExternalKind(input.kind)) {
      transaction
        .set(this.keys.lookup(input.kind, input.lookupHash), input.id)
        .pexpireat(this.keys.lookup(input.kind, input.lookupHash), input.object.expiresAt);
    }

    for (const index of input.indexes ?? [])
      transaction.zadd(index.key, index.score, index.member);

    await assertTransaction(transaction.exec());
  }

  async putCredential(input: {
    credential: IssuedCredential;
    indexes: StoreIndexWrite[];
  }) {
    if (this.credentialCreator)
      return await this.credentialCreator.create(input);
    await this.putObject({
      kind: "credential",
      id: input.credential.credentialId,
      object: input.credential,
      lookupHash: input.credential.lookupHash,
      indexes: input.indexes,
    });
    return "created" as const;
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
    return await this.revocationTransitions.updateActiveObject({
      activeKey: this.keys.active(input.kind, input.id),
      expectedActive: input.expectedSerialized,
      expiresAt: input.object.expiresAt,
      indexes: input.indexes ?? [],
      ...(lookupHash && isExternalKind(input.kind)
        ? { lookup: {
            key: this.keys.lookup(input.kind, lookupHash),
            tombstoneKey: this.keys.lookupTombstone(input.kind, lookupHash),
            expectedOwner: input.id,
          } }
        : {}),
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
      ...(input.lookupHash && isExternalKind(input.kind)
        ? {
            lookup: {
              activeKey: this.keys.lookup(input.kind, input.lookupHash),
              tombstoneKey: this.keys.lookupTombstone(input.kind, input.lookupHash),
              expectedOwner: input.id,
            },
          }
        : {}),
      serializedTombstone: stringifyRevokedTombstone(input.tombstone),
      tombstoneKey,
    });
    if (!transitioned) {
      const concurrent = await this.readTombstoneKey(tombstoneKey);
      if (concurrent.status === "schema_invalid")
        return concurrent;
      if (concurrent.status === "revoked")
        return { status: "already_revoked" as const, tombstone: concurrent.tombstone };
      return { status: "missing" as const };
    }
    return { status: "revoked" as const };
  }

  async deleteOwnedCleanupKeys(tombstone: RevokedTombstone, payloadKeys: readonly string[]) {
    if (payloadKeys.length === 0)
      return;
    if (!tombstone.lookupHash || !isExternalKind(tombstone.objectKind))
      throw new Error("external payload cleanup requires a lookup-bound revoked object");
    await this.revocationTransitions.deleteOwnedCleanupKeys({
      lookupKey: this.keys.lookup(tombstone.objectKind, tombstone.lookupHash),
      lookupTombstoneKey: this.keys.lookupTombstone(tombstone.objectKind, tombstone.lookupHash),
      serializedTombstone: stringifyRevokedTombstone(tombstone),
      payloadKeys,
    });
  }

  async finalizeCleanupPending(input: {
    tombstone: RevokedTombstone;
    indexKey: string;
    member: string;
  }) {
    const tombstoneKey = this.keys.tombstone(input.tombstone.objectKind, input.tombstone.objectId);
    const lookupTombstoneKey = input.tombstone.lookupHash
      && isExternalKind(input.tombstone.objectKind)
      ? this.keys.lookupTombstone(input.tombstone.objectKind, input.tombstone.lookupHash)
      : undefined;
    await this.revocationTransitions.finalizeCleanupPending({
      expiresAt: input.tombstone.expiresAt,
      indexKey: input.indexKey,
      ...(lookupTombstoneKey ? { lookupTombstoneKey } : {}),
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
  }): Promise<ResolveResult<ProtocolArtifact>> {
    const existing = await this.readTombstoneKey(this.keys.tombstone("artifact", input.artifact.artifactId));
    if (existing.status === "schema_invalid")
      return existing;
    if (existing.status === "revoked")
      return tombstoneResolveResult(existing.tombstone);

    const tombstoneKey = this.keys.tombstone("artifact", input.artifact.artifactId);
    const result = await this.artifactConsumer.consume(input);
    if (result === "consumed")
      return { status: "resolved", value: input.artifact, observedAt: input.observedAt };

    const tombstone = await this.readTombstoneKey(tombstoneKey);
    if (tombstone.status === "schema_invalid")
      return tombstone;
    if (tombstone.status === "revoked")
      return tombstoneResolveResult(tombstone.tombstone);
    return { status: "missing_or_expired" };
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
      REMOVE_INDEX_MEMBER_IF_OBJECT_INACTIVE_SCRIPT,
      2,
      this.keys.active(kind, id),
      indexKey,
      member,
    );
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

function withoutSerialized<T>(
  result: StoredResolveResult<T>,
): ResolveResult<T> {
  if (result.status !== "resolved")
    return result;
  if (result.lookupKeyId === undefined) {
    return {
      status: "resolved",
      value: result.value,
      observedAt: result.observedAt,
    };
  }
  return {
    status: "resolved",
    value: result.value,
    observedAt: result.observedAt,
    lookupKeyId: result.lookupKeyId,
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

function lookupHashForResolvedObject(object: LifecycleObjectByKind[ExternalKind]) {
  return "externalTokenLookupHash" in object ? object.externalTokenLookupHash : object.lookupHash;
}
