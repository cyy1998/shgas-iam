import type { AuthorizationGrantRedemptionStore } from "./store";

export const AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX
  = "authorization-grant:redemption:v1:";

export interface AuthorizationGrantRedemptionRedis {
  readonly del: (...keys: string[]) => Promise<number>;
  readonly eval: (
    script: string,
    keyCount: number,
    ...args: Array<string | number>
  ) => Promise<unknown>;
}

export interface CreateRedisAuthorizationGrantRedemptionStoreOptions {
  readonly keyPrefix?: string;
  readonly redis: AuthorizationGrantRedemptionRedis;
}

const REDIS_NOW_MS_LUA = `
local function redisNowMs()
  local redisTime = redis.call("TIME")
  return tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
end
`;

const VALIDATE_RECORD_LUA = `
local function decodeRecord(raw, grantId)
  local ok, record = pcall(cjson.decode, raw or "")
  if not ok or type(record) ~= "table" then
    return nil
  end

  local fieldCount = 0
  for _ in pairs(record) do
    fieldCount = fieldCount + 1
  end

  if record.version ~= 1
    or record.grantId ~= grantId
    or type(record.expiresAt) ~= "number"
    or record.expiresAt ~= math.floor(record.expiresAt) then
    return nil
  end

  if record.state == "issued" or record.state == "consumed" then
    if fieldCount ~= 4 then
      return nil
    end
  elseif record.state == "redeeming" then
    if fieldCount ~= 6
      or type(record.attemptId) ~= "string"
      or type(record.leaseExpiresAt) ~= "number"
      or record.leaseExpiresAt ~= math.floor(record.leaseExpiresAt) then
      return nil
    end
  else
    return nil
  end

  return record
end
`;

const INITIALIZE_SCRIPT = `-- authorization-grant-redemption:initialize
${REDIS_NOW_MS_LUA}
local key = KEYS[1]
local record = ARGV[1]
local expiresAt = tonumber(ARGV[2])
local now = redisNowMs()
if not expiresAt or expiresAt <= now then
  return { "expired" }
end
local result = redis.call("SET", key, record, "PXAT", tostring(expiresAt), "NX")
if not result then
  return { "exists" }
end
return { "created" }
`;

const BEGIN_SCRIPT = `-- authorization-grant-redemption:begin
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local key = KEYS[1]
local grantId = ARGV[1]
local attemptId = ARGV[2]
local leaseDurationMs = tonumber(ARGV[3])
local raw = redis.call("GET", key)
if not raw then
  return { "missing" }
end
local record = decodeRecord(raw, grantId)
if not record then
  return { "invalid" }
end
local now = redisNowMs()
if record.expiresAt <= now then
  redis.call("DEL", key)
  return { "expired" }
end
if record.state == "consumed" then
  return { "consumed" }
end
if record.state == "redeeming" and record.leaseExpiresAt > now then
  return { "busy", tostring(record.leaseExpiresAt) }
end
local leaseExpiresAt = math.min(record.expiresAt, now + leaseDurationMs)
local nextRecord = {
  version = 1,
  grantId = grantId,
  state = "redeeming",
  attemptId = attemptId,
  leaseExpiresAt = leaseExpiresAt,
  expiresAt = record.expiresAt
}
redis.call("SET", key, cjson.encode(nextRecord), "PXAT", tostring(record.expiresAt))
return { "reserved", tostring(leaseExpiresAt), tostring(record.expiresAt) }
`;

const RENEW_SCRIPT = `-- authorization-grant-redemption:renew
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local key = KEYS[1]
local grantId = ARGV[1]
local attemptId = ARGV[2]
local expectedLeaseExpiresAt = tonumber(ARGV[3])
local leaseDurationMs = tonumber(ARGV[4])
local raw = redis.call("GET", key)
if not raw then
  return { "missing" }
end
local record = decodeRecord(raw, grantId)
if not record then
  return { "invalid" }
end
local now = redisNowMs()
if record.expiresAt <= now then
  redis.call("DEL", key)
  return { "expired" }
end
if record.state == "consumed" then
  return { "consumed" }
end
if record.state ~= "redeeming"
  or record.attemptId ~= attemptId
  or record.leaseExpiresAt ~= expectedLeaseExpiresAt then
  return { "stale-attempt" }
end
if record.leaseExpiresAt <= now then
  return { "lease-expired" }
end
local leaseExpiresAt = math.max(
  record.leaseExpiresAt,
  math.min(record.expiresAt, now + leaseDurationMs)
)
local nextRecord = {
  version = 1,
  grantId = grantId,
  state = "redeeming",
  attemptId = attemptId,
  leaseExpiresAt = leaseExpiresAt,
  expiresAt = record.expiresAt
}
redis.call("SET", key, cjson.encode(nextRecord), "PXAT", tostring(record.expiresAt))
return { "renewed", tostring(leaseExpiresAt), tostring(record.expiresAt) }
`;

const RELEASE_SCRIPT = `-- authorization-grant-redemption:release
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local key = KEYS[1]
local grantId = ARGV[1]
local attemptId = ARGV[2]
local expectedLeaseExpiresAt = tonumber(ARGV[3])
local raw = redis.call("GET", key)
if not raw then
  return { "missing" }
end
local record = decodeRecord(raw, grantId)
if not record then
  return { "invalid" }
end
local now = redisNowMs()
if record.expiresAt <= now then
  redis.call("DEL", key)
  return { "expired" }
end
if record.state == "consumed" then
  return { "consumed" }
end
if record.state ~= "redeeming"
  or record.attemptId ~= attemptId
  or record.leaseExpiresAt ~= expectedLeaseExpiresAt then
  return { "stale-attempt" }
end
if record.leaseExpiresAt <= now then
  return { "lease-expired" }
end
local nextRecord = {
  version = 1,
  grantId = grantId,
  state = "issued",
  expiresAt = record.expiresAt
}
redis.call("SET", key, cjson.encode(nextRecord), "PXAT", tostring(record.expiresAt))
return { "released" }
`;

