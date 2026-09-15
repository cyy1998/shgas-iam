import type {
  ClientSnapshotAcquisitionState,
  ClientSnapshotAtomicStore,
  ClientSnapshotControl,
} from "./atomic-store";

type ClientSnapshotKind = "client" | "credential";
const CLIENT_SNAPSHOT_KINDS = ["client", "credential"] as const;

const NAMESPACE = "client-snapshot:v1";

const ACQUIRE_SCRIPT = `-- client-snapshot:acquire
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
    and type(generation) == "string" and string.len(generation) <= 15
    and (generation == "0" or string.match(generation, "^[1-9]%d*$") ~= nil)
end
local bootstrapped = "0"
if not valid then
  redis.call("DEL", KEYS[1])
  redis.call("HSET", KEYS[1], "schemaVersion", "1", "epoch", ARGV[1], "generation", "0")
  redis.call("DEL", KEYS[2], KEYS[3])
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

const PUBLISH_SCRIPT = `-- client-snapshot:publish
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

const INVALIDATE_SCRIPT = `-- client-snapshot:invalidate
local valid = redis.call("TYPE", KEYS[1]).ok == "hash"
  and redis.call("HGET", KEYS[1], "schemaVersion") == "1"
  and type(redis.call("HGET", KEYS[1], "epoch")) == "string"
  and string.len(redis.call("HGET", KEYS[1], "epoch")) > 0
  and string.len(redis.call("HGET", KEYS[1], "generation") or "") <= 15
  and (redis.call("HGET", KEYS[1], "generation") == "0"
    or string.match(redis.call("HGET", KEYS[1], "generation") or "", "^[1-9]%d*$") ~= nil)
if valid then
  redis.call("HINCRBY", KEYS[1], "generation", 1)
else
  redis.call("DEL", KEYS[1])
  redis.call("HSET", KEYS[1], "schemaVersion", "1", "epoch", ARGV[1], "generation", "0")
end
redis.call("DEL", KEYS[2], KEYS[3])
return 1
`;

export interface ClientSnapshotRedis {
  readonly eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

export function clientSnapshotKeys(clientCode: string) {
  const hashTag = encodeURIComponent(clientCode);
  const prefix = `${NAMESPACE}:{${hashTag}}`;
  return {
    control: `${prefix}:control`,
    payloads: CLIENT_SNAPSHOT_KINDS.map(
      kind => `${prefix}:payload:${kind}`,
    ) as [string, string],
  };
}

export function createClientSnapshotRedisStore(
  redis: ClientSnapshotRedis,
): ClientSnapshotAtomicStore {
  return {
    async readOrBootstrap(
      clientCode: string,
      kind: ClientSnapshotKind,
      candidateEpoch: string,
    ): Promise<ClientSnapshotAcquisitionState> {
      const keys = clientSnapshotKeys(clientCode);
      const result = await redis.eval(
        ACQUIRE_SCRIPT,
        3,
        keys.control,
        ...keys.payloads,
        candidateEpoch,
        String(CLIENT_SNAPSHOT_KINDS.indexOf(kind)),
      );
      if (!Array.isArray(result) || result.length !== 4)
        throw new Error("Invalid Client Runtime Snapshot acquire result");
      const [epoch, generation, payload, bootstrapped] = result;
      if (
        typeof epoch !== "string"
        || !epoch
        || typeof generation !== "string"
        || !/^\d+$/.test(generation)
        || (typeof payload !== "string" && payload !== null)
        || (bootstrapped !== "0" && bootstrapped !== "1")
      ) {
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
      kind: ClientSnapshotKind,
      control: ClientSnapshotControl,
      payload: string,
      ttlMs: number,
    ) {
      const keys = clientSnapshotKeys(clientCode);
      const result = await redis.eval(
        PUBLISH_SCRIPT,
        2,
        keys.control,
        keys.payloads[CLIENT_SNAPSHOT_KINDS.indexOf(kind)]!,
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

    async invalidateClient(clientCode: string, candidateEpoch: string) {
      const keys = clientSnapshotKeys(clientCode);
      const result = await redis.eval(
        INVALIDATE_SCRIPT,
        3,
        keys.control,
        ...keys.payloads,
        candidateEpoch,
      );
      if (Number(result) !== 1)
        throw new Error("Invalid Client Runtime Snapshot invalidation result");
    },
  };
}
