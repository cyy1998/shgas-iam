import type {
  ProviderSessionBinding,
  ProviderSessionBindingLookup,
  ProviderSessionLifecycleFence,
  ProviderSessionPrincipalAnchor,
  ProviderSessionPublicationResult,
  StagedProviderSessionBinding,
} from "./provider-session.ts";
import {
  pendingProviderSessionBindingKey,
  pendingProviderSessionBindingsByClientKey,
  providerSessionBindingLookupKey,
  providerSessionGenerationMembersKey,
  providerSessionPrincipalAnchorKey,
  ProviderSessionPrincipalAnchorSchema,
  StagedProviderSessionBindingSchema,
} from "./provider-session.ts";

export interface ProviderSessionStateRedis {
  get: (key: string) => Promise<string | null>;
  mget: (...keys: string[]) => Promise<Array<string | null>>;
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<unknown>;
  eval: (script: string, keyCount: number, ...args: Array<string | number>) => Promise<unknown>;
  zrangebyscore: (key: string, min: string | number, max: string | number) => Promise<string[]>;
  zremrangebyscore: (key: string, min: string | number, max: string | number) => Promise<number>;
}

export const STAGE_PROVIDER_SESSION_BINDING_SCRIPT = `
-- stage_provider_session_binding
local existing = redis.call("GET", KEYS[1])
if existing then
  local ok, staged = pcall(cjson.decode, existing)
  if not ok or staged.clientCode ~= ARGV[3] then return 0 end
end
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local expiresAt = math.min(tonumber(ARGV[2]), now + 60000)
local staged = cjson.decode(ARGV[1])
staged.expiresAt = math.ceil(expiresAt / 1000)
redis.call("SET", KEYS[1], cjson.encode(staged), "PXAT", expiresAt)
redis.call("ZADD", KEYS[2], expiresAt, KEYS[1])
redis.call("PEXPIREAT", KEYS[2], expiresAt, "NX")
redis.call("PEXPIREAT", KEYS[2], expiresAt, "GT")
return 1
`;

export const CLAIM_STAGED_PROVIDER_SESSION_BINDING_SCRIPT = `
-- claim_staged_provider_session_binding
local serialized = redis.call("GET", KEYS[1])
if not serialized then
  redis.call("ZREM", KEYS[2], KEYS[1])
  return false
end
local ok, staged = pcall(cjson.decode, serialized)
if not ok then
  redis.call("DEL", KEYS[1])
  redis.call("ZREM", KEYS[2], KEYS[1])
  return false
end
if staged.authorizationAttemptId ~= ARGV[1]
  or staged.accountId ~= ARGV[2]
  or staged.clientCode ~= ARGV[3]
  or (staged.providerSessionUid
    and staged.providerSessionUid ~= cjson.null
    and staged.providerSessionUid ~= ARGV[4]) then
  return false
end
redis.call("DEL", KEYS[1])
redis.call("ZREM", KEYS[2], KEYS[1])
return serialized
`;

export const DELETE_OWNED_STAGED_PROVIDER_SESSION_BINDING_SCRIPT = `
-- delete_owned_staged_provider_session_binding
local serialized = redis.call("GET", KEYS[1])
if not serialized then
  if ARGV[2] ~= "" then return 0 end
  redis.call("ZREM", KEYS[2], KEYS[1])
  return 1
end
if ARGV[2] == "" or serialized ~= ARGV[2] then return 0 end
local ok, staged = pcall(cjson.decode, serialized)
if not ok or staged.clientCode ~= ARGV[1] then return 0 end
redis.call("DEL", KEYS[1])
redis.call("ZREM", KEYS[2], KEYS[1])
return 1
`;