const CONSUME_SCRIPT = `-- authorization-grant-redemption:consume
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local key = KEYS[1]
local grantId = ARGV[1]
local attemptId = ARGV[2]
local expectedLeaseExpiresAt = tonumber(ARGV[3])
local raw = redis.call("GET", key)
if not raw then
  return { "missing" }
end
local record = decodeRecord(raw, grantId)
if not record then
  return { "invalid" }
end
local now = redisNowMs()
if record.expiresAt <= now then
  redis.call("DEL", key)
  return { "expired" }
end
if record.state == "consumed" then
  return { "already-consumed" }
end
if record.state ~= "redeeming"
  or record.attemptId ~= attemptId
  or record.leaseExpiresAt ~= expectedLeaseExpiresAt then
  return { "stale-attempt" }
end
if record.leaseExpiresAt <= now then
  return { "lease-expired" }
end
local nextRecord = {
  version = 1,
  grantId = grantId,
  state = "consumed",
  expiresAt = record.expiresAt
}
redis.call("SET", key, cjson.encode(nextRecord), "PXAT", tostring(record.expiresAt))
return { "consumed" }
`;

export function createRedisAuthorizationGrantRemovalStore(options: {
  redis: Pick<AuthorizationGrantRedemptionRedis, "del">;
  keyPrefix?: string;
}): Pick<AuthorizationGrantRedemptionStore, "remove"> {
  const keyPrefix = options.keyPrefix ?? AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX;
  return {
    async remove(grantId) {
      return await options.redis.del(`${keyPrefix}${grantId}`) > 0
        ? "removed"
        : "missing";
    },
  };
}

export function createRedisAuthorizationGrantRedemptionStore(
  options: CreateRedisAuthorizationGrantRedemptionStoreOptions,
): AuthorizationGrantRedemptionStore {
  const keyPrefix = options.keyPrefix
    ?? AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX;

  return {
    ...createRedisAuthorizationGrantRemovalStore(options),
    async initialize(record) {
      const result = await options.redis.eval(
        INITIALIZE_SCRIPT,
        1,
        `${keyPrefix}${record.grantId}`,
        JSON.stringify(record),
        record.expiresAt,
      );
      return parseSimpleResult(result, ["created", "exists", "expired"]);
    },
    async begin(input) {
      const result = parseArrayResult(await options.redis.eval(
        BEGIN_SCRIPT,
        1,
        `${keyPrefix}${input.grantId}`,
        input.grantId,
        input.attemptId,
        input.leaseDurationMs,
      ));
      const status = parseStatus(result[0], [
        "reserved",
        "busy",
        "consumed",
        "expired",
        "invalid",
        "missing",
      ]);
      if (status === "reserved") {
        const leaseExpiresAt = parseSafeInteger(result[1]);
        const expiresAt = parseSafeInteger(result[2]);
        return {
          status,
          reservation: {
            attemptId: input.attemptId,
            expiresAt,
            grantId: input.grantId,
            leaseExpiresAt,
          },
        };
      }
      if (status === "busy") {
        return {
          status,
          leaseExpiresAt: parseSafeInteger(result[1]),
        };
      }
      return { status };
    },
    async renew(input) {
      const result = parseArrayResult(await options.redis.eval(
        RENEW_SCRIPT,
        1,
        `${keyPrefix}${input.reservation.grantId}`,
        input.reservation.grantId,
        input.reservation.attemptId,
        input.reservation.leaseExpiresAt,
        input.leaseDurationMs,
      ));
      const status = parseStatus(result[0], [
        "renewed",
        "stale-attempt",
        "lease-expired",
        "consumed",
        "expired",
        "invalid",
        "missing",
      ]);
      if (status === "renewed") {
        return {
          status,
          reservation: {
            attemptId: input.reservation.attemptId,
            expiresAt: parseSafeInteger(result[2]),
            grantId: input.reservation.grantId,
            leaseExpiresAt: parseSafeInteger(result[1]),
          },
        };
      }
      return { status };
    },
    async release(reservation) {
      const result = await options.redis.eval(
        RELEASE_SCRIPT,
        1,
        `${keyPrefix}${reservation.grantId}`,
        reservation.grantId,
        reservation.attemptId,
        reservation.leaseExpiresAt,
      );
      return parseSimpleResult(result, [
        "released",
        "stale-attempt",
        "lease-expired",
        "consumed",
        "expired",
        "invalid",
        "missing",
      ]);
    },
    async consume(reservation) {
      const result = await options.redis.eval(
        CONSUME_SCRIPT,
        1,
        `${keyPrefix}${reservation.grantId}`,
        reservation.grantId,
        reservation.attemptId,
        reservation.leaseExpiresAt,
      );
      return parseSimpleResult(result, [
        "consumed",
        "already-consumed",
        "stale-attempt",
        "lease-expired",
        "expired",
        "invalid",
        "missing",
      ]);
    },
  };
}

function parseSimpleResult<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  const result = parseArrayResult(value);
  return parseStatus(result[0], allowed);
}

function parseArrayResult(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Invalid Authorization Grant Redis result");
  return value;
}

function parseStatus<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error("Invalid Authorization Grant Redis status");
  return value as T;
}

function parseSafeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error("Invalid Authorization Grant Redis timestamp");
  return parsed;
}
