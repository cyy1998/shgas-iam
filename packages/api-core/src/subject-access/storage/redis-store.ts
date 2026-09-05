import type {
  SubjectAccessAbortBeginResult,
  SubjectAccessAtomicStore,
  SubjectAccessBeginResult,
  SubjectAccessFinalizeResult,
  SubjectAccessPrepareRepairResult,
  SubjectAccessRepairBacklogMetrics,
  SubjectAccessRepairFinalizeResult,
  SubjectAccessRepairLease,
  SubjectAccessRepairRescheduleResult,
  SubjectAccessRollbackResult,
} from "./store";

const VALIDATE_RECORD_LUA = `
local function decodeRecord(raw, subjectIdentifier)
  local ok, record = pcall(cjson.decode, raw)
  if not ok or type(record) ~= "table" then
    return nil
  end

  local fieldCount = 0
  for _ in pairs(record) do
    fieldCount = fieldCount + 1
  end

  if record.version ~= 1
    or record.subjectIdentifier ~= subjectIdentifier
    or type(record.updatedAt) ~= "string"
    or (record.transitionId ~= nil and type(record.transitionId) ~= "string")
    or (record.state ~= "enabled" and record.state ~= "blocking" and record.state ~= "disabled") then
    return nil
  end

  if record.state == "blocking" then
    if type(record.transitionId) ~= "string" or fieldCount ~= 5 then
      return nil
    end
  elseif not (
    (fieldCount == 4 and record.transitionId == nil)
    or (fieldCount == 5 and type(record.transitionId) == "string")
  ) then
    return nil
  end

  return record
end
`;

const REDIS_NOW_MS_LUA = `
local function redisNowMs()
  local redisTime = redis.call("TIME")
  return tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
end
`;

const MAX_REPAIR_INDEX_CLEANUP_RETRIES = 16;

const INSPECT_REPAIR_BACKLOG_SCRIPT = `-- subject-access:inspect-repair-backlog
${REDIS_NOW_MS_LUA}
local backlogKey = KEYS[1]
local ageIndexKey = KEYS[2]
local count = redis.call("ZCARD", backlogKey)
local ageCount = redis.call("ZCARD", ageIndexKey)

if count ~= ageCount then
  return { "invalid" }
end

if count == 0 then
  return { "0", "" }
end

local sharedCount = redis.call(
  "ZINTERCARD",
  2,
  backlogKey,
  ageIndexKey,
  "LIMIT",
  count
)
if sharedCount ~= count then
  return { "invalid" }
end

local oldest = redis.call("ZRANGE", ageIndexKey, 0, 0, "WITHSCORES")
if #oldest ~= 2 then
  return { "invalid" }
end

local enteredAt = tonumber(oldest[2])
if not enteredAt then
  return { "invalid" }
end

local oldestAgeMs = redisNowMs() - enteredAt
if oldestAgeMs < 0 then
  oldestAgeMs = 0
end
return { tostring(count), tostring(oldestAgeMs) }
`;

const BEGIN_BLOCKING_SCRIPT = `-- subject-access:begin-blocking
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local transitionIndexKey = KEYS[3]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local blockingRecord = ARGV[3]
local recoveryDelayMs = tonumber(ARGV[4])
local currentRaw = redis.call("GET", recordKey)

if currentRaw then
  local current = decodeRecord(currentRaw, subjectIdentifier)
  if not current then
    return { "invalid" }
  end

  if current.state == "blocking" then
    local journalRaw = redis.call("GET", journalKey)
    local journalOk, journal = pcall(cjson.decode, journalRaw or "")
    if journalOk
      and type(journal) == "table"
      and journal.status == "mutating"
      and journal.transitionId == transitionId
      and current.transitionId == transitionId then
      return {
        "already_transitioning",
        journal.previousCommittedTransitionId or ""
      }
    end
    return { "conflict" }
  end
end

local nextRecord = decodeRecord(blockingRecord, subjectIdentifier)
if not nextRecord or nextRecord.state ~= "blocking" or nextRecord.transitionId ~= transitionId then
  return { "invalid" }
end

local previousCommittedTransitionId = ""
if currentRaw then
  previousCommittedTransitionId = decodeRecord(currentRaw, subjectIdentifier).transitionId or ""
end
local journal = {
  version = 1,
  status = "mutating",
  transitionId = transitionId,
  previousRecord = currentRaw or cjson.null,
  previousCommittedTransitionId = previousCommittedTransitionId,
  recoveryFence = 0
}
redis.call("SET", journalKey, cjson.encode(journal))
redis.call("SET", recordKey, blockingRecord)
redis.call(
  "ZADD",
  transitionIndexKey,
  redisNowMs() + recoveryDelayMs,
  subjectIdentifier
)
return { "transitioned", previousCommittedTransitionId }
`;