export const PUBLISH_PROVIDER_SESSION_REBIND_SCRIPT = `
-- publish_provider_session_rebind
local current = redis.call("GET", KEYS[1])
local currentAnchor = nil
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if not ok then return 0 end
  currentAnchor = decoded
end
local lookup = redis.call("GET", KEYS[2])
local currentLookup = nil
if lookup then
  local ok, decoded = pcall(cjson.decode, lookup)
  if not ok then return 0 end
  currentLookup = decoded
end
if currentAnchor
  and currentAnchor.generation == ARGV[2]
  and currentAnchor.accountId == ARGV[3]
  and currentAnchor.principalSessionId == ARGV[4]
  and currentLookup
  and currentLookup.bindingId == ARGV[5]
  and currentLookup.mappingOwnerId == ARGV[6] then
  redis.call("PEXPIREAT", KEYS[1], ARGV[9], "NX")
redis.call("PEXPIREAT", KEYS[1], ARGV[9], "GT")
  redis.call("SET", KEYS[2], ARGV[8], "PXAT", ARGV[9])
  redis.call("SADD", KEYS[3], ARGV[6])
  redis.call("PEXPIREAT", KEYS[3], ARGV[9], "NX")
redis.call("PEXPIREAT", KEYS[3], ARGV[9], "GT")
  return 2
end
if ARGV[1] == "" then
  if currentAnchor then return 0 end
elseif not currentAnchor or currentAnchor.generation ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[7], "PXAT", ARGV[9])
redis.call("SET", KEYS[2], ARGV[8], "PXAT", ARGV[9])
redis.call("SADD", KEYS[3], ARGV[6])
redis.call("PEXPIREAT", KEYS[3], ARGV[9], "NX")
redis.call("PEXPIREAT", KEYS[3], ARGV[9], "GT")
return 1
`;

export const PUBLISH_PROVIDER_SESSION_CLIENT_BINDING_SCRIPT = `
-- publish_provider_session_client_binding
local current = redis.call("GET", KEYS[1])
if not current then return 0 end
local anchorOk, currentAnchor = pcall(cjson.decode, current)
if not anchorOk then return 0 end
local lookup = redis.call("GET", KEYS[2])
local currentLookup = nil
if lookup then
  local lookupOk, decoded = pcall(cjson.decode, lookup)
  if not lookupOk then return 0 end
  currentLookup = decoded
end
if currentAnchor.generation == ARGV[1]
  and currentAnchor.accountId == ARGV[2]
  and currentAnchor.principalSessionId == ARGV[3]
  and currentLookup
  and currentLookup.bindingId == ARGV[4]
  and currentLookup.mappingOwnerId == ARGV[5] then
  redis.call("PEXPIREAT", KEYS[1], ARGV[10], "NX")
redis.call("PEXPIREAT", KEYS[1], ARGV[10], "GT")
  redis.call("SET", KEYS[2], ARGV[9], "PXAT", ARGV[10])
  redis.call("SADD", KEYS[3], ARGV[5])
  redis.call("PEXPIREAT", KEYS[3], ARGV[10], "NX")
redis.call("PEXPIREAT", KEYS[3], ARGV[10], "GT")
  return 2
end
if currentAnchor.generation ~= ARGV[1]
  or currentAnchor.accountId ~= ARGV[2]
  or currentAnchor.principalSessionId ~= ARGV[3] then
  return 0
end
if ARGV[8] == "0" then
  if currentLookup then return 0 end
elseif not currentLookup
  or currentLookup.bindingId ~= ARGV[6]
  or (currentLookup.mappingOwnerId or "") ~= ARGV[7] then
  return 0
end
redis.call("PEXPIREAT", KEYS[1], ARGV[10], "NX")
redis.call("PEXPIREAT", KEYS[1], ARGV[10], "GT")
redis.call("SET", KEYS[2], ARGV[9], "PXAT", ARGV[10])
redis.call("SADD", KEYS[3], ARGV[5])
redis.call("PEXPIREAT", KEYS[3], ARGV[10], "NX")
redis.call("PEXPIREAT", KEYS[3], ARGV[10], "GT")
return 1
`;

export const CONFIRM_PROVIDER_SESSION_PUBLICATION_SCRIPT = `
-- confirm_provider_session_publication
local anchor = redis.call("GET", KEYS[1])
local lookup = redis.call("GET", KEYS[2])
if not anchor or not lookup then return 0 end
local anchorOk, decodedAnchor = pcall(cjson.decode, anchor)
local lookupOk, decodedLookup = pcall(cjson.decode, lookup)
if not anchorOk or not lookupOk then return 0 end
if decodedAnchor.generation ~= ARGV[1]
  or decodedAnchor.accountId ~= ARGV[2]
  or decodedAnchor.principalSessionId ~= ARGV[3]
  or decodedLookup.bindingId ~= ARGV[4]
  or decodedLookup.mappingOwnerId ~= ARGV[5]
  or redis.call("SISMEMBER", KEYS[3], ARGV[5]) ~= 1 then
  return 0
end
return 1
`;

