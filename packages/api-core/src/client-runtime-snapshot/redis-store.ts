import type {
  ClientRuntimeSnapshotAcquisitionState,
  ClientRuntimeSnapshotAtomicStore,
  ClientRuntimeSnapshotControl,
} from "./atomic-store";
import type { ClientRuntimeSnapshotKind } from "./contract";
import { CLIENT_RUNTIME_SNAPSHOT_KINDS } from "./contract";

const NAMESPACE = "client-runtime-snapshot:v1";
const CONTROL_SCHEMA_VERSION = "1";

const ACQUIRE_SCRIPT = `-- client-runtime-snapshot:acquire
local controlType = redis.call("TYPE", KEYS[1]).ok
local valid = false
local epoch = false
local generation = false
if controlType == "hash" then
  local schemaVersion = redis.call("HGET", KEYS[1], "schemaVersion")
  epoch = redis.call("HGET", KEYS[1], "epoch")
  generation = redis.call("HGET", KEYS[1], "generation")
  valid = schemaVersion == "1"
    and type(epoch) == "string" and string.len(epoch) > 0
    and type(generation) == "string" and string.match(generation, "^%d+$") ~= nil
end
local bootstrapped = "0"
if not valid then
  redis.call("DEL", KEYS[1])
  redis.call("HSET", KEYS[1], "schemaVersion", "1", "epoch", ARGV[1], "generation", "0")
  redis.call("DEL", KEYS[2], KEYS[3], KEYS[4])
  epoch = ARGV[1]
  generation = "0"
  bootstrapped = "1"
end
local payloadKey = KEYS[tonumber(ARGV[2]) + 2]
local payload = false
if redis.call("TYPE", payloadKey).ok == "string" then
  payload = redis.call("GET", payloadKey)
end
return {epoch, generation, payload, bootstrapped}
`;

const PUBLISH_SCRIPT = `-- client-runtime-snapshot:publish
if redis.call("TYPE", KEYS[1]).ok ~= "hash" then
  return 0
end
if redis.call("HGET", KEYS[1], "schemaVersion") ~= "1"
  or redis.call("HGET", KEYS[1], "epoch") ~= ARGV[1]
  or redis.call("HGET", KEYS[1], "generation") ~= ARGV[2] then
  return 0
end
local ttl = tonumber(ARGV[4])
if ttl and ttl > 0 then
  redis.call("SET", KEYS[2], ARGV[3], "PX", ttl)
end
return 1
`;

const VERIFY_SCRIPT = `-- client-runtime-snapshot:verify
if redis.call("TYPE", KEYS[1]).ok ~= "hash" then
  return 0
end
if redis.call("HGET", KEYS[1], "schemaVersion") ~= "1"
  or redis.call("HGET", KEYS[1], "epoch") ~= ARGV[1]
  or redis.call("HGET", KEYS[1], "generation") ~= ARGV[2] then
  return 0
end
return 1
`;

const INVALIDATE_SCRIPT = `-- client-runtime-snapshot:invalidate
local valid = redis.call("TYPE", KEYS[1]).ok == "hash"
  and redis.call("HGET", KEYS[1], "schemaVersion") == "1"
  and type(redis.call("HGET", KEYS[1], "epoch")) == "string"
  and string.len(redis.call("HGET", KEYS[1], "epoch")) > 0
  and string.match(redis.call("HGET", KEYS[1], "generation") or "", "^%d+$") ~= nil
if valid then
  redis.call("HINCRBY", KEYS[1], "generation", 1)
else
  redis.call("DEL", KEYS[1])
  redis.call("HSET", KEYS[1], "schemaVersion", "1", "epoch", ARGV[1], "generation", "0")
end
redis.call("DEL", KEYS[2], KEYS[3], KEYS[4])
return 1
`;

export interface ClientRuntimeSnapshotRedis {
  readonly eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

export function clientRuntimeSnapshotTestingKeys(clientCode: string) {
  const hashTag = encodeURIComponent(clientCode);
  const prefix = `${NAMESPACE}:{${hashTag}}`;
  return {
    control: `${prefix}:control`,
    payloads: CLIENT_RUNTIME_SNAPSHOT_KINDS.map(kind => `${prefix}:payload:${kind}`) as [string, string, string],
  };
}

export function createClientRuntimeSnapshotRedisStore(
  redis: ClientRuntimeSnapshotRedis,
): ClientRuntimeSnapshotAtomicStore {
  return {
    async readOrBootstrap(
      clientCode: string,
      kind: ClientRuntimeSnapshotKind,
      candidateEpoch: string,
    ): Promise<ClientRuntimeSnapshotAcquisitionState> {
      const keys = clientRuntimeSnapshotTestingKeys(clientCode);
      const result = await redis.eval(
        ACQUIRE_SCRIPT,
        4,
        keys.control,
        ...keys.payloads,
        candidateEpoch,
        String(CLIENT_RUNTIME_SNAPSHOT_KINDS.indexOf(kind)),
      );
      if (!Array.isArray(result) || result.length !== 4)
        throw new Error("Invalid Client Runtime Snapshot acquire result");
      const [epoch, generation, payload, bootstrapped] = result;
      if (typeof epoch !== "string" || !epoch
        || typeof generation !== "string" || !/^\d+$/.test(generation)
        || (typeof payload !== "string" && payload !== null)
        || (bootstrapped !== "0" && bootstrapped !== "1")) {
        throw new Error("Invalid Client Runtime Snapshot acquire result");
      }
      return {
        bootstrapped: bootstrapped === "1",
        control: { epoch, generation },
        payload,
      };
    },

    async publishIfCurrent(
      clientCode: string,
      kind: ClientRuntimeSnapshotKind,
      control: ClientRuntimeSnapshotControl,
      payload: string,
      ttlMs: number,
    ) {
      const keys = clientRuntimeSnapshotTestingKeys(clientCode);
      const result = await redis.eval(
        PUBLISH_SCRIPT,
        2,
        keys.control,
        keys.payloads[CLIENT_RUNTIME_SNAPSHOT_KINDS.indexOf(kind)]!,
        control.epoch,
        control.generation,
        payload,
        String(ttlMs),
      );
      if (Number(result) === 1)
        return "published" as const;
      if (Number(result) === 0)
        return "conflict" as const;
      throw new Error("Invalid Client Runtime Snapshot publish result");
    },

    async verifyCurrent(
      clientCode: string,
      control: ClientRuntimeSnapshotControl,
    ) {
      const keys = clientRuntimeSnapshotTestingKeys(clientCode);
      const result = await redis.eval(
        VERIFY_SCRIPT,
        1,
        keys.control,
        control.epoch,
        control.generation,
      );
      if (Number(result) === 1)
        return "verified" as const;
      if (Number(result) === 0)
        return "conflict" as const;
      throw new Error("Invalid Client Runtime Snapshot verify result");
    },

    async invalidateClient(clientCode: string, candidateEpoch: string) {
      const keys = clientRuntimeSnapshotTestingKeys(clientCode);
      const result = await redis.eval(
        INVALIDATE_SCRIPT,
        4,
        keys.control,
        ...keys.payloads,
        candidateEpoch,
      );
      if (Number(result) !== 1)
        throw new Error("Invalid Client Runtime Snapshot invalidation result");
    },
  };
}

export const CLIENT_RUNTIME_SNAPSHOT_CONTROL_SCHEMA_VERSION = CONTROL_SCHEMA_VERSION;