const ABORT_BEGIN_SCRIPT = `-- subject-access:abort-begin
${VALIDATE_RECORD_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local backlogKey = KEYS[3]
local ageIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local journalRaw = redis.call("GET", journalKey)

if not journalRaw then
  return "not_started"
end

local journalOk, journal = pcall(cjson.decode, journalRaw)
if not journalOk or type(journal) ~= "table" then
  return "invalid"
end

if journal.status == "rolled_back" then
  if journal.transitionId == transitionId then
    return "already_aborted"
  end
  return "wrong_transition"
end

if journal.status ~= "mutating" or journal.transitionId ~= transitionId then
  return "wrong_transition"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
if not current or current.state ~= "blocking" or current.transitionId ~= transitionId then
  return "invalid"
end

if journal.previousRecord == cjson.null then
  redis.call("DEL", recordKey)
else
  local previous = decodeRecord(journal.previousRecord, subjectIdentifier)
  if not previous or previous.state == "blocking" then
    return "invalid"
  end
  redis.call("SET", recordKey, journal.previousRecord)
end

redis.call("SET", journalKey, cjson.encode({
  version = 1,
  status = "rolled_back",
  transitionId = transitionId
}))
redis.call("ZREM", backlogKey, subjectIdentifier)
redis.call("ZREM", ageIndexKey, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "aborted"
`;

const PREPARE_REPAIR_SCRIPT = `-- subject-access:prepare-repair
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local backlogKey = KEYS[3]
local ageIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local targetState = ARGV[3]
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk or type(journal) ~= "table" then
  return "wrong_transition"
end

if journal.status == "finalized" then
  if journal.transitionId == transitionId and journal.targetState == targetState then
    return "already_prepared"
  end
  return "wrong_transition"
end

if journal.status == "repairable" then
  if journal.transitionId == transitionId and journal.targetState == targetState then
    if not redis.call("ZSCORE", backlogKey, subjectIdentifier)
      or not redis.call("ZSCORE", ageIndexKey, subjectIdentifier) then
      return "invalid"
    end
    return "already_prepared"
  end
  return "wrong_transition"
end

if journal.status ~= "mutating" or journal.transitionId ~= transitionId then
  return "wrong_transition"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
if not current
  or current.state ~= "blocking"
  or current.transitionId ~= transitionId
  or (targetState ~= "enabled" and targetState ~= "disabled") then
  return "invalid"
end

journal.status = "repairable"
journal.targetState = targetState
journal.fence = 0
redis.call("SET", journalKey, cjson.encode(journal))
local now = redisNowMs()
redis.call("ZADD", backlogKey, now, subjectIdentifier)
redis.call("ZADD", ageIndexKey, now, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "prepared"
`;

const FINALIZE_SCRIPT = `-- subject-access:finalize
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local backlogKey = KEYS[3]
local ageIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local targetState = ARGV[3]
local targetRecord = ARGV[4]
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk or type(journal) ~= "table" then
  return "wrong_transition"
end

if journal.status == "finalized" then
  if journal.transitionId == transitionId and journal.targetState == targetState then
    return "already_finalized"
  end
  return "wrong_transition"
end

if journal.status ~= "repairable"
  or journal.transitionId ~= transitionId
  or journal.targetState ~= targetState then
  return "wrong_transition"
end

if journal.leaseToken ~= nil
  and type(journal.leaseUntil) == "number"
  and redisNowMs() < journal.leaseUntil then
  return "wrong_transition"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
local target = decodeRecord(targetRecord, subjectIdentifier)
if not current
  or current.state ~= "blocking"
  or current.transitionId ~= transitionId
  or not target
  or target.state ~= targetState
  or target.transitionId ~= transitionId
  or targetState == "blocking" then
  return "invalid"
end

redis.call("SET", recordKey, targetRecord)
redis.call("SET", journalKey, cjson.encode({
  version = 1,
  status = "finalized",
  transitionId = transitionId,
  targetState = targetState
}))
redis.call("ZREM", backlogKey, subjectIdentifier)
redis.call("ZREM", ageIndexKey, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "finalized"
`;

