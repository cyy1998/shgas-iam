import type { SessionKernelKeyBuilder } from "./keys";
import type { ProtocolArtifact, RevokedTombstone } from "./model";
import type { SessionKernelRedis } from "./store";
import { stringifyRevokedTombstone } from "./model";

const CONSUME_ARTIFACT_SCRIPT = `
-- session-kernel-consume-artifact-v1
if redis.call("EXISTS", KEYS[3]) == 1
  or redis.call("EXISTS", KEYS[4]) == 1 then
  return 0
end
local active = redis.call("GET", KEYS[1])
if not active
  or active ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end
redis.call("SET", KEYS[3], ARGV[3])
redis.call("PEXPIREAT", KEYS[3], ARGV[4])
redis.call("SET", KEYS[4], ARGV[3])
redis.call("PEXPIREAT", KEYS[4], ARGV[4])
redis.call("DEL", KEYS[1], KEYS[2])
return 1
`;

export interface SessionKernelArtifactConsumeInput {
  readonly artifact: ProtocolArtifact;
  readonly serializedArtifact: string;
  readonly tombstone: RevokedTombstone;
}

export interface SessionKernelArtifactConsumer {
  consume: (
    input: SessionKernelArtifactConsumeInput,
  ) => Promise<"consumed" | "not_consumed">;
}

export function createRedisSessionKernelArtifactConsumer(
  redis: SessionKernelRedis,
  keys: SessionKernelKeyBuilder,
): SessionKernelArtifactConsumer {
  return {
    async consume(input) {
      if (!redis.eval) {
        throw new Error(
          "session kernel Redis eval is required to consume an artifact",
        );
      }

      const result = await redis.eval(
        CONSUME_ARTIFACT_SCRIPT,
        4,
        keys.active("artifact", input.artifact.artifactId),
        keys.lookup("artifact", input.artifact.lookupHash),
        keys.tombstone("artifact", input.artifact.artifactId),
        keys.lookupTombstone("artifact", input.artifact.lookupHash),
        input.serializedArtifact,
        input.artifact.artifactId,
        stringifyRevokedTombstone(input.tombstone),
        input.tombstone.expiresAt,
      );
      if (result === 1 || result === "1")
        return "consumed";
      if (result === 0 || result === "0")
        return "not_consumed";
      throw new Error(
        "session kernel Redis returned an invalid artifact consume result",
      );
    },
  };
}

export function createInMemorySessionKernelArtifactConsumer(
  redis: SessionKernelRedis,
  keys: SessionKernelKeyBuilder,
): SessionKernelArtifactConsumer {
  let tail = Promise.resolve();

  return {
    consume(input) {
      const operation = tail.then(async () => {
        const activeKey = keys.active("artifact", input.artifact.artifactId);
        const lookupKey = keys.lookup("artifact", input.artifact.lookupHash);
        const tombstoneKey = keys.tombstone(
          "artifact",
          input.artifact.artifactId,
        );
        const lookupTombstoneKey = keys.lookupTombstone(
          "artifact",
          input.artifact.lookupHash,
        );
        const [active, lookup, tombstone, lookupTombstone] = await Promise.all([
          redis.get(activeKey),
          redis.get(lookupKey),
          redis.get(tombstoneKey),
          redis.get(lookupTombstoneKey),
        ]);
        if (
          active !== input.serializedArtifact
          || lookup !== input.artifact.artifactId
          || tombstone !== null
          || lookupTombstone !== null
        ) {
          return "not_consumed" as const;
        }

        const serializedTombstone = stringifyRevokedTombstone(input.tombstone);
        const result = await redis.multi()
          .set(tombstoneKey, serializedTombstone)
          .pexpireat(tombstoneKey, input.tombstone.expiresAt)
          .set(lookupTombstoneKey, serializedTombstone)
          .pexpireat(lookupTombstoneKey, input.tombstone.expiresAt)
          .del(activeKey, lookupKey)
          .exec();
        if (!result)
          throw new Error("session kernel Redis transaction failed");
        const failed = result.find(([error]) => error !== null);
        if (failed?.[0])
          throw failed[0];
        return "consumed" as const;
      });
      tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
}