export const REFRESH_OWNED_PROVIDER_SESSION_BINDING_SCRIPT = `
-- refresh_owned_provider_session_binding
local anchor = redis.call("GET", KEYS[1])
local lookup = redis.call("GET", KEYS[2])
if not anchor or not lookup then return 0 end
local anchorOk, decodedAnchor = pcall(cjson.decode, anchor)
local lookupOk, decodedLookup = pcall(cjson.decode, lookup)
if not anchorOk or not lookupOk then return 0 end
if decodedAnchor.generation ~= ARGV[1]
  or decodedAnchor.accountId ~= ARGV[2]
  or decodedAnchor.principalSessionId ~= ARGV[3]
  or decodedLookup.bindingId ~= ARGV[4]
  or decodedLookup.mappingOwnerId ~= ARGV[5] then
  return 0
end
redis.call("PEXPIREAT", KEYS[1], ARGV[7], "NX")
redis.call("PEXPIREAT", KEYS[1], ARGV[7], "GT")
redis.call("SET", KEYS[2], ARGV[6], "PXAT", ARGV[7])
redis.call("SADD", KEYS[3], ARGV[5])
redis.call("PEXPIREAT", KEYS[3], ARGV[7], "NX")
redis.call("PEXPIREAT", KEYS[3], ARGV[7], "GT")
return 1
`;

export const DELETE_OWNED_PROVIDER_SESSION_BINDING_SCRIPT = `
-- delete_owned_provider_session_binding
local lookup = redis.call("GET", KEYS[1])
local deleted = 0
if lookup then
  local lookupOk, decodedLookup = pcall(cjson.decode, lookup)
  if lookupOk then
    local ownsMapping = false
    if ARGV[1] == "" then
      ownsMapping = not decodedLookup.mappingOwnerId
    else
      ownsMapping = decodedLookup.mappingOwnerId == ARGV[1]
    end
    if ownsMapping then
      deleted = redis.call("DEL", KEYS[1])
    end
  end
end
if ARGV[1] ~= "" and ARGV[2] ~= "" then
  local membersExisted = redis.call("EXISTS", KEYS[3])
  redis.call("SREM", KEYS[3], ARGV[1])
  if membersExisted == 1 and redis.call("SCARD", KEYS[3]) == 0 then
    redis.call("DEL", KEYS[3])
    local anchor = redis.call("GET", KEYS[2])
    if anchor then
      local anchorOk, decodedAnchor = pcall(cjson.decode, anchor)
      if anchorOk and decodedAnchor.generation == ARGV[2] then
        redis.call("DEL", KEYS[2])
        return deleted + 10
      end
    end
  end
end
return deleted
`;

export const DESTROY_PROVIDER_SESSION_SCRIPT = `
-- destroy_provider_session
local anchor = redis.call("GET", KEYS[1])
if not anchor then return 1 end
local anchorOk, decodedAnchor = pcall(cjson.decode, anchor)
if not anchorOk or decodedAnchor.generation ~= ARGV[1] then return 0 end
redis.call("DEL", KEYS[1], KEYS[2])
return 1
`;