const ROLLBACK_SCRIPT = `-- subject-access:rollback
${VALIDATE_RECORD_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local backlogKey = KEYS[3]
local ageIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk or type(journal) ~= "table" then
  return "wrong_transition"
end

if journal.status == "rolled_back" then
  if journal.transitionId == transitionId then
    return "already_rolled_back"
  end
  return "wrong_transition"
end

if journal.status ~= "mutating" or journal.transitionId ~= transitionId then
  return "wrong_transition"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
if not current or current.state ~= "blocking" or current.transitionId ~= transitionId then
  return "invalid"
end

if journal.previousRecord == cjson.null then
  redis.call("DEL", recordKey)
else
  local previous = decodeRecord(journal.previousRecord, subjectIdentifier)
  if not previous or previous.state == "blocking" then
    return "invalid"
  end
  redis.call("SET", recordKey, journal.previousRecord)
end

redis.call("SET", journalKey, cjson.encode({
  version = 1,
  status = "rolled_back",
  transitionId = transitionId
}))
redis.call("ZREM", backlogKey, subjectIdentifier)
redis.call("ZREM", ageIndexKey, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "rolled_back"
`;

const CLAIM_TRANSITION_RECOVERY_SCRIPT = `-- subject-access:claim-transition-recovery
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local transitionIndexKey = KEYS[1]
local leaseDurationMs = tonumber(ARGV[1])
local leaseToken = ARGV[2]
local recordPrefix = ARGV[3]
local journalPrefix = ARGV[4]
local now = redisNowMs()
local candidates = redis.call(
  "ZRANGEBYSCORE",
  transitionIndexKey,
  "-inf",
  now,
  "LIMIT",
  0,
  64
)

for _, subjectIdentifier in ipairs(candidates) do
  local recordKey = recordPrefix .. subjectIdentifier
  local journalKey = journalPrefix .. subjectIdentifier
  local currentRaw = redis.call("GET", recordKey)
  local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
  local journalRaw = redis.call("GET", journalKey)
  local journalOk, journal = pcall(cjson.decode, journalRaw or "")
  if current
    and current.state == "blocking"
    and journalOk
    and type(journal) == "table"
    and journal.status == "mutating"
    and journal.transitionId == current.transitionId then
    local fence = (tonumber(journal.recoveryFence) or 0) + 1
    local leaseUntil = now + leaseDurationMs
    journal.recoveryFence = fence
    journal.recoveryLeaseToken = leaseToken
    journal.recoveryLeaseUntil = leaseUntil
    redis.call("SET", journalKey, cjson.encode(journal))
    redis.call("ZADD", transitionIndexKey, leaseUntil, subjectIdentifier)
    return {
      subjectIdentifier,
      journal.transitionId,
      leaseToken,
      tostring(fence),
      tostring(leaseUntil)
    }
  end
  redis.call("ZREM", transitionIndexKey, subjectIdentifier)
end

if #candidates == 64 then
  return { "retry_after_cleanup" }
end
return {}
`;

const RESCHEDULE_TRANSITION_RECOVERY_SCRIPT = `-- subject-access:reschedule-transition-recovery
${REDIS_NOW_MS_LUA}
local journalKey = KEYS[1]
local transitionIndexKey = KEYS[2]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local leaseToken = ARGV[3]
local fence = tonumber(ARGV[4])
local leaseUntil = tonumber(ARGV[5])
local retryDelayMs = tonumber(ARGV[6])
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk
  or type(journal) ~= "table"
  or journal.status ~= "mutating"
  or journal.transitionId ~= transitionId
  or journal.recoveryLeaseToken ~= leaseToken
  or tonumber(journal.recoveryFence) ~= fence
  or tonumber(journal.recoveryLeaseUntil) ~= leaseUntil then
  return "stale_lease"
end

local now = redisNowMs()
if now >= leaseUntil then
  return "lease_expired"
end

journal.recoveryLeaseToken = nil
journal.recoveryLeaseUntil = nil
redis.call("SET", journalKey, cjson.encode(journal))
redis.call(
  "ZADD",
  transitionIndexKey,
  now + retryDelayMs,
  subjectIdentifier
)
return "rescheduled"
`;

