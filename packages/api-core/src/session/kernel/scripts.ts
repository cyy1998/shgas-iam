export const SESSION_KERNEL_CREATE_CREDENTIAL_SCRIPT = `
-- session-kernel-create-credential-v1
if redis.call("EXISTS", KEYS[1]) == 1 then
  return "active_identity_conflict"
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return "identity_tombstoned"
end
if redis.call("EXISTS", KEYS[3]) == 1 then
  return "lookup_owned"
end
if redis.call("EXISTS", KEYS[4]) == 1 then
  return "lookup_tombstoned"
end

redis.call("SET", KEYS[1], ARGV[1], "PXAT", ARGV[3])
redis.call("SET", KEYS[3], ARGV[2], "PXAT", ARGV[3])
for index = 5, #KEYS do
  local argumentOffset = 4 + ((index - 5) * 2)
  redis.call("ZADD", KEYS[index], ARGV[argumentOffset], ARGV[argumentOffset + 1])
end
return "created"
`;
