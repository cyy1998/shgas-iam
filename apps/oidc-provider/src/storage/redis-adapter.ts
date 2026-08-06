import type { Redis } from "ioredis";
import type { Adapter, AdapterPayload } from "oidc-provider";
import type { ProviderSessionLifecycleFence } from "../session/provider-session.ts";
import type {
  AdapterClaimsSnapshotIssuer,
  AdapterClientRuntimeReader,
  AdapterClientVersionReader,
  AdapterOidcSessionKernel,
  AdapterProviderSessionBindingStore,
  AdapterTokenRegistry,
} from "./redis-adapter.port.ts";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
import { OidcScopesSchema } from "../provider/claims-snapshot.ts";

export interface RedisOidcAdapterDeps {
  claims: AdapterClaimsSnapshotIssuer;
  clientVersions: AdapterClientVersionReader;
  oidcSession: AdapterOidcSessionKernel;
  providerSessions: AdapterProviderSessionBindingStore;
  tokens: AdapterTokenRegistry;
}

const GRANTABLE_MODELS = new Set([
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "DeviceCode",
  "BackchannelAuthenticationRequest",
]);

const ATOMIC_CONSUME_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then return 0 end
local ttl = redis.call("PTTL", KEYS[1])
if ttl <= 0 then return 0 end
local stored = redis.call("SET", KEYS[2], ARGV[1], "PX", ttl, "NX")
if not stored then return -1 end
return 1
`;

const DELETE_OWNED_SESSION_ARTIFACT_SCRIPT = `
-- delete_owned_session_artifact
local owner = redis.call("GET", KEYS[3])
redis.call("DEL", KEYS[1], KEYS[2])
if owner == ARGV[1] then
  return redis.call("DEL", KEYS[3])