const RECONCILE_TRANSITION_RECOVERY_SCRIPT = `-- subject-access:reconcile-transition-recovery
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local repairBacklogKey = KEYS[3]
local repairAgeIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local leaseToken = ARGV[3]
local fence = tonumber(ARGV[4])
local leaseUntil = tonumber(ARGV[5])
local resolutionStatus = ARGV[6]
local targetState = ARGV[7]
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk
  or type(journal) ~= "table"
  or journal.status ~= "mutating"
  or journal.transitionId ~= transitionId
  or journal.recoveryLeaseToken ~= leaseToken
  or tonumber(journal.recoveryFence) ~= fence
  or tonumber(journal.recoveryLeaseUntil) ~= leaseUntil then
  return "stale_lease"
end

local now = redisNowMs()
if now >= leaseUntil then
  return "lease_expired"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
if not current
  or current.state ~= "blocking"
  or current.transitionId ~= transitionId then
  return "invalid"
end

if resolutionStatus == "committed" then
  if targetState ~= "enabled" and targetState ~= "disabled" then
    return "invalid"
  end
  journal.status = "repairable"
  journal.targetState = targetState
  journal.fence = 0
  journal.recoveryLeaseToken = nil
  journal.recoveryLeaseUntil = nil
  redis.call("SET", journalKey, cjson.encode(journal))
  redis.call("ZADD", repairBacklogKey, now, subjectIdentifier)
  redis.call("ZADD", repairAgeIndexKey, now, subjectIdentifier)
  redis.call("ZREM", transitionIndexKey, subjectIdentifier)
  return "prepared"
end

if resolutionStatus ~= "rolled_back" or targetState ~= "" then
  return "invalid"
end
if journal.previousRecord == cjson.null then
  redis.call("DEL", recordKey)
else
  local previous = decodeRecord(journal.previousRecord, subjectIdentifier)
  if not previous or previous.state == "blocking" then
    return "invalid"
  end
  redis.call("SET", recordKey, journal.previousRecord)
end
redis.call("SET", journalKey, cjson.encode({
  version = 1,
  status = "rolled_back",
  transitionId = transitionId
}))
redis.call("ZREM", repairBacklogKey, subjectIdentifier)
redis.call("ZREM", repairAgeIndexKey, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "rolled_back"
`;

const CLAIM_REPAIR_SUBJECT_SCRIPT = `-- subject-access:claim-repair-subject
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local backlogKey = KEYS[1]
local ageIndexKey = KEYS[2]
local leaseDurationMs = tonumber(ARGV[1])
local leaseToken = ARGV[2]
local requestedSubject = ARGV[3]
local recordPrefix = ARGV[4]
local journalPrefix = ARGV[5]
local now = redisNowMs()
local candidates

if requestedSubject ~= "" then
  local score = redis.call("ZSCORE", backlogKey, requestedSubject)
  if not score then
    return {}
  end
  candidates = { requestedSubject }
else
  candidates = redis.call("ZRANGEBYSCORE", backlogKey, "-inf", now, "LIMIT", 0, 64)
end

for _, subjectIdentifier in ipairs(candidates) do
  local recordKey = recordPrefix .. subjectIdentifier
  local journalKey = journalPrefix .. subjectIdentifier
  local currentRaw = redis.call("GET", recordKey)
  local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
  local journalRaw = redis.call("GET", journalKey)
  local journalOk, journal = pcall(cjson.decode, journalRaw or "")
  if current
    and current.state == "blocking"
    and journalOk
    and type(journal) == "table"
    and journal.status == "repairable"
    and journal.transitionId == current.transitionId
    and (journal.targetState == "enabled" or journal.targetState == "disabled") then
    if not redis.call("ZSCORE", ageIndexKey, subjectIdentifier) then
      local legacyScheduleScore = tonumber(
        redis.call("ZSCORE", backlogKey, subjectIdentifier)
      )
      if legacyScheduleScore then
        -- Pre-age-index entries have no exact first-entry timestamp. Preserve
        -- the earliest surviving scheduling evidence, capped at first
        -- observation by the upgraded owner so future leases cannot move it.
        local migratedEnteredAt = math.min(legacyScheduleScore, now)
        redis.call(
          "ZADD",
          ageIndexKey,
          "NX",
          migratedEnteredAt,
          subjectIdentifier
        )
      end
    end
    if requestedSubject ~= ""
      and journal.leaseToken ~= nil
      and type(journal.leaseUntil) == "number"
      and now < journal.leaseUntil then
      return {}
    end
    local fence = (tonumber(journal.fence) or 0) + 1
    local leaseUntil = now + leaseDurationMs
    journal.fence = fence
    journal.leaseToken = leaseToken
    journal.leaseUntil = leaseUntil
    redis.call("SET", journalKey, cjson.encode(journal))
    redis.call("ZADD", backlogKey, leaseUntil, subjectIdentifier)
    return {
      subjectIdentifier,
      journal.transitionId,
      journal.targetState,
      leaseToken,
      tostring(fence),
      tostring(leaseUntil)
    }
  end
  redis.call("ZREM", backlogKey, subjectIdentifier)
  redis.call("ZREM", ageIndexKey, subjectIdentifier)
end

if requestedSubject == "" and #candidates == 64 then
  return { "retry_after_cleanup" }
end

return {}
`;

