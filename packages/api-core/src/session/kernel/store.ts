import type { SessionKernelArtifactConsumer } from "./artifact-consumption";
import type { SessionKernelConfig } from "./config";
import type { SessionKernelCredentialCreator } from "./credential-creation";
import type { SessionKernelKeyBuilder } from "./keys";
import type {
  IssuedCredential,
  LifecycleObjectByKind,
  LifecycleObjectKind,
  ProtocolArtifact,
  RevokedTombstone,
} from "./model";
import type {
  ConsumedReplayResult,
  LifecycleFailureResult,
  ResolvedResult,
  ResolveResult,
  RevokedResult,
} from "./result";
import { createLookupHashCandidates } from "./hmac";
import {
  parseLifecycleObject,
  parseRevokedTombstone,
  stringifyLifecycleObject,
  stringifyRevokedTombstone,
} from "./model";
import { failClosed } from "./result";
import { ttlMsUntil } from "./time";

type RedisResult = [Error | null, unknown];

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

export class SessionKernelStore {
  constructor(
    private readonly redis: SessionKernelRedis,
    private readonly keys: SessionKernelKeyBuilder,
    private readonly config: SessionKernelConfig,
    private readonly artifactConsumer: SessionKernelArtifactConsumer,
    private readonly credentialCreator: SessionKernelCredentialCreator | undefined,
  ) {}

  async resolveByExternalToken<K extends ExternalKind>(
    kind: K,
    externalToken: string,
  ): Promise<ResolveResult<LifecycleObjectByKind[K]>> {
    return withoutSerialized(
      await this.resolveStoredByExternalToken(kind, externalToken),
    );
  }

  async resolveArtifactForConsumption(
    externalToken: string,
  ): Promise<StoredResolveResult<ProtocolArtifact>> {
    return await this.resolveStoredByExternalToken("artifact", externalToken);
  }

  private async resolveStoredByExternalToken<K extends ExternalKind>(
    kind: K,
    externalToken: string,
  ): Promise<StoredResolveResult<LifecycleObjectByKind[K]>> {
    const now = this.config.clock.now();
    for (const candidate of createLookupHashCandidates(externalToken, this.config)) {
      const lookupTombstone = await this.readTombstoneKey(this.keys.lookupTombstone(kind, candidate.lookupHash));
      if (lookupTombstone.status === "schema_invalid")
        return lookupTombstone;
      if (lookupTombstone.status === "revoked")
        return tombstoneResolveResult(lookupTombstone.tombstone);

      const id = await this.redis.get(this.keys.lookup(kind, candidate.lookupHash));
      if (!id)
        continue;

      const resolved = await this.resolveStoredObject(kind, id, now);
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
    now = this.config.clock.now(),
  ): Promise<ResolveResult<LifecycleObjectByKind[K]>> {
    return withoutSerialized(await this.resolveStoredObject(kind, id, now));
  }

  private async resolveStoredObject<K extends LifecycleObjectKind>(
    kind: K,
    id: string,
    now: number,
  ): Promise<StoredResolveResult<LifecycleObjectByKind[K]>> {
    const tombstone = await this.readTombstoneKey(this.keys.tombstone(kind, id));
    if (tombstone.status === "schema_invalid")
      return tombstone;
    if (tombstone.status === "revoked")
      return tombstoneResolveResult(tombstone.tombstone);

    const serialized = await this.redis.get(this.keys.active(kind, id));
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
    if (parsed.data.expiresAt <= now)
      return { status: "missing_or_expired" };
    return { status: "resolved", value: parsed.data, serialized };
  }

  async putObject<K extends LifecycleObjectKind>(input: {
    kind: K;
    id: string;
    object: LifecycleObjectByKind[K];
    lookupHash?: string;
    indexes?: StoreIndexWrite[];
  }) {
    const now = this.config.clock.now();
    if (ttlMsUntil(input.object.expiresAt, now) <= 0)
      throw new Error("cannot store an expired lifecycle object");

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
    const now = this.config.clock.now();
    if (ttlMsUntil(input.credential.expiresAt, now) <= 0)
      throw new Error("cannot store an expired lifecycle object");
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
    kind: K;
    id: string;
    object: LifecycleObjectByKind[K];
    indexes?: StoreIndexWrite[];
  }) {
    const transaction = this.redis.multi()
      .set(this.keys.active(input.kind, input.id), stringifyLifecycleObject(input.object))
      .pexpireat(this.keys.active(input.kind, input.id), input.object.expiresAt);
    for (const index of input.indexes ?? [])
      transaction.zadd(index.key, index.score, index.member);
    await assertTransaction(transaction.exec());
  }

  async revokeActiveObject(input: {
    kind: LifecycleObjectKind;
    id: string;
    lookupHash?: string;
    tombstone: RevokedTombstone;
    indexRemovals?: Array<{ key: string; member: string }>;
  }) {
    const existing = await this.readTombstoneKey(this.keys.tombstone(input.kind, input.id));
    if (existing.status === "schema_invalid")
      return existing;
    if (existing.status === "revoked")
      return { status: "already_revoked" as const, tombstone: existing.tombstone };

    const active = await this.redis.get(this.keys.active(input.kind, input.id));
    if (!active)
      return { status: "missing" as const };

    const transaction = this.redis.multi()
      .set(this.keys.tombstone(input.kind, input.id), stringifyRevokedTombstone(input.tombstone))
      .pexpireat(this.keys.tombstone(input.kind, input.id), input.tombstone.expiresAt)
      .del(this.keys.active(input.kind, input.id));

    if (input.lookupHash && isExternalKind(input.kind)) {
      transaction
        .set(this.keys.lookupTombstone(input.kind, input.lookupHash), stringifyRevokedTombstone(input.tombstone))
        .pexpireat(this.keys.lookupTombstone(input.kind, input.lookupHash), input.tombstone.expiresAt)
        .del(this.keys.lookup(input.kind, input.lookupHash));
    }

    for (const removal of input.indexRemovals ?? [])
      transaction.zrem(removal.key, removal.member);

    await assertTransaction(transaction.exec());
    return { status: "revoked" as const };
  }

  async consumeArtifact(input: {
    artifact: ProtocolArtifact;
    serializedArtifact: string;
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
      return { status: "resolved", value: input.artifact };

    const tombstone = await this.readTombstoneKey(tombstoneKey);
    if (tombstone.status === "schema_invalid")
      return tombstone;
    if (tombstone.status === "revoked")
      return tombstoneResolveResult(tombstone.tombstone);
    return { status: "missing_or_expired" };
  }

  async readIndex(key: string, now = this.config.clock.now()) {
    await this.redis.zremrangebyscore(key, "-inf", now);
    return await this.redis.zrange(key, 0, -1);
  }

  async cleanExpiredIndex(key: string, now = this.config.clock.now()) {
    await this.redis.zremrangebyscore(key, "-inf", now);
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
    };
  }
  return {
    status: "resolved",
    value: result.value,
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