end
return 0
`;

function artifactKey(model: string, id: string) {
  return `oidc:model:${model}:${id}`;
}

function consumedKey(model: string, id: string) {
  return `oidc:consumed:${model}:${id}`;
}

function grantIndexKey(grantId: string) {
  return `oidc:grant-objects:${grantId}`;
}

function clientObjectIndexKey(clientId: string) {
  return `oidc:client-objects:${clientId}`;
}

function sessionUidKey(uid: string) {
  return `oidc:session-uid:${uid}`;
}

function userCodeKey(userCode: string) {
  return `oidc:user-code:${userCode}`;
}

function payloadClientId(payload: AdapterPayload) {
  if (typeof payload.params?.client_id === "string")
    return payload.params.client_id;
  if (typeof payload.clientId === "string")
    return payload.clientId;
  if (typeof payload.cid === "string")
    return payload.cid;
  return undefined;
}

function payloadClientIds(payload: AdapterPayload) {
  const ids = new Set<string>();
  const single = payloadClientId(payload);
  if (single)
    ids.add(single);
  for (const clientId of Object.keys(payload.authorizations ?? {}))
    ids.add(clientId);
  return [...ids];
}

function payloadSessionUid(payload: AdapterPayload) {
  return typeof payload.sessionUid === "string" ? payload.sessionUid : undefined;
}

function payloadAccountId(payload: AdapterPayload) {
  return typeof payload.accountId === "string" ? payload.accountId : undefined;
}

function payloadString(payload: AdapterPayload, key: string) {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

export class RedisOidcAdapter implements Adapter {
  constructor(
    private readonly model: string,
    private readonly redis: Redis,
    private readonly deps: RedisOidcAdapterDeps,
  ) {}

  private async readOrConsumeProviderSessionBinding(accountId: string, sessionUid: string, clientId: string) {
    const existing = await this.deps.providerSessions.read(sessionUid, clientId);
    return existing?.accountId === accountId && existing.clientCode === clientId
      ? existing
      : null;
  }

  private async resolveAuthorizationCodeBinding(
    payload: AdapterPayload,
    oidcConfigVersion: number | undefined,
  ) {
    const sessionUid = payloadSessionUid(payload);
    const accountId = payloadAccountId(payload);
    const clientId = payloadClientId(payload);
    if (!sessionUid || !accountId || !clientId || oidcConfigVersion === undefined)
      return null;

    const authorizationAttemptId = payloadString(payload, "authorizationAttemptId");
    if (authorizationAttemptId) {
      const staged = await this.deps.providerSessions.consumeStaged({
        accountId,
        authorizationAttemptId,
        clientCode: clientId,
        providerSessionUid: sessionUid,
      });
      return staged?.accountId === accountId
        && staged.clientCode === clientId
        && staged.oidcConfigVersion === oidcConfigVersion
        ? staged
        : null;
    }
    const anchor = await this.deps.providerSessions.readPrincipalAnchor(sessionUid, accountId);
    if (!anchor)
      return null;
    const ensured = await this.deps.providerSessions.ensureClientBinding({
      accountId,
      anchorGeneration: anchor.generation,
      clientCode: clientId,
      oidcConfigVersion,
      principalSessionId: anchor.principalSessionId,
      providerSessionUid: sessionUid,
    });
    return ensured?.accountId === accountId
      && ensured.clientCode === clientId
      && ensured.oidcConfigVersion === oidcConfigVersion
      && ensured.principalSessionId === anchor.principalSessionId
      ? ensured
      : null;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
    const key = artifactKey(this.model, id);
    const expiresAt = Date.now() + expiresIn * 1000;
    const clientIds = payloadClientIds(payload);
    const oidcConfigVersions = Object.fromEntries(await Promise.all(clientIds.map(async (clientId) => {
      const version = await this.deps.clientVersions.findActiveVersion(clientId);
      if (version === null)
        throw new Error("OIDC client is not available");
      return [clientId, version] as const;
    })));
    const clientId = payloadClientId(payload);
    const oidcConfigVersion = clientId ? oidcConfigVersions[clientId] : undefined;
    const protocolAccountId = payloadAccountId(payload);
    const protocolSessionUid = payloadSessionUid(payload);

    const sessionBinding = this.model === "AuthorizationCode"
      ? await this.resolveAuthorizationCodeBinding(payload, oidcConfigVersion)
      : null;
    const accessTokenBinding = this.model === "AccessToken"
      && clientId
      && protocolAccountId
      && protocolSessionUid
      ? await this.readOrConsumeProviderSessionBinding(
          protocolAccountId,
          protocolSessionUid,
          clientId,
        )
      : null;
    const sessionAccountId = payloadAccountId(payload);
    const providerSessionUid = typeof payload.uid === "string" ? payload.uid : undefined;
    const sessionPrincipalAnchor = this.model === "Session" && sessionAccountId && providerSessionUid
      ? await this.deps.providerSessions.readPrincipalAnchor(providerSessionUid, sessionAccountId)
      : null;
    const sessionBindings = this.model === "Session"
      && sessionAccountId
      && providerSessionUid
      && !sessionPrincipalAnchor
      ? await Promise.all(clientIds.map(clientCode => this.readOrConsumeProviderSessionBinding(
          sessionAccountId,
          providerSessionUid,
          clientCode,
        )))
      : [];
    if (this.model === "Session" && sessionAccountId && providerSessionUid && !sessionPrincipalAnchor) {
      const principalSessionIds = new Set(sessionBindings.flatMap(binding => binding
        ? [binding.principalSessionId]
        : []));
      if (typeof payload.kernelPrincipalSessionId === "string")
        principalSessionIds.add(payload.kernelPrincipalSessionId);
      if (principalSessionIds.size > 1)
        throw new Error("OIDC provider session principal binding is inconsistent");
    }
    const sessionPrincipalSessionId = sessionPrincipalAnchor?.principalSessionId
      ?? (typeof payload.kernelPrincipalSessionId === "string"
        ? payload.kernelPrincipalSessionId
        : sessionBindings.find(binding => binding)?.principalSessionId);
    const sessionAnchorGeneration = sessionPrincipalAnchor?.generation
      ?? sessionBindings.find(binding => binding)?.anchorGeneration
      ?? payloadString(payload, "providerSessionAnchorGeneration");
    if (this.model === "AuthorizationCode"
      && (!clientId
        || !sessionBinding
        || typeof payload.accountId !== "string"
        || typeof payload.sessionUid !== "string"
        || typeof oidcConfigVersion !== "number")) {
      throw new Error("OIDC authorization code provider-session binding is unavailable");
    }
    const claimsSnapshotScopes = this.model === "AuthorizationCode"
      ? parseAuthorizationCodeScopes(payload)
      : undefined;
    const claimsSnapshot = this.model === "AuthorizationCode"
      && clientId
      && sessionBinding
      && claimsSnapshotScopes
      && typeof payload.accountId === "string"
      && typeof payload.sessionUid === "string"
      && typeof oidcConfigVersion === "number"
      ? await this.deps.claims.createAuthorizationCodeSnapshot({
          subjectIdentifier: payload.accountId,
          clientId,
          scopes: claimsSnapshotScopes,
          oidcConfigVersion,
          providerSessionUid: payload.sessionUid,
          principalSessionId: sessionBinding.principalSessionId,
          providerSessionBindingId: sessionBinding.bindingId,
        })
      : undefined;
    const artifactPayload: AdapterPayload = {
      ...payload,
      ...(claimsSnapshot ? { claimsSnapshot } : {}),
    };
    const tokenKey = key;
    const issuedCredential = this.model === "AccessToken"
      ? await this.deps.oidcSession.registerAccessTokenCredential({
          providerTokenId: id,
          providerTokenKey: tokenKey,
          payload: artifactPayload,
          expiresIn,
          binding: accessTokenBinding,
        })
      : null;
    if (this.model === "AccessToken" && !issuedCredential)
      throw new Error("OIDC access token Kernel credential registration failed");
    if (this.model === "AuthorizationCode") {
      const registered = await this.deps.oidcSession.registerAuthorizationCodeArtifact({
        providerCodeId: id,
        payload: artifactPayload,
        expiresIn,
        binding: sessionBinding,
      });
      if (!registered)
        throw new Error("OIDC authorization code Kernel artifact registration failed");
    }
    const stored: AdapterPayload = {
      ...artifactPayload,
      ...(this.model === "Session" && sessionPrincipalSessionId ? { kernelPrincipalSessionId: sessionPrincipalSessionId } : {}),
      ...(this.model === "Session" && sessionAnchorGeneration ? { providerSessionAnchorGeneration: sessionAnchorGeneration } : {}),
      ...(clientId ? { clientId, oidcConfigVersion: oidcConfigVersions[clientId] } : {}),
      ...(clientIds.length ? { oidcConfigVersions } : {}),
      ...(sessionBinding ? { globalSessionExpiresAt: sessionBinding.expiresAt } : {}),
      ...(issuedCredential
        ? {
            kernelCredentialId: issuedCredential.credentialId,
            extra: {
              ...(payload.extra ?? {}),
              kernelCredentialId: issuedCredential.credentialId,
            },
          }
        : {}),
    };
    const transaction = this.redis.multi().set(key, JSON.stringify(stored), "EX", expiresIn);

    if (this.model === "Session" && payload.uid)
      transaction.set(sessionUidKey(payload.uid), id, "EX", expiresIn);
    if (payload.userCode)
      transaction.set(userCodeKey(payload.userCode), id, "EX", expiresIn);
    if (GRANTABLE_MODELS.has(this.model) && payload.grantId) {
      transaction.zadd(grantIndexKey(payload.grantId), expiresAt, key);
      transaction.expire(grantIndexKey(payload.grantId), expiresIn);
    }
    for (const indexedClientId of clientIds) {
      transaction.zadd(clientObjectIndexKey(indexedClientId), expiresAt, key);
      transaction.expire(clientObjectIndexKey(indexedClientId), expiresIn);
    }
    await transaction.exec();
  }

  async find(id: string) {
    const resolvedCredential = this.model === "AccessToken"
      ? await this.deps.oidcSession.resolveAccessTokenCredential(id)
      : null;
    if (this.model === "AccessToken" && !resolvedCredential)
      return undefined;

    const key = resolvedCredential?.metadata.providerTokenKey ?? artifactKey(this.model, id);
    const [value, consumed] = await this.redis.mget(key, consumedKey(this.model, id));
    if (!value)
      return undefined;

    const payload = JSON.parse(value) as AdapterPayload & {
      oidcConfigVersion?: number;
      oidcConfigVersions?: Record<string, number>;
    };
    for (const clientId of payloadClientIds(payload)) {
      const expectedVersion = payload.oidcConfigVersions?.[clientId] ?? payload.oidcConfigVersion;
      const currentVersion = await this.deps.clientVersions.findActiveVersion(clientId);
      if (currentVersion === null || currentVersion !== expectedVersion) {
        await this.redis.del(key, consumedKey(this.model, id));
        return undefined;
      }
    }
    if (consumed)
      payload.consumed = Number(consumed);
    if (resolvedCredential) {
      const credentialId = readKernelCredentialId(value);
      if (credentialId !== resolvedCredential.credential.credentialId)
        return undefined;
    }
    return payload;
  }

  async findByUid(uid: string) {
    const id = await this.redis.get(sessionUidKey(uid));
    return id ? await this.find(id) : undefined;
  }

  async findByUserCode(userCode: string) {
    const id = await this.redis.get(userCodeKey(userCode));
    return id ? await this.find(id) : undefined;
  }

  async consume(id: string) {
    const result = await this.redis.eval(
      ATOMIC_CONSUME_SCRIPT,
      2,
      artifactKey(this.model, id),
      consumedKey(this.model, id),
      String(Math.floor(Date.now() / 1000)),
    );
    if (result === -1)
      throw new Error(`${this.model} has already been consumed`);
    if (result === 1 && this.model === "AuthorizationCode") {
      const consumed = await this.deps.oidcSession.consumeAuthorizationCodeArtifact(id);
      if (!consumed)
        throw new Error("OIDC authorization code Kernel artifact consume failed");
    }
  }

  async destroy(id: string) {
    const key = artifactKey(this.model, id);
    if (this.model === "AccessToken") {
      const serialized = await this.redis.get(key);
      const credentialId = readKernelCredentialId(serialized);
      if (credentialId)
        await this.deps.oidcSession.revokeAccessTokenCredential(credentialId);
      await this.deps.tokens.revokeAccessToken(key);
    }
    else {
      const providerSession = this.model === "Session"
        ? readProviderSessionReference(await this.redis.get(key))
        : null;
      if (providerSession) {
        const destroyed = await this.deps.providerSessions.destroyProviderSession(
          providerSession.uid,
          providerSession.lifecycleFence,
        );
        if (!destroyed)
          throw new Error("OIDC Provider Session anchor destroy conflicted");
      }
      if (providerSession) {
        await this.redis.eval(
          DELETE_OWNED_SESSION_ARTIFACT_SCRIPT,
          3,
          key,
          consumedKey(this.model, id),
          sessionUidKey(providerSession.uid),
          id,
        );
      }
      else {
        await this.redis.del(key, consumedKey(this.model, id));
      }
    }
  }

  async revokeByGrantId(grantId: string) {
    const indexKey = grantIndexKey(grantId);
    await this.redis.zremrangebyscore(indexKey, "-inf", Date.now());
    const keys = await this.redis.zrange(indexKey, 0, -1);
    const accessTokenKeys = keys.filter(key => key.includes(":AccessToken:"));
    const otherKeys = keys.filter(key => !key.includes(":AccessToken:"));
    await Promise.all(accessTokenKeys.map(async key => await this.deps.tokens.revokeAccessToken(key)));
    if (otherKeys.length)
      await this.redis.del(...otherKeys, ...otherKeys.map(key => key.replace("oidc:model:", "oidc:consumed:")));
    await this.redis.del(indexKey);
  }
}

function parseAuthorizationCodeScopes(payload: AdapterPayload) {
  const normalized = normalizeOidcProtocolScopes(payload);
  const parsed = OidcScopesSchema.safeParse(normalized);
  if (!parsed.success)
    throw new Error("OIDC authorization code scopes are invalid");
  return parsed.data;
}

class DynamicClientAdapter implements Adapter {
  constructor(private readonly clients: AdapterClientRuntimeReader) {}

  async find(id: string) {
    return await this.clients.findRuntime(id) ?? undefined;
  }

  async upsert() {}
  async findByUserCode() {}
  async findByUid() {}
  async consume() {}
  async destroy() {}
  async revokeByGrantId() {}
}

export interface CreateOidcAdapterFactoryDeps extends RedisOidcAdapterDeps {
  clients: AdapterClientRuntimeReader;
}

export function createOidcAdapterFactory(redis: Redis, deps: CreateOidcAdapterFactoryDeps) {
  return (model: string): Adapter => model === "Client"
    ? new DynamicClientAdapter(deps.clients)
    : new RedisOidcAdapter(model, redis, deps);
}

export function createOidcProtocolObjectStore(
  redis: Redis,
  tokens: AdapterTokenRegistry,
  oidcSession?: Pick<AdapterOidcSessionKernel, "revokeClientProtocol">,
) {
  return {
    revokeClient(clientId: string) {
      return revokeClientProtocolObjects(redis, tokens, clientId, oidcSession);
    },
  };
}

export type OidcProtocolObjectStore = ReturnType<typeof createOidcProtocolObjectStore>;

export async function revokeClientProtocolObjects(
  redis: Redis,
  tokens: AdapterTokenRegistry,
  clientId: string,
  oidcSession?: Pick<AdapterOidcSessionKernel, "revokeClientProtocol">,
) {
  await oidcSession?.revokeClientProtocol(clientId, "client_config_changed");
  const indexKey = clientObjectIndexKey(clientId);
  await redis.zremrangebyscore(indexKey, "-inf", Date.now());
  const keys = await redis.zrange(indexKey, 0, -1);
  const accessTokenKeys = keys.filter(key => key.includes(":AccessToken:"));
  const otherKeys = keys.filter(key => !key.includes(":AccessToken:"));
  await Promise.all(accessTokenKeys.map(async key => await tokens.revokeAccessToken(key)));
  if (otherKeys.length)
    await redis.del(...otherKeys, ...otherKeys.map(key => key.replace("oidc:model:", "oidc:consumed:")));
  await redis.del(indexKey);
}

function readKernelCredentialId(serialized: string | null) {
  if (!serialized)
    return null;
  try {
    const payload = JSON.parse(serialized) as {
      kernelCredentialId?: unknown;
      extra?: { kernelCredentialId?: unknown };
    };
    const credentialId = payload.kernelCredentialId ?? payload.extra?.kernelCredentialId;
    return typeof credentialId === "string" ? credentialId : null;
  }
  catch {
    return null;
  }
}

function readProviderSessionReference(serialized: string | null) {
  if (!serialized)
    return null;
  try {
    const payload = JSON.parse(serialized) as {
      kernelPrincipalSessionId?: unknown;
      providerSessionAnchorGeneration?: unknown;
      uid?: unknown;
    };
    if (typeof payload.uid !== "string" || !payload.uid)
      return null;
    let lifecycleFence: ProviderSessionLifecycleFence | null = null;
    if (typeof payload.providerSessionAnchorGeneration === "string"
      && typeof payload.kernelPrincipalSessionId === "string") {
      lifecycleFence = {
        generation: payload.providerSessionAnchorGeneration,
        principalSessionId: payload.kernelPrincipalSessionId,
      };
    }
    return {
      uid: payload.uid,
      ...(lifecycleFence ? { lifecycleFence } : {}),
    };
  }
  catch {
    return null;
  }
}