const RESCHEDULE_REPAIR_SUBJECT_SCRIPT = `-- subject-access:reschedule-repair-subject
${REDIS_NOW_MS_LUA}
local journalKey = KEYS[1]
local backlogKey = KEYS[2]
local ageIndexKey = KEYS[3]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local targetState = ARGV[3]
local leaseToken = ARGV[4]
local fence = tonumber(ARGV[5])
local leaseUntil = tonumber(ARGV[6])
local retryDelayMs = tonumber(ARGV[7])
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk
  or type(journal) ~= "table"
  or journal.status ~= "repairable"
  or journal.transitionId ~= transitionId
  or journal.targetState ~= targetState
  or journal.leaseToken ~= leaseToken
  or tonumber(journal.fence) ~= fence
  or tonumber(journal.leaseUntil) ~= leaseUntil then
  return "stale_lease"
end

if not redis.call("ZSCORE", ageIndexKey, subjectIdentifier) then
  return "invalid"
end

local now = redisNowMs()
if now >= leaseUntil then
  return "lease_expired"
end

journal.leaseToken = nil
journal.leaseUntil = nil
redis.call("SET", journalKey, cjson.encode(journal))
redis.call("ZADD", backlogKey, now + retryDelayMs, subjectIdentifier)
return "rescheduled"
`;

const FINALIZE_REPAIR_SUBJECT_SCRIPT = `-- subject-access:finalize-repair-subject
${VALIDATE_RECORD_LUA}
${REDIS_NOW_MS_LUA}
local recordKey = KEYS[1]
local journalKey = KEYS[2]
local backlogKey = KEYS[3]
local ageIndexKey = KEYS[4]
local transitionIndexKey = KEYS[5]
local subjectIdentifier = ARGV[1]
local transitionId = ARGV[2]
local targetState = ARGV[3]
local leaseToken = ARGV[4]
local fence = tonumber(ARGV[5])
local leaseUntil = tonumber(ARGV[6])
local targetRecord = ARGV[7]
local journalRaw = redis.call("GET", journalKey)
local journalOk, journal = pcall(cjson.decode, journalRaw or "")

if not journalOk
  or type(journal) ~= "table"
  or journal.status ~= "repairable"
  or journal.transitionId ~= transitionId
  or journal.targetState ~= targetState
  or journal.leaseToken ~= leaseToken
  or tonumber(journal.fence) ~= fence
  or tonumber(journal.leaseUntil) ~= leaseUntil then
  return "stale_lease"
end

if redisNowMs() >= leaseUntil then
  return "lease_expired"
end

local currentRaw = redis.call("GET", recordKey)
local current = currentRaw and decodeRecord(currentRaw, subjectIdentifier) or nil
local target = decodeRecord(targetRecord, subjectIdentifier)
if not current
  or current.state ~= "blocking"
  or current.transitionId ~= transitionId
  or not target
  or target.state ~= targetState
  or target.transitionId ~= transitionId
  or targetState == "blocking" then
  return "invalid"
end

redis.call("SET", recordKey, targetRecord)
redis.call("SET", journalKey, cjson.encode({
  version = 1,
  status = "finalized",
  transitionId = transitionId,
  targetState = targetState
}))
redis.call("ZREM", backlogKey, subjectIdentifier)
redis.call("ZREM", ageIndexKey, subjectIdentifier)
redis.call("ZREM", transitionIndexKey, subjectIdentifier)
return "finalized"
`;

export const SUBJECT_ACCESS_REDIS_KEY_PREFIX = "subject-access:v1:";

export interface SubjectAccessRedis {
  get: (key: string) => Promise<string | null>;
  eval: (
    script: string,
    keyCount: number,
    ...args: Array<number | string>
  ) => Promise<unknown>;
}

export interface CreateRedisSubjectAccessStoreOptions {
  readonly redis: SubjectAccessRedis;
  readonly keyPrefix?: string;
  readonly transitionRecoveryDelayMs?: number;
}

