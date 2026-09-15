// One Redis execution owns the observation time and each lifecycle transition.
export const SESSION_SCRIPT = `
local prefix, request = ARGV[1], cjson.decode(ARGV[2])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local function key(kind, id) return prefix .. kind .. ':' .. id end
local function reply(status, value) return cjson.encode({status=status, value=value, observedAt=now}) end
local function read(k)
  local raw = redis.call('GET', k)
  if not raw then return nil end
  local ok, record = pcall(cjson.decode, raw)
  if not ok or type(record) ~= 'table' then return false end
  if record.version ~= 1 or type(record.instance) ~= 'string' or type(record.subjectIdentifier) ~= 'string'
    or type(record.subjectContext) ~= 'string' or type(record.userSessionId) ~= 'string'
    or type(record.createdAt) ~= 'number' or type(record.expiresAt) ~= 'number'
    or record.expiresAt <= record.createdAt or (record.state ~= 'active' and record.state ~= 'terminated') then return false end
  if record.kind == 'userSession' then
    if type(record.authTime) ~= 'number' or type(record.amr) ~= 'table' then return false end
  elseif record.kind == 'clientSession' then
    if type(record.clientSessionId) ~= 'string' or type(record.parentInstance) ~= 'string'
      or type(record.clientId) ~= 'string' or type(record.authorizedAt) ~= 'number'
      or (record.protocol ~= 'oidc' and record.protocol ~= 'custom_sso') then return false end
  else return false end
  return record
end
local function unavailable(record)
  if record == false then return 'corrupt' end
  if not record then return 'missing' end
  if record.state == 'terminated' then return 'terminated' end
  if record.expiresAt <= now then return 'expired' end
end
local function root(id)
  local digest = redis.call('GET', key('user-id', id))
  if not digest then return nil end
  if string.len(digest) ~= 64 or string.find(digest, '[^a-f0-9]') then return false end
  local record = read(key('user', digest))
  if record and (record.kind ~= 'userSession' or record.userSessionId ~= id) then return false end
  return record, digest
end
local function write(k, record)
  redis.call('SET', k, cjson.encode(record), 'PXAT', record.expiresAt)
end
local function index(k, id, expiresAt)
  redis.call('ZADD', k, expiresAt, id)
  local expiry = redis.call('PEXPIRETIME', k)
  if expiry < expiresAt then redis.call('PEXPIREAT', k, expiresAt) end
end
local function validIndex(k)
  local t = redis.call('TYPE', k).ok
  return t == 'none' or t == 'zset'
end
local function slot(record) return key('slot', record.userSessionId .. ':' .. record.clientId) end

if request.action == 'time' then return reply('time') end

if request.action == 'create' then
  local record = request.record
  record.createdAt, record.authTime, record.expiresAt = now, now, now + request.ttl
  local stateKey, idKey = key('user', request.digest), key('user-id', record.userSessionId)
  local indexKey = key('subject', record.subjectIdentifier)
  local inventoryKey = key('inventory', 'userSession')
  if redis.call('EXISTS', stateKey, idKey) > 0 then return reply('collision') end
  if not validIndex(indexKey) or not validIndex(inventoryKey) then return reply('corrupt') end
  write(stateKey, record)
  redis.call('SET', idKey, request.digest, 'PXAT', record.expiresAt)
  index(indexKey, record.userSessionId, record.expiresAt)
  index(inventoryKey, record.userSessionId, record.expiresAt)
  return reply('created', record)
end

if request.action == 'resolveUser' then
  local record
  if request.digest then
    record = read(key('user', request.digest))
    if record and (record.kind ~= 'userSession' or redis.call('GET', key('user-id', record.userSessionId)) ~= request.digest) then
      return reply('corrupt')
    end
  else record = root(request.id) end
  local failure = unavailable(record)
  if request.neutral and record then return reply('record', record) end
  if failure then return reply(failure) end
  return reply('resolved', record)
end

if request.action == 'open' then
  local parent, candidate = request.parent, request.record
  if parent.expiresAt <= now then return reply('expired') end
  local slotKey = slot(candidate)
  local priorId = redis.call('GET', slotKey)
  local prior
  if priorId then prior = read(key('client', priorId)) end
  if prior == false then return reply('corrupt') end
  if prior and (prior.kind ~= 'clientSession' or prior.clientSessionId ~= priorId
    or prior.userSessionId ~= parent.userSessionId or prior.parentInstance ~= parent.instance
    or prior.clientId ~= candidate.clientId or prior.subjectIdentifier ~= parent.subjectIdentifier
    or prior.subjectContext ~= parent.subjectContext) then return reply('corrupt') end
  local record = candidate
  local status = 'created'
  if prior and not unavailable(prior) then record, status = prior, 'reused' end
  if status == 'created' and redis.call('EXISTS', key('client', record.clientSessionId)) > 0 then return reply('collision') end
  local rootIndex, clientIndex = key('children', parent.userSessionId), key('client-index', record.clientId)
  local inventoryKey = key('inventory', 'clientSession')
  local subjectIndex = key('subject-clients', parent.subjectIdentifier)
  if not validIndex(rootIndex) or not validIndex(clientIndex) or not validIndex(inventoryKey) or not validIndex(subjectIndex) then return reply('corrupt') end
  record.createdAt = status == 'created' and now or record.createdAt
  record.authorizedAt, record.protocol = now, candidate.protocol
  record.expiresAt = math.min(parent.expiresAt, math.max(record.expiresAt, now + request.ttl))
  write(key('client', record.clientSessionId), record)
  redis.call('SET', slotKey, record.clientSessionId, 'PXAT', record.expiresAt)
  index(rootIndex, record.clientSessionId, record.expiresAt)
  index(clientIndex, record.clientSessionId, record.expiresAt)
  index(inventoryKey, record.clientSessionId, record.expiresAt)
  index(subjectIndex, record.clientSessionId, record.expiresAt)
  return reply(status, record)
end

if request.action == 'resolveClient' then
  local record = read(key('client', request.id))
  if record and (record.kind ~= 'clientSession' or record.clientSessionId ~= request.id) then return reply('corrupt') end
  if record and (record.userSessionId ~= request.userSessionId or record.clientId ~= request.clientId) then return reply('mismatch') end
  if request.neutral and record then return reply('record', record) end
  local failure = unavailable(record)
  if failure then return reply(failure) end
  local parent = root(record.userSessionId)
  failure = unavailable(parent)
  if failure then return reply(failure) end
  if parent.instance ~= record.parentInstance or parent.subjectIdentifier ~= record.subjectIdentifier
    or parent.subjectContext ~= record.subjectContext or record.expiresAt > parent.expiresAt then return reply('corrupt') end
  return reply('resolved', {userSession=parent, clientSession=record})
end

if request.action == 'capture' then
  local indexKey = key(request.index, request.id)
  if not validIndex(indexKey) then return reply('corrupt') end
  local ids = redis.call('ZRANGE', indexKey, request.offset, request.offset + request.limit - 1)
  local records = {}
  for _, id in ipairs(ids) do
    local record
    if request.index == 'subject' then record = root(id) else record = read(key('client', id)) end
    if record == false then return reply('corrupt') end
    if record then table.insert(records, record) end
  end
  return reply('captured', {records=records, scanned=#ids, hasMore=request.offset + #ids < redis.call('ZCARD', indexKey)})
end

if request.action == 'list' then
  local indexKey = key('inventory', request.kind)
  if request.subjectIdentifier then indexKey = key(request.kind == 'userSession' and 'subject' or 'subject-clients', request.subjectIdentifier) end
  if not validIndex(indexKey) then return reply('corrupt') end
  local expired = redis.call('ZCOUNT', indexKey, '-inf', now)
  local total = redis.call('ZCARD', indexKey) - expired
  local first = expired + request.offset
  local ids = redis.call('ZRANGE', indexKey, first, first + request.limit - 1)
  local records = {}
  for _, id in ipairs(ids) do
    local record
    if request.kind == 'userSession' then record = root(id) else record = read(key('client', id)) end
    if not record or record.kind ~= request.kind or record.state ~= 'active'
      or (request.subjectIdentifier and record.subjectIdentifier ~= request.subjectIdentifier) then return reply('corrupt') end
    table.insert(records, record)
  end
  return reply('listed', {records=records, total=total})
end

if request.action == 'revoke' then
  local target, record, digest = request.target
  if target.kind == 'userSession' then record, digest = root(target.id)
  else record = read(key('client', target.id)) end
  if record == false then return reply('failed') end
  if not record then return reply('missing') end
  if record.instance ~= target.instance or record.kind ~= target.kind or record.userSessionId ~= target.userSessionId
    or record.subjectIdentifier ~= target.subjectIdentifier
    or (record.kind == 'clientSession' and (record.clientId ~= target.clientId or record.clientSessionId ~= target.id))
    then return reply('replaced') end
  if record.state == 'terminated' then return reply('already_terminated') end
  if record.expiresAt <= now then return reply('expired') end
  record.state = 'terminated'
  -- Authority and its TTL commit before optional index reclamation. No pending/TTL removal.
  if record.kind == 'userSession' then
    write(key('user', digest), record)
    redis.call('PEXPIREAT', key('user-id', record.userSessionId), record.expiresAt)
    redis.pcall('ZREM', key('subject', record.subjectIdentifier), record.userSessionId)
    redis.pcall('ZREM', key('inventory', 'userSession'), record.userSessionId)
  else
    write(key('client', record.clientSessionId), record)
    if redis.pcall('GET', slot(record)) == record.clientSessionId then redis.pcall('DEL', slot(record)) end
    redis.pcall('ZREM', key('children', record.userSessionId), record.clientSessionId)
    redis.pcall('ZREM', key('client-index', record.clientId), record.clientSessionId)
    redis.pcall('ZREM', key('inventory', 'clientSession'), record.clientSessionId)
    redis.pcall('ZREM', key('subject-clients', record.subjectIdentifier), record.clientSessionId)
  end
  return reply('terminated')
end
return reply('corrupt')
`;