export function createProviderSessionStateStore(redis: ProviderSessionStateRedis) {
  async function stage(staged: StagedProviderSessionBinding, expiresAt: number) {
    const parsed = StagedProviderSessionBindingSchema.parse(staged);
    const stagedResult = await redis.eval(
      STAGE_PROVIDER_SESSION_BINDING_SCRIPT,
      2,
      pendingProviderSessionBindingKey(parsed.authorizationAttemptId),
      pendingProviderSessionBindingsByClientKey(parsed.clientCode),
      JSON.stringify(parsed),
      expiresAt,
      parsed.clientCode,
    );
    if (stagedResult !== 1)
      throw new Error("OIDC staged Provider Session binding owner conflicted");
  }

  async function claim(input: {
    accountId: string;
    authorizationAttemptId: string;
    clientCode: string;
    providerSessionUid: string;
  }) {
    const serialized = await redis.eval(
      CLAIM_STAGED_PROVIDER_SESSION_BINDING_SCRIPT,
      2,
      pendingProviderSessionBindingKey(input.authorizationAttemptId),
      pendingProviderSessionBindingsByClientKey(input.clientCode),
      input.authorizationAttemptId,
      input.accountId,
      input.clientCode,
      input.providerSessionUid,
    );
    return typeof serialized === "string"
      ? parseJson(serialized, StagedProviderSessionBindingSchema)
      : null;
  }

  async function readAnchor(sessionUid: string) {
    return parseJson(
      await redis.get(providerSessionPrincipalAnchorKey(sessionUid)),
      ProviderSessionPrincipalAnchorSchema,
    );
  }

  async function readStaged(authorizationAttemptId: string) {
    return parseJson(
      await redis.get(pendingProviderSessionBindingKey(authorizationAttemptId)),
      StagedProviderSessionBindingSchema,
    );
  }

  async function inventoryClientStagedBindings(clientCode: string) {
    const indexKey = pendingProviderSessionBindingsByClientKey(clientCode);
    const keys = await redis.zrangebyscore(indexKey, "-inf", "+inf");
    const payloads = keys.length === 0 ? [] : await redis.mget(...keys);
    let invalid = 0;
    let stale = 0;
    let bindings = 0;
    for (let index = 0; index < keys.length; index += 1) {
      const serialized = payloads[index];
      if (serialized === null || serialized === undefined) {
        stale += 1;
        continue;
      }
      const parsed = parseJson(serialized, StagedProviderSessionBindingSchema);
      if (!parsed || parsed.clientCode !== clientCode) {
        invalid += 1;
        continue;
      }
      bindings += 1;
    }
    return {
      clientCode,
      counts: {
        bindings,
        invalid,
        stale,
        total: bindings + invalid + stale,
      },
    };
  }

  async function revokeClientStagedBindings(clientCode: string) {
    const indexKey = pendingProviderSessionBindingsByClientKey(clientCode);
    const keys = await redis.zrangebyscore(indexKey, "-inf", "+inf");
    const payloads = keys.length === 0 ? [] : await redis.mget(...keys);
    for (let index = 0; index < keys.length; index += 1) {
      const removed = await redis.eval(
        DELETE_OWNED_STAGED_PROVIDER_SESSION_BINDING_SCRIPT,
        2,
        keys[index]!,
        indexKey,
        clientCode,
        payloads[index] ?? "",
      );
      if (removed !== 1)
        throw new Error("OIDC staged Provider Session binding inventory contains invalid records");
    }
  }

  async function readLookup(sessionUid: string, clientCode: string) {
    const serialized = await redis.get(providerSessionBindingLookupKey(sessionUid, clientCode));
    if (!serialized)
      return { exists: false as const, value: null };
    const parsed = parseBindingLookup(serialized);
    return parsed
      ? { exists: true as const, value: parsed }
      : { exists: true as const, value: null };
  }

  async function publishRebind(input: {
    attemptId: string;
    binding: ProviderSessionBinding;
    expectedAnchorGeneration: string | null;
    providerSessionUid: string;
    expiresAt: number;
  }): Promise<ProviderSessionPublicationResult> {
    const anchor = createAnchor(input.binding, input.attemptId);
    const mappingOwnerId = requireMappingOwner(input.binding);
    const args = [
      input.expectedAnchorGeneration ?? "",
      anchor.generation,
      anchor.accountId,
      anchor.principalSessionId,
      input.binding.bindingId,
      mappingOwnerId,
      JSON.stringify(anchor),
      JSON.stringify(toLookup(input.binding)),
      input.expiresAt,
    ] as Array<string | number>;
    return await publishWithRecovery({
      script: PUBLISH_PROVIDER_SESSION_REBIND_SCRIPT,
      keys: publicationKeys(input.providerSessionUid, input.binding.clientCode, anchor.generation),
      args,
      confirmation: {
        anchor,
        binding: input.binding,
        providerSessionUid: input.providerSessionUid,
      },
    });
  }

  async function publishClientBinding(input: {
    anchor: ProviderSessionPrincipalAnchor;
    binding: ProviderSessionBinding;
    expectedLookup: ProviderSessionBindingLookup | null;
    providerSessionUid: string;
    expiresAt: number;
  }): Promise<ProviderSessionPublicationResult> {
    const anchor = createAnchor(input.binding, input.anchor.generation);
    const mappingOwnerId = requireMappingOwner(input.binding);
    const args = [
      input.anchor.generation,
      anchor.accountId,
      anchor.principalSessionId,
      input.binding.bindingId,
      mappingOwnerId,
      input.expectedLookup?.bindingId ?? "",
      input.expectedLookup?.mappingOwnerId ?? "",
      input.expectedLookup ? "1" : "0",
      JSON.stringify(toLookup(input.binding)),
      input.expiresAt,
    ] as Array<string | number>;
    return await publishWithRecovery({
      script: PUBLISH_PROVIDER_SESSION_CLIENT_BINDING_SCRIPT,
      keys: publicationKeys(input.providerSessionUid, input.binding.clientCode, anchor.generation),
      args,
      confirmation: {
        anchor,
        binding: input.binding,
        providerSessionUid: input.providerSessionUid,
      },
    });
  }

  async function refresh(input: {
    binding: ProviderSessionBinding;
    providerSessionUid: string;
    expiresAt: number;
  }) {
    if (!input.binding.anchorGeneration || !input.binding.mappingOwnerId)
      return false;
    const refreshed = await redis.eval(
      REFRESH_OWNED_PROVIDER_SESSION_BINDING_SCRIPT,
      3,
      ...publicationKeys(
        input.providerSessionUid,
        input.binding.clientCode,
        input.binding.anchorGeneration,
      ),
      input.binding.anchorGeneration,
      input.binding.accountId,
      input.binding.principalSessionId,
      input.binding.bindingId,
      input.binding.mappingOwnerId,
      JSON.stringify(toLookup(input.binding)),
      input.expiresAt,
    );
    return refreshed === 1;
  }

  async function deleteOwned(input: {
    anchorGeneration?: string;
    clientCode: string;
    mappingOwnerId?: string;
    providerSessionUid: string;
  }) {
    return await deleteOwnedProviderSessionBinding(redis, input);
  }

  async function destroyProviderSession(
    providerSessionUid: string,
    expected?: Partial<ProviderSessionLifecycleFence>,
  ) {
    if (!expected?.generation || !expected.principalSessionId) {
      // Legacy artifacts cannot prove ownership. The bounded anchor/member TTLs, or a later
      // Session payload carrying both mirrors, provide safe eventual cleanup.
      return true;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const anchor = await readAnchor(providerSessionUid);
      if (!anchor) {
        await redis.del(providerSessionPrincipalAnchorKey(providerSessionUid));
        return true;
      }
      if (anchor.generation !== expected.generation
        || anchor.principalSessionId !== expected.principalSessionId) {
        return true;
      }
      const destroyed = await redis.eval(
        DESTROY_PROVIDER_SESSION_SCRIPT,
        2,
        providerSessionPrincipalAnchorKey(providerSessionUid),
        providerSessionGenerationMembersKey(providerSessionUid, anchor.generation),
        anchor.generation,
      );
      if (destroyed === 1)
        return true;
    }
    return false;
  }

  async function publishWithRecovery(input: {
    script: string;
    keys: [string, string, string];
    args: Array<string | number>;
    confirmation: {
      anchor: ProviderSessionPrincipalAnchor;
      binding: ProviderSessionBinding;
      providerSessionUid: string;
    };
  }): Promise<ProviderSessionPublicationResult> {
    try {
      return classifyPublication(await redis.eval(input.script, 3, ...input.keys, ...input.args), false);
    }
    catch (firstError) {
      try {
        if (await confirm(input.confirmation))
          return { status: "committed", recovered: true };
      }
      catch {
        // Retry below with the same generation and mapping owner; both scripts are idempotent.
      }
      try {
        return classifyPublication(await redis.eval(input.script, 3, ...input.keys, ...input.args), true);
      }
      catch (retryError) {
        try {
          return await confirm(input.confirmation)
            ? { status: "committed", recovered: true }
            : { status: "unknown", error: retryError };
        }
        catch {
          return { status: "unknown", error: firstError };
        }
      }
    }
  }

  async function confirm(input: {
    anchor: ProviderSessionPrincipalAnchor;
    binding: ProviderSessionBinding;
    providerSessionUid: string;
  }) {
    const mappingOwnerId = requireMappingOwner(input.binding);
    const confirmed = await redis.eval(
      CONFIRM_PROVIDER_SESSION_PUBLICATION_SCRIPT,
      3,
      providerSessionPrincipalAnchorKey(input.providerSessionUid),
      providerSessionBindingLookupKey(input.providerSessionUid, input.binding.clientCode),
      providerSessionGenerationMembersKey(input.providerSessionUid, input.anchor.generation),
      input.anchor.generation,
      input.anchor.accountId,
      input.anchor.principalSessionId,
      input.binding.bindingId,
      mappingOwnerId,
    );
    return confirmed === 1;
  }

  return {
    claim,
    deleteOwned,
    destroyProviderSession,
    inventoryClientStagedBindings,
    publishClientBinding,
    publishRebind,
    readAnchor,
    readLookup,
    readStaged,
    revokeClientStagedBindings,
    refresh,
    stage,
  };
}