export function createRedisSubjectAccessStore(
  options: CreateRedisSubjectAccessStoreOptions,
): SubjectAccessAtomicStore {
  const prefix = options.keyPrefix ?? SUBJECT_ACCESS_REDIS_KEY_PREFIX;
  const recordPrefix = `${prefix}record:`;
  const journalPrefix = `${prefix}transition:`;
  const backlogKey = `${prefix}idx:repair`;
  const backlogAgeIndexKey = `${prefix}idx:repair:age`;
  const transitionIndexKey = `${prefix}idx:transition`;
  const transitionRecoveryDelayMs = requireNonNegativeSafeInteger(
    options.transitionRecoveryDelayMs ?? 300_000,
    "transition recovery delay",
  );

  function recordKey(subjectIdentifier: string) {
    return `${recordPrefix}${subjectIdentifier}`;
  }

  function journalKey(subjectIdentifier: string) {
    return `${journalPrefix}${subjectIdentifier}`;
  }

  return {
    async read(subjectIdentifier) {
      return await options.redis.get(recordKey(subjectIdentifier));
    },
    async abortBegin(input) {
      return requireScriptStatus<SubjectAccessAbortBeginResult>(
        await options.redis.eval(
          ABORT_BEGIN_SCRIPT,
          5,
          recordKey(input.subjectIdentifier),
          journalKey(input.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.subjectIdentifier,
          input.transitionId,
        ),
        "abort begin",
        [
          "aborted",
          "already_aborted",
          "not_started",
          "wrong_transition",
          "invalid",
        ],
      );
    },
    async beginBlocking(input) {
      return requireBeginResult(
        await options.redis.eval(
          BEGIN_BLOCKING_SCRIPT,
          3,
          recordKey(input.subjectIdentifier),
          journalKey(input.subjectIdentifier),
          transitionIndexKey,
          input.subjectIdentifier,
          input.transitionId,
          input.blockingRecord,
          String(transitionRecoveryDelayMs),
        ),
      );
    },
    async prepareRepair(input) {
      return requireScriptStatus<SubjectAccessPrepareRepairResult>(
        await options.redis.eval(
          PREPARE_REPAIR_SCRIPT,
          5,
          recordKey(input.subjectIdentifier),
          journalKey(input.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.subjectIdentifier,
          input.transitionId,
          input.targetState,
        ),
        "prepare repair",
        ["prepared", "already_prepared", "wrong_transition", "invalid"],
      );
    },
    async finalize(input) {
      return requireScriptStatus<SubjectAccessFinalizeResult>(
        await options.redis.eval(
          FINALIZE_SCRIPT,
          5,
          recordKey(input.subjectIdentifier),
          journalKey(input.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.subjectIdentifier,
          input.transitionId,
          input.targetState,
          input.targetRecord,
        ),
        "finalize",
        ["finalized", "already_finalized", "wrong_transition", "invalid"],
      );
    },
    async rollback(input) {
      return requireScriptStatus<SubjectAccessRollbackResult>(
        await options.redis.eval(
          ROLLBACK_SCRIPT,
          5,
          recordKey(input.subjectIdentifier),
          journalKey(input.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.subjectIdentifier,
          input.transitionId,
        ),
        "rollback",
        ["rolled_back", "already_rolled_back", "wrong_transition", "invalid"],
      );
    },
    async inspectRepairBacklog() {
      return requireRepairBacklogMetrics(
        await options.redis.eval(
          INSPECT_REPAIR_BACKLOG_SCRIPT,
          2,
          backlogKey,
          backlogAgeIndexKey,
        ),
      );
    },
    async claimTransitionRecovery(input) {
      requirePositiveSafeInteger(
        input.leaseDurationMs,
        "transition recovery lease duration",
      );
      if (input.leaseToken.length === 0) {
        throw new RangeError(
          "Subject Access transition recovery lease token must not be empty",
        );
      }
      for (
        let cleanupRetries = 0;
        cleanupRetries <= MAX_REPAIR_INDEX_CLEANUP_RETRIES;
        cleanupRetries += 1
      ) {
        const value = await options.redis.eval(
          CLAIM_TRANSITION_RECOVERY_SCRIPT,
          1,
          transitionIndexKey,
          String(input.leaseDurationMs),
          input.leaseToken,
          recordPrefix,
          journalPrefix,
        );
        const fields = requireScriptArray(value, "transition recovery claim");
        if (fields.length === 0)
          return null;
        if (fields.length === 1 && fields[0] === "retry_after_cleanup") {
          if (cleanupRetries < MAX_REPAIR_INDEX_CLEANUP_RETRIES)
            continue;
          throw new Error(
            "Redis Subject Access transition recovery index cleanup remains incomplete",
          );
        }
        if (fields.length !== 5) {
          throw new TypeError(
            "Redis Subject Access transition recovery claim script returned an invalid result",
          );
        }
        const [
          subjectIdentifier,
          transitionId,
          leaseToken,
          fenceRaw,
          leaseUntilRaw,
        ] = fields as [string, string, string, string, string];
        const fence = Number(fenceRaw);
        const leaseUntil = Number(leaseUntilRaw);
        if (
          !Number.isSafeInteger(fence)
          || fence <= 0
          || !Number.isSafeInteger(leaseUntil)
        ) {
          throw new TypeError(
            "Redis Subject Access transition recovery claim script returned invalid fencing data",
          );
        }
        return {
          subjectIdentifier,
          transitionId,
          leaseToken,
          fence,
          leaseUntil,
        };
      }
      throw new Error(
        "Redis Subject Access transition recovery claim retry loop ended unexpectedly",
      );
    },
    async reconcileTransitionRecovery(input) {
      return requireScriptStatus(
        await options.redis.eval(
          RECONCILE_TRANSITION_RECOVERY_SCRIPT,
          5,
          recordKey(input.lease.subjectIdentifier),
          journalKey(input.lease.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.lease.subjectIdentifier,
          input.lease.transitionId,
          input.lease.leaseToken,
          String(input.lease.fence),
          String(input.lease.leaseUntil),
          input.resolution.status,
          input.resolution.status === "committed"
            ? input.resolution.targetState
            : "",
        ),
        "reconcile transition recovery",
        [
          "prepared",
          "rolled_back",
          "stale_lease",
          "lease_expired",
          "invalid",
        ] as const,
      );
    },
    async rescheduleTransitionRecovery(input) {
      requirePositiveSafeInteger(
        input.retryDelayMs,
        "transition recovery retry delay",
      );
      return requireScriptStatus(
        await options.redis.eval(
          RESCHEDULE_TRANSITION_RECOVERY_SCRIPT,
          2,
          journalKey(input.lease.subjectIdentifier),
          transitionIndexKey,
          input.lease.subjectIdentifier,
          input.lease.transitionId,
          input.lease.leaseToken,
          String(input.lease.fence),
          String(input.lease.leaseUntil),
          String(input.retryDelayMs),
        ),
        "reschedule transition recovery",
        ["rescheduled", "stale_lease", "lease_expired", "invalid"] as const,
      );
    },
    async claimRepairSubject(input) {
      requirePositiveSafeInteger(input.leaseDurationMs, "repair lease duration");
      if (input.leaseToken.length === 0)
        throw new RangeError("Subject Access repair lease token must not be empty");
      for (
        let cleanupRetries = 0;
        cleanupRetries <= MAX_REPAIR_INDEX_CLEANUP_RETRIES;
        cleanupRetries += 1
      ) {
        const value = await options.redis.eval(
          CLAIM_REPAIR_SUBJECT_SCRIPT,
          2,
          backlogKey,
          backlogAgeIndexKey,
          String(input.leaseDurationMs),
          input.leaseToken,
          input.subjectIdentifier ?? "",
          recordPrefix,
          journalPrefix,
        );
        const fields = requireScriptArray(value, "repair claim");
        if (fields.length === 0)
          return null;
        if (fields.length === 1 && fields[0] === "retry_after_cleanup") {
          if (cleanupRetries < MAX_REPAIR_INDEX_CLEANUP_RETRIES)
            continue;
          throw new Error("Redis Subject Access repair index cleanup remains incomplete");
        }
        if (fields.length !== 6)
          throw new TypeError("Redis Subject Access repair claim script returned an invalid result");
        const [
          subjectIdentifier,
          transitionId,
          targetState,
          leaseToken,
          fenceRaw,
          leaseUntilRaw,
        ] = fields as [string, string, string, string, string, string];
        if (targetState !== "enabled" && targetState !== "disabled")
          throw new TypeError("Redis Subject Access repair claim script returned an invalid target");
        const fence = Number(fenceRaw);
        const leaseUntil = Number(leaseUntilRaw);
        if (!Number.isSafeInteger(fence) || fence <= 0 || !Number.isSafeInteger(leaseUntil))
          throw new TypeError("Redis Subject Access repair claim script returned invalid fencing data");
        return {
          subjectIdentifier,
          transitionId,
          targetState,
          leaseToken,
          fence,
          leaseUntil,
        } satisfies SubjectAccessRepairLease;
      }
      throw new Error("Redis Subject Access repair claim retry loop ended unexpectedly");
    },
    async rescheduleRepairSubject(input) {
      requirePositiveSafeInteger(input.retryDelayMs, "repair retry delay");
      return requireScriptStatus<SubjectAccessRepairRescheduleResult>(
        await options.redis.eval(
          RESCHEDULE_REPAIR_SUBJECT_SCRIPT,
          3,
          journalKey(input.lease.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          input.lease.subjectIdentifier,
          input.lease.transitionId,
          input.lease.targetState,
          input.lease.leaseToken,
          String(input.lease.fence),
          String(input.lease.leaseUntil),
          String(input.retryDelayMs),
        ),
        "reschedule repair subject",
        ["rescheduled", "stale_lease", "lease_expired", "invalid"],
      );
    },
    async finalizeRepairSubject(input) {
      return requireScriptStatus<SubjectAccessRepairFinalizeResult>(
        await options.redis.eval(
          FINALIZE_REPAIR_SUBJECT_SCRIPT,
          5,
          recordKey(input.lease.subjectIdentifier),
          journalKey(input.lease.subjectIdentifier),
          backlogKey,
          backlogAgeIndexKey,
          transitionIndexKey,
          input.lease.subjectIdentifier,
          input.lease.transitionId,
          input.lease.targetState,
          input.lease.leaseToken,
          String(input.lease.fence),
          String(input.lease.leaseUntil),
          input.targetRecord,
        ),
        "finalize repair subject",
        ["finalized", "stale_lease", "lease_expired", "invalid"],
      );
    },
  };
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Subject Access ${name} must be a positive safe integer`);
  return value;
}

function requireNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`Subject Access ${name} must be a non-negative safe integer`);
  return value;
}

function requireBeginResult(value: unknown): SubjectAccessBeginResult {
  const fields = requireScriptArray(value, "begin blocking");
  const [status, previousCommittedTransitionId] = fields;
  if (status === "conflict" || status === "invalid") {
    if (fields.length !== 1)
      throw new TypeError("Redis Subject Access begin blocking script returned an invalid result");
    return status;
  }
  if (
    (status === "transitioned" || status === "already_transitioning")
    && fields.length === 2
  ) {
    return {
      status,
      previousCommittedTransitionId: previousCommittedTransitionId === ""
        ? null
        : previousCommittedTransitionId!,
    };
  }
  throw new TypeError("Redis Subject Access begin blocking script returned an invalid result");
}

function requireRepairBacklogMetrics(
  value: unknown,
): SubjectAccessRepairBacklogMetrics {
  const fields = requireScriptArray(value, "repair backlog inspection");
  if (fields.length !== 2) {
    throw new TypeError(
      "Redis Subject Access repair backlog indexes are inconsistent",
    );
  }
  const [countRaw, oldestAgeRaw] = fields;
  const count = Number(countRaw);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError(
      "Redis Subject Access repair backlog inspection returned an invalid count",
    );
  }
  if (count === 0 && oldestAgeRaw === "") {
    return { count, oldestAgeMs: null };
  }
  const oldestAgeMs = Number(oldestAgeRaw);
  if (
    count === 0
    || !Number.isSafeInteger(oldestAgeMs)
    || oldestAgeMs < 0
  ) {
    throw new TypeError(
      "Redis Subject Access repair backlog inspection returned an invalid age",
    );
  }
  return { count, oldestAgeMs };
}

function requireScriptArray(value: unknown, operation: string) {
  if (!Array.isArray(value))
    throw new TypeError(`Redis Subject Access ${operation} script returned an invalid result`);
  return value.map((field) => {
    if (typeof field === "string")
      return field;
    if (Buffer.isBuffer(field))
      return field.toString("utf8");
    throw new TypeError(`Redis Subject Access ${operation} script returned an invalid field`);
  });
}

function requireScriptStatus<T extends string>(
  value: unknown,
  operation: string,
  allowed: readonly T[],
): T {
  const status = typeof value === "string"
    ? value
    : Buffer.isBuffer(value)
      ? value.toString("utf8")
      : undefined;
  if (status === undefined || !allowed.includes(status as T))
    throw new TypeError(`Redis Subject Access ${operation} script returned an invalid result`);
  return status as T;
}