function createAnchor(
  binding: ProviderSessionBinding,
  generation: string,
): ProviderSessionPrincipalAnchor {
  return {
    accountId: binding.accountId,
    principalSessionId: binding.principalSessionId,
    generation,
  };
}

function publicationKeys(
  sessionUid: string,
  clientCode: string,
  generation: string,
): [string, string, string] {
  return [
    providerSessionPrincipalAnchorKey(sessionUid),
    providerSessionBindingLookupKey(sessionUid, clientCode),
    providerSessionGenerationMembersKey(sessionUid, generation),
  ];
}

function requireMappingOwner(binding: ProviderSessionBinding) {
  if (!binding.mappingOwnerId)
    throw new Error("OIDC provider session binding mapping owner is unavailable");
  return binding.mappingOwnerId;
}

function toLookup(binding: ProviderSessionBinding): ProviderSessionBindingLookup {
  return {
    bindingId: binding.bindingId,
    ...(binding.mappingOwnerId ? { mappingOwnerId: binding.mappingOwnerId } : {}),
  };
}

function parseBindingLookup(serialized: string): ProviderSessionBindingLookup | null {
  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (typeof value.bindingId !== "string" || !value.bindingId)
      return null;
    if (value.mappingOwnerId !== undefined
      && (typeof value.mappingOwnerId !== "string" || !value.mappingOwnerId)) {
      return null;
    }
    return {
      bindingId: value.bindingId,
      ...(typeof value.mappingOwnerId === "string" ? { mappingOwnerId: value.mappingOwnerId } : {}),
    };
  }
  catch {
    return null;
  }
}

function parseJson<T>(
  serialized: string | null,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
) {
  if (!serialized)
    return null;
  try {
    const parsed = schema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data ?? null : null;
  }
  catch {
    return null;
  }
}

function classifyPublication(value: unknown, recovered: boolean): ProviderSessionPublicationResult {
  return value === 1 || value === 2
    ? { status: "committed", recovered }
    : { status: "conflict", recovered };
}

export type ProviderSessionStateStore = ReturnType<typeof createProviderSessionStateStore>;

export async function deleteOwnedProviderSessionBinding(
  redis: Pick<ProviderSessionStateRedis, "eval">,
  input: {
    anchorGeneration?: string;
    clientCode: string;
    mappingOwnerId?: string;
    providerSessionUid: string;
  },
) {
  return await redis.eval(
    DELETE_OWNED_PROVIDER_SESSION_BINDING_SCRIPT,
    3,
    providerSessionBindingLookupKey(input.providerSessionUid, input.clientCode),
    providerSessionPrincipalAnchorKey(input.providerSessionUid),
    providerSessionGenerationMembersKey(
      input.providerSessionUid,
      input.anchorGeneration ?? "legacy",
    ),
    input.mappingOwnerId ?? "",
    input.anchorGeneration ?? "",
  );
}
