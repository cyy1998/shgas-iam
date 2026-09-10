import type { CleanupAdapter, SessionKernelLogger } from "./cleanup/cleanup";
import type { SessionKernelConfig, SessionKernelConfigInput } from "./config";
import type { KernelTokenKind } from "./security/token";
import type {
  CleanupRef,
  ClientBinding,
  IssuedCredential,
  LifecycleObject,
  LifecycleObjectKind,
  PrincipalRef,
  PrincipalSession,
  ProtocolArtifact,
  RenewalPolicy,
  RevocationReason,
  RevokedTombstone,
  RevokeSummary,
  SessionOrigin,
} from "./state/model";
import type { CreateResult, ResolveResult } from "./state/result";
import type { DirectStateTransitions } from "./storage/direct-state-transitions";
import type { SessionKernelObservation } from "./storage/observation";
import type {
  SessionKernelRedis,
  SessionKernelRevocationTransitions,
  StoreIndexWrite,
} from "./storage/store";
import { randomUUID } from "node:crypto";
import { runCleanupRefs } from "./cleanup/cleanup";
import { normalizeSessionKernelConfig } from "./config";
import { SessionKernelLogEvent } from "./log-events";
import { tokenDigest } from "./security/digest";
import { generateKernelToken } from "./security/token";
import { normalizeSessionOrigin, PrincipalRefSchema } from "./state/model";
import { counterForKind, createEmptyRevokeSummary, failClosed, mergeRevokeSummary } from "./state/result";
import {
  calculateRenewedPrincipalSessionWindow,
  calculateTombstoneExpiresAt,
  canRenewWithPrincipal,
  clampDerivedExpiresAt,
  createPrincipalSessionWindow,
} from "./state/time";
import { createRedisDirectStateTransitions } from "./storage/direct-state-transitions";
import { createSessionKernelKeyBuilder, encodeIndexMember, parseIndexMember } from "./storage/keys";
import { createRedisSessionKernelObservation } from "./storage/observation";
import { createRedisSessionKernelRevocationTransitions } from "./storage/revocation-transitions";
import { SessionKernelStore } from "./storage/store";

type ProtocolValidationTarget = ClientBinding | IssuedCredential | ProtocolArtifact;

const observations = new WeakMap<object, { serialized: string; observedAt: number }>();

const PRINCIPAL_SESSION_INVENTORY_CHUNK_SIZE = 100;

export type ProtocolPurpose = { protocol: string; clientCode?: string };
export type CredentialPurpose = ProtocolPurpose & { credentialType: string };
export type ArtifactPurpose = ProtocolPurpose & { artifactType: string };

/** Only explicit bulk commands receive this projection; online reads never invoke it. */
export type ClientProtocolRevocationSelector = {
  readonly metadataFields: readonly string[];
  readonly select: (object: {
    readonly kind: Exclude<LifecycleObjectKind, "principal_session">;
    readonly metadata: Readonly<Record<string, unknown>>;
  }) => "select" | "retain" | "unconfirmed";
};

export type SessionKernelDependencies = {
  redis: SessionKernelRedis;
  config: SessionKernelConfigInput | SessionKernelConfig;
  random?: {
    uuid: () => string;
  };
  cleanupAdapters?: CleanupAdapter[];
  logger?: SessionKernelLogger;
  sourceApp?: string;
};

export type PrincipalSessionContext = {
  subjectContext: string;
};

export type PrincipalAuthenticationContext = {
  sessionKind?: string;
  amr?: readonly string[];
  acr?: string;
  origin?: SessionOrigin;
  tenantId?: string;
  issuerId?: string;
};

export type CreateClientBindingInput = {
  principalSessionId: string;
  protocol: string;
  clientCode: string;
  renewalPolicy?: RenewalPolicy;
  ttlMs?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  cleanupRefs?: CleanupRef[];
};

export type IssueCredentialInput = {
  credentialId?: string;
  principalSessionId: string;
  bindingId?: string;
  protocol: string;
  clientCode: string;
  credentialType: string;
  renewalPolicy?: RenewalPolicy;
  ttlMs?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  cleanupRefs?: CleanupRef[];
  externalToken?: string;
  tokenKind?: Extract<KernelTokenKind, "credential" | "authCode" | "localSession" | "oidcReturnHandle">;
};

export type CreateProtocolArtifactInput = {
  artifactId?: string;
  principalSessionId?: string;
  bindingId?: string;
  protocol: string;
  clientCode?: string;
  artifactType: string;
  ttlMs: number;
  metadata?: Record<string, unknown>;
  cleanupRefs?: CleanupRef[];
  externalToken?: string;
  tokenKind?: Extract<KernelTokenKind, "artifact" | "authCode" | "localSession" | "oidcReturnHandle">;
};

export type RevokeUserSessionsOptions = {
  exceptPrincipalSessionId?: string;
  excludePrincipalSessionIds?: string[];
};

export type PreparedContextSessionRevocation = {
  revoke: (reason: RevocationReason, options?: { includeSubjectContext?: string }) => Promise<RevokeSummary>;
};

export type ListPrincipalSessionsInput = {
  offset: number;
  limit: number;
  subjectIdentifier?: string;
};

export type PrincipalSessionInventoryItem = {
  principalSessionId: string;
  sessionKind: string;
  principal: PrincipalRef;
  authTime: number;
  expiresAt: number;
  amr: string[];
  acr?: string;
  origin?: SessionOrigin;
};

export type ListPrincipalSessionsResult = {
  items: PrincipalSessionInventoryItem[];
  total: number;
};

export type SessionKernelClientProtocolInventory = {
  clientCode: string;
  protocol: string;
  counts: {
    bindings: number;
    credentials: number;
    artifacts: number;
    cleanupPending: number;
    invalid: number;
    stale: number;
    total: number;
  };
};

export type SessionKernel = ReturnType<typeof createSessionKernel>;

export function createSessionKernel(deps: SessionKernelDependencies) {
  return createSessionKernelWithStateAdapterFactories(
    deps,
    ({ redis }) => createRedisSessionKernelRevocationTransitions(redis),
    createRedisSessionKernelObservation,
  );
}

export function createSessionKernelWithStateAdapterFactories(
  deps: SessionKernelDependencies,
  createRevocationTransitions: (input: {
    redis: SessionKernelRedis;
    keys: ReturnType<typeof createSessionKernelKeyBuilder>;
  }) => SessionKernelRevocationTransitions,
  createObservation: (redis: SessionKernelRedis) => SessionKernelObservation,
  createDirectTransitions: (redis: SessionKernelRedis) => DirectStateTransitions = createRedisDirectStateTransitions,
) {
  const config = normalizeSessionKernelConfig(deps.config);
  const keys = createSessionKernelKeyBuilder(config.namespace);
  const revocationTransitions = createRevocationTransitions({
    redis: deps.redis,
    keys,
  });
  const store = new SessionKernelStore(
    deps.redis,
    keys,
    revocationTransitions,
    createObservation(deps.redis),
    createDirectTransitions(deps.redis),
  );
  const cleanupAdapters = deps.cleanupAdapters ?? [];
  const uuid = deps.random?.uuid ?? randomUUID;

  async function createPrincipalSession(
    subjectIdentifier: string,
    context: PrincipalSessionContext,
    authenticationContext: PrincipalAuthenticationContext = {},
  ): Promise<CreateResult<PrincipalSession>> {
    let prepared: {
      externalToken: string;
      lookup: { lookupHash: string };
      principalSessionId: string;
      window: ReturnType<typeof createPrincipalSessionWindow>;
      principal: PrincipalRef;
    };
    try {
      const now = await store.now();
      const externalToken = generateKernelToken(config, "principalSession");
      const lookup = { lookupHash: tokenDigest(externalToken) };
      const principalSessionId = uuid();
      const window = { ...createPrincipalSessionWindow(now, config), authTime: config.clock.now() };
      const principal = PrincipalRefSchema.parse({
        principalType: "user",
        subjectId: subjectIdentifier,
      });
      prepared = {
        externalToken,
        lookup,
        principalSessionId,
        window,
        principal,
      };
    }
    catch (cause) {
      return failClosed("failed to create principal session", cause);
    }

    if (!context || typeof context.subjectContext !== "string")
      return failClosed("principal session requires externally supplied context");

    try {
      const session: PrincipalSession = {
        version: 1,
        subjectContext: context.subjectContext,
        sessionKind: authenticationContext.sessionKind ?? "browser_user",
        principalSessionId: prepared.principalSessionId,
        externalTokenLookupHash: prepared.lookup.lookupHash,
        principal: prepared.principal,
        authTime: prepared.window.authTime,
        lastActiveAt: prepared.window.lastActiveAt,
        expiresAt: prepared.window.expiresAt,
        absoluteExpiresAt: prepared.window.absoluteExpiresAt,
        amr: authenticationContext.amr === undefined ? [] : [...authenticationContext.amr],
        acr: authenticationContext.acr,
        origin: normalizeSessionOrigin(authenticationContext.origin),
        tenantId: authenticationContext.tenantId,
        issuerId: authenticationContext.issuerId,
        cleanupRefs: [],
      };
      await store.putObject({
        kind: "principal_session",
        id: prepared.principalSessionId,
        object: session,
        lookupHash: prepared.lookup.lookupHash,
        indexes: principalSessionIndexes(session),
      });
      observations.set(session, { serialized: JSON.stringify(session), observedAt: prepared.window.lastActiveAt });
      return { status: "created", value: session, observedAt: prepared.window.lastActiveAt, externalToken: prepared.externalToken };
    }
    catch (cause) {
      return failClosed("failed to create principal session", cause);
    }
  }

  async function resolvePrincipalSession(externalToken: string) {
    const result = await store.resolveStoredByExternalToken("principal_session", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "principal_session" });
    if (result.status === "resolved") {
      observations.set(result.value, { serialized: result.serialized, observedAt: result.observedAt });
      return { status: "resolved" as const, value: result.value, observedAt: result.observedAt };
    }
    return result;
  }

  async function resolvePrincipalSessionById(principalSessionId: string) {
    const result = await store.resolveObjectForUpdate("principal_session", principalSessionId);
    observeResolveResult(result, { operation: "resolve_by_id", objectType: "principal_session" });
    if (result.status === "resolved") {
      observations.set(result.value, { serialized: result.serialized, observedAt: result.observedAt });
      return { status: "resolved" as const, value: result.value, observedAt: result.observedAt };
    }
    return result;
  }

  async function renewPrincipalSession(principalSessionId: string): Promise<ResolveResult<PrincipalSession>> {
    const stored = await store.resolveObjectForUpdate(
      "principal_session",
      principalSessionId,
    );
    observeResolveResult(stored, { operation: "resolve_by_id", objectType: "principal_session" });
    if (stored.status !== "resolved")
      return stored;
    const result = stored;
    const now = result.observedAt;
    const window = calculateRenewedPrincipalSessionWindow(result.value, now, config);
    if (!window)
      return { status: "missing_or_expired" };
    const renewed: PrincipalSession = {
      ...result.value,
      lastActiveAt: window.lastActiveAt,
      expiresAt: window.expiresAt,
    };
    try {
      const updated = await store.updateObject({
        expectedSerialized: stored.serialized,
        kind: "principal_session",
        id: renewed.principalSessionId,
        object: renewed,
        indexes: principalSessionIndexes(renewed),
      });
      if (!updated)
        return await resolvePrincipalSessionById(principalSessionId);
      await renewPrincipalChildren(renewed);
      observations.set(renewed, { serialized: JSON.stringify(renewed), observedAt: now });
      return { status: "resolved", value: renewed, observedAt: now };
    }
    catch (cause) {
      return failClosed("failed to renew principal session", cause);
    }
  }

  async function listPrincipalSessions(
    input: ListPrincipalSessionsInput,
  ): Promise<ListPrincipalSessionsResult> {
    if (!Number.isInteger(input.offset) || input.offset < 0)
      throw new RangeError("Principal Session inventory offset must be a non-negative integer");
    if (!Number.isInteger(input.limit) || input.limit <= 0)
      throw new RangeError("Principal Session inventory limit must be a positive integer");
    if (input.subjectIdentifier !== undefined && input.subjectIdentifier.length === 0)
      throw new RangeError("Principal Session inventory subjectIdentifier must not be empty");

    const indexKey = input.subjectIdentifier === undefined
      ? keys.index.principalSessions
      : keys.index.user({ principalType: "user", subjectId: input.subjectIdentifier });
    await store.cleanExpiredIndex(indexKey);
    const items: PrincipalSessionInventoryItem[] = [];
    let rank = 0;
    let validSeen = 0;

    while (items.length < input.limit) {
      const members = await store.readIndexChunkDescending(
        indexKey,
        rank,
        rank + PRINCIPAL_SESSION_INVENTORY_CHUNK_SIZE - 1,
      );
      if (members.length === 0)
        break;

      const staleMembers: string[] = [];
      let retainedMembers = 0;
      for (const member of members) {
        const parsed = parseIndexMember(member);
        if (!parsed || parsed.kind !== "principal_session") {
          staleMembers.push(member);
          continue;
        }
        const resolved = await resolvePrincipalSessionById(parsed.id);
        if (
          resolved.status !== "resolved"
          || resolved.value.principal.principalType !== "user"
          || (
            input.subjectIdentifier !== undefined
            && resolved.value.principal.subjectId !== input.subjectIdentifier
          )
        ) {
          staleMembers.push(member);
          continue;
        }

        if (validSeen >= input.offset && items.length < input.limit)
          items.push(toPrincipalSessionInventoryItem(resolved.value));
        validSeen += 1;
        retainedMembers += 1;
      }

      await store.removeIndexMembers(indexKey, staleMembers);
      rank += retainedMembers;
      if (members.length < PRINCIPAL_SESSION_INVENTORY_CHUNK_SIZE)
        break;
    }

    return {
      items,
      total: await store.countIndexMembers(indexKey),
    };
  }

  async function createClientBinding(input: CreateClientBindingInput): Promise<CreateResult<ClientBinding>> {
    const principal = await resolvePrincipalSessionById(input.principalSessionId);
    if (principal.status !== "resolved")
      return principal;

    try {
      const now = principal.observedAt;
      const expiresAt = clampDerivedExpiresAt({
        now,
        ttlMs: input.ttlMs,
        expiresAt: input.expiresAt,
        principalSession: principal.value,
      });
      if (expiresAt <= now)
        return failClosed("cannot create an expired lifecycle object");
      const binding: ClientBinding = {
        version: 1,
        subjectContext: principal.value.subjectContext,
        bindingId: uuid(),
        protocol: input.protocol,
        clientCode: input.clientCode,
        principalSessionId: input.principalSessionId,
        principal: principal.value.principal,
        authTime: principal.value.authTime,
        issuedAt: now,
        expiresAt,
        renewalPolicy: input.renewalPolicy ?? "fixed_at_issue",
        metadata: input.metadata,
        cleanupRefs: input.cleanupRefs ?? [],
      };
      await store.putObject({
        kind: "client_binding",
        id: binding.bindingId,
        object: binding,
        indexes: clientBindingIndexes(binding),
      });
      observations.set(binding, { serialized: JSON.stringify(binding), observedAt: now });
      return { status: "created", value: binding, observedAt: now };
    }
    catch (cause) {
      return failClosed("failed to create client binding", cause);
    }
  }

  async function resolveClientBindingById(bindingId: string, purpose: ProtocolPurpose) {
    const result = await store.resolveObjectForUpdate("client_binding", bindingId);
    observeResolveResult(result, { operation: "resolve_by_id", objectType: "client_binding" });
    if (result.status !== "resolved")
      return result;
    return matchPurpose(result, purpose);
  }

  async function issueCredential(input: IssueCredentialInput): Promise<CreateResult<IssuedCredential>> {
    const principal = await resolvePrincipalSessionById(input.principalSessionId);
    if (principal.status !== "resolved")
      return principal;

    try {
      const now = principal.observedAt;
      const externalToken = input.externalToken ?? generateKernelToken(config, input.tokenKind ?? "credential");
      const lookupHash = tokenDigest(externalToken);
      const expiresAt = clampDerivedExpiresAt({
        now,
        ttlMs: input.ttlMs,
        expiresAt: input.expiresAt,
        principalSession: principal.value,
      });
      if (expiresAt <= now)
        return failClosed("cannot create an expired lifecycle object");
      const credentialId = input.credentialId ?? uuid();
      if (credentialId.length === 0)
        return failClosed("credential identity is invalid");
      const credential: IssuedCredential = {
        version: 1,
        subjectContext: principal.value.subjectContext,
        credentialId,
        protocol: input.protocol,
        credentialType: input.credentialType,
        lookupHash,
        principalSessionId: input.principalSessionId,
        bindingId: input.bindingId,
        clientCode: input.clientCode,
        principal: principal.value.principal,
        issuedAt: now,
        expiresAt,
        renewalPolicy: input.renewalPolicy ?? "fixed_at_issue",
        metadata: input.metadata,
        cleanupRefs: input.cleanupRefs ?? [],
      };
      const createResult = await store.putCredential({
        credential,
        indexes: credentialIndexes(credential),
      });
      if (!createResult)
        return failClosed("credential identity or token state is already owned");
      observations.set(credential, { serialized: JSON.stringify(credential), observedAt: now });
      return { status: "created", value: credential, observedAt: now, externalToken };
    }
    catch (cause) {
      return failClosed("failed to issue credential", cause);
    }
  }

  async function resolveCredential(externalToken: string, purpose: CredentialPurpose) {
    const result = await store.resolveStoredByExternalToken("credential", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "credential" });
    return matchPurpose(result, purpose);
  }

  async function createProtocolArtifact(input: CreateProtocolArtifactInput): Promise<CreateResult<ProtocolArtifact>> {
    const principal = input.principalSessionId
      ? await resolvePrincipalSessionById(input.principalSessionId)
      : undefined;
    if (principal && principal.status !== "resolved")
      return principal;

    try {
      const now = principal?.observedAt ?? await store.now();
      if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0)
        return failClosed("artifact TTL must be a positive integer");
      const externalToken = input.externalToken ?? generateKernelToken(config, input.tokenKind ?? "artifact");
      const lookupHash = tokenDigest(externalToken);
      const artifactId = input.artifactId ?? uuid();
      if (artifactId.length === 0)
        return failClosed("artifact identity is invalid");
      const artifact: ProtocolArtifact = {
        version: 1,
        subjectContext: principal?.value.subjectContext,
        artifactId,
        protocol: input.protocol,
        artifactType: input.artifactType,
        lookupHash,
        principalSessionId: input.principalSessionId,
        bindingId: input.bindingId,
        clientCode: input.clientCode,
        principal: principal?.value.principal,
        issuedAt: now,
        expiresAt: now + input.ttlMs,
        metadata: input.metadata,
        cleanupRefs: input.cleanupRefs ?? [],
      };
      await store.putObject({
        kind: "artifact",
        id: artifact.artifactId,
        object: artifact,
        lookupHash,
        indexes: artifactIndexes(artifact),
      });
      observations.set(artifact, { serialized: JSON.stringify(artifact), observedAt: now });
      return { status: "created", value: artifact, observedAt: now, externalToken };
    }
    catch (cause) {
      return failClosed("failed to create protocol artifact", cause);
    }
  }

  async function resolveProtocolArtifact(externalToken: string, purpose: ArtifactPurpose) {
    const result = await store.resolveStoredByExternalToken("artifact", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "artifact" });
    return matchPurpose(result, purpose);
  }

  async function consumeProtocolArtifact(
    externalToken: string,
    purpose: ArtifactPurpose,
    observed: ProtocolArtifact,
  ): Promise<ResolveResult<ProtocolArtifact>> {
    const observation = observations.get(observed);
    if (!observation || !purposeMatches(observed, purpose))
      return failClosed("artifact consumption requires the observed object and matching purpose");
    if (!store.tokenMatchesObject(externalToken, observed))
      return failClosed("artifact token does not match the observed object");
    try {
      const result = await store.consumeArtifact({
        artifact: observed,
        serializedArtifact: observation.serialized,
        observedAt: observation.observedAt,
        tombstone: createTombstone("artifact", observed, "consumed", observation.observedAt),
        indexRemovals: indexRemovalsForObject("artifact", observed),
      });
      observeResolveResult(result, { operation: "consume", objectType: "artifact" });
      return result;
    }
    catch (cause) {
      return failClosed("failed to consume protocol artifact", cause);
    }
  }

  /** Revoke only the object acquired by this Kernel; a replacement must survive. */
  async function revokeObservedObject(object: ProtocolValidationTarget | PrincipalSession, reason: RevocationReason) {
    const observation = observations.get(object);
    if (!observation)
      throw new Error("revocation requires an object observed by this Kernel");
    if ("sessionKind" in object)
      return await revokePrincipalSessionObservation(object.principalSessionId, reason, { value: object, ...observation });
    const kind = lifecycleObjectKind(object);
    const children: Array<{ kind: LifecycleObjectKind; id: string; value: LifecycleObject; serialized: string; observedAt: number }> = [];
    if (kind === "client_binding") {
      for (const member of await store.readIndexWithoutMutation(keys.index.binding((object as ClientBinding).bindingId))) {
        const parsed = parseIndexMember(member);
        if (!parsed || parsed.kind === "client_binding" || parsed.kind === "principal_session")
          continue;
        const child = await store.resolveObjectForUpdate(parsed.kind, parsed.id);
        if (child.status === "resolved" && child.value.bindingId === (object as ClientBinding).bindingId
          && child.value.protocol === object.protocol && child.value.clientCode === object.clientCode
          && child.value.principalSessionId === object.principalSessionId) {
          children.push({ kind: parsed.kind, id: parsed.id, ...child });
        }
      }
    }
    const summary = await revokeObject(kind, objectIdForKind(kind, object), reason, {
      value: object,
      ...observation,
    });
    if (kind === "client_binding" && summary.bindings.revoked > 0) {
      for (const child of children)
        mergeRevokeSummary(summary, await revokeObject(child.kind, child.id, reason, child));
    }
    return summary;
  }

  async function revokePrincipalSession(
    principalSessionId: string,
    reason: RevocationReason = "logout",
  ) {
    return await revokePrincipalSessionObservation(principalSessionId, reason);
  }

  async function revokePrincipalSessionObservation(
    principalSessionId: string,
    reason: RevocationReason,
    expected?: { value: PrincipalSession; serialized: string; observedAt: number },
  ) {
    const summary = createEmptyRevokeSummary();
    mergeRevokeSummary(summary, await revokePrincipalChildObjects(principalSessionId, reason, expected?.value));
    try {
      mergeRevokeSummary(summary, await revokeObject("principal_session", principalSessionId, reason, expected));
    }
    catch {
      deps.logger?.warn?.({
        event: "session_kernel.root_revocation.unconfirmed",
        bindingsRevoked: summary.bindings.revoked,
        credentialsRevoked: summary.credentials.revoked,
        artifactsRevoked: summary.artifacts.revoked,
      }, "root revocation was not confirmed; completed child effects remain effective");
      throw new Error("session kernel root revocation was not confirmed");
    }
    return summary;
  }

  async function revokeBinding(bindingId: string, reason: RevocationReason = "admin_revoke") {
    const summary = createEmptyRevokeSummary();
    const members = await store.readIndex(keys.index.binding(bindingId));
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "client_binding")
        continue;
      mergeRevokeSummary(summary, await revokeObject(parsed.kind, parsed.id, reason));
    }
    mergeRevokeSummary(summary, await revokeObject("client_binding", bindingId, reason));
    return summary;
  }

  async function revokeCredential(credentialId: string, reason: RevocationReason = "admin_revoke") {
    return await revokeObject("credential", credentialId, reason);
  }

  async function revokeArtifact(artifactId: string, reason: RevocationReason = "admin_revoke") {
    return await revokeObject("artifact", artifactId, reason);
  }

  async function revokeUserSessionRecords(
    principal: PrincipalRef,
    reason: RevocationReason = "admin_revoke",
    options: RevokeUserSessionsOptions = {},
  ) {
    return await revokeUserSessionsMatching(principal, reason, options);
  }

  async function revokeUserSessionsByContext(
    principal: PrincipalRef,
    reason: RevocationReason,
    subjectContexts: readonly string[],
  ) {
    return await revokeUserSessionsMatching(principal, reason, {}, {
      contexts: new Set(subjectContexts),
    });
  }

  async function prepareUserSessionRevocationByContext(
    principal: PrincipalRef,
  ): Promise<PreparedContextSessionRevocation> {
    const target = { ...principal };
    const contexts = new Set<string>();
    // Raw reads neither interpret access context nor require the subject to be enabled.
    const members = await store.readIndexWithoutMutation(keys.index.user(target));
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind !== "principal_session")
        continue;
      const resolved = await store.resolveObject("principal_session", parsed.id);
      if (resolved.status === "resolved"
        && resolved.value.principal.principalType === target.principalType
        && resolved.value.principal.subjectId === target.subjectId
        && resolved.value.principalSessionId === parsed.id
        && resolved.value.subjectContext !== undefined) {
        contexts.add(resolved.value.subjectContext);
      }
    }
    return {
      async revoke(reason, options = {}) {
        const selected = new Set(contexts);
        if (options.includeSubjectContext !== undefined)
          selected.add(options.includeSubjectContext);
        return await revokeUserSessionsMatching(target, reason, {}, {
          contexts: selected,
        });
      },
    };
  }

  async function revokeUserSessionsMatching(
    principal: PrincipalRef,
    reason: RevocationReason,
    options: RevokeUserSessionsOptions,
    contextScope?: { contexts: ReadonlySet<string> },
  ) {
    const summary = createEmptyRevokeSummary();
    if (contextScope?.contexts.size === 0)
      return summary;
    const errors: unknown[] = [];
    const excludedPrincipalSessionIds = new Set([
      ...(options.excludePrincipalSessionIds ?? []),
      options.exceptPrincipalSessionId,
    ].filter((value): value is string => typeof value === "string" && value.length > 0));
    const members = await store.readIndex(keys.index.user(principal));

    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind !== "principal_session")
        continue;

      try {
        const resolved = await store.resolveObjectForUpdate("principal_session", parsed.id);
        if (resolved.status === "fail_closed" || resolved.status === "schema_invalid")
          throw new Error("session kernel root selection was not confirmed");
        if (resolved.status === "resolved") {
          if (
            resolved.value.principal.principalType !== principal.principalType
            || resolved.value.principal.subjectId !== principal.subjectId
            || resolved.value.principalSessionId !== parsed.id
            || (contextScope !== undefined && (resolved.value.subjectContext === undefined
              || !contextScope.contexts.has(resolved.value.subjectContext)))
          ) {
            summary.principalSessions.excluded += 1;
            continue;
          }
        }
        else {
          if (resolved.status === "missing_or_expired")
            summary.principalSessions.missing += 1;
          else if (resolved.status === "revoked" || resolved.status === "consumed_replay")
            summary.principalSessions.alreadyRevoked += 1;
          else
            throw new Error("session kernel root selection was not confirmed");
          continue;
        }

        if (excludedPrincipalSessionIds.has(parsed.id)) {
          summary.principalSessions.excluded += 1;
          mergeRevokeSummary(summary, await revokePrincipalChildObjects(parsed.id, reason, resolved.value));
          continue;
        }

        mergeRevokeSummary(summary, await revokePrincipalSessionObservation(parsed.id, reason, resolved));
      }
      catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0)
      throw new AggregateError(errors, "session kernel prepared revocation failed");
    return summary;
  }

  async function revokeClientProtocol(clientCode: string, protocol: string, reason: RevocationReason = "admin_revoke") {
    const summary = createEmptyRevokeSummary();
    const cleanupIndexKey = keys.index.clientProtocolCleanup(clientCode, protocol);
    const pendingMembers = await store.readIndexWithoutMutation(cleanupIndexKey);
    for (const member of pendingMembers) {
      mergeRevokeSummary(
        summary,
        await retryPendingCleanup(clientCode, protocol, cleanupIndexKey, member),
      );
    }
    mergeRevokeSummary(
      summary,
      await revokeByIndex(
        keys.index.clientProtocol(clientCode, protocol),
        reason,
        () => true,
        true,
      ),
    );
    return summary;
  }

  async function revokeSelectedClientProtocolObjects(
    clientCode: string,
    protocol: string,
    selector: ClientProtocolRevocationSelector,
    reason: RevocationReason = "admin_revoke",
  ) {
    if (!clientCode || !protocol)
      throw new RangeError("Client protocol revocation requires a client and protocol");
    const summary = createEmptyRevokeSummary();
    let unconfirmed = 0;
    // Capture each selected object's serialized observation before executing any cleanup.
    // Descendants are selected independently: revoking an old Binding cannot widen this scope.
    const selected: Array<{
      kind: Exclude<LifecycleObjectKind, "principal_session">;
      id: string;
      value: LifecycleObject;
      serialized: string;
      observedAt: number;
    }> = [];
    for (const member of await store.readIndexWithoutMutation(keys.index.clientProtocol(clientCode, protocol))) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "principal_session")
        continue;
      const observed = await store.resolveObjectForUpdate(parsed.kind, parsed.id);
      if (observed.status !== "resolved")
        continue;
      if (observed.value.clientCode !== clientCode || observed.value.protocol !== protocol)
        continue;
      const metadata = Object.freeze(structuredClone(Object.fromEntries(
        selector.metadataFields.map(field => [field, observed.value.metadata?.[field]]),
      )));
      const decision = selector.select(Object.freeze({ kind: parsed.kind, metadata }));
      if (decision === "select") {
        selected.push({ kind: parsed.kind, id: parsed.id, ...observed });
      }
      else {
        counterForKind(summary, parsed.kind).excluded += 1;
        if (decision !== "retain")
          unconfirmed += 1;
      }
    }
    if (unconfirmed > 0) {
      deps.logger?.warn?.({
        event: "session_kernel.bulk_revocation.unconfirmed",
        clientCode,
        protocol,
        count: unconfirmed,
      }, "client protocol objects skipped because selection could not be confirmed");
    }
    for (const object of selected)
      mergeRevokeSummary(summary, await revokeObject(object.kind, object.id, reason, object));
    return summary;
  }

  async function inventoryClientProtocol(
    clientCode: string,
    protocol: string,
  ): Promise<SessionKernelClientProtocolInventory> {
    if (clientCode.length === 0)
      throw new RangeError("Client protocol inventory clientCode must not be empty");
    if (protocol.length === 0)
      throw new RangeError("Client protocol inventory protocol must not be empty");

    const indexKey = keys.index.clientProtocol(clientCode, protocol);
    const counts = {
      bindings: 0,
      credentials: 0,
      artifacts: 0,
      cleanupPending: 0,
      invalid: 0,
      stale: 0,
      total: 0,
    };
    for (const member of await store.readIndexWithoutMutation(indexKey)) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "principal_session") {
        counts.invalid += 1;
        continue;
      }
      const result = await store.resolveObject(parsed.kind, parsed.id);
      if (result.status === "missing_or_expired" || result.status === "revoked" || result.status === "consumed_replay") {
        counts.stale += 1;
        continue;
      }
      if (result.status !== "resolved") {
        counts.invalid += 1;
        continue;
      }
      if (result.value.clientCode !== clientCode || result.value.protocol !== protocol) {
        counts.invalid += 1;
        continue;
      }
      if (parsed.kind === "client_binding")
        counts.bindings += 1;
      else if (parsed.kind === "credential")
        counts.credentials += 1;
      else
        counts.artifacts += 1;
    }
    const cleanupIndexKey = keys.index.clientProtocolCleanup(clientCode, protocol);
    for (const member of await store.readIndexWithoutMutation(cleanupIndexKey)) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "principal_session") {
        counts.invalid += 1;
        continue;
      }
      const result = await store.resolveObject(parsed.kind, parsed.id);
      if (
        result.status !== "revoked"
        || result.tombstone.reason === "consumed"
        || result.tombstone.clientCode !== clientCode
        || result.tombstone.protocol !== protocol
        || result.tombstone.cleanupRefs.length === 0
      ) {
        counts.invalid += 1;
        continue;
      }
      counts.cleanupPending += 1;
    }
    counts.total = counts.bindings
      + counts.credentials
      + counts.artifacts
      + counts.cleanupPending
      + counts.invalid
      + counts.stale;
    return { clientCode, protocol, counts };
  }

  async function revokeClient(clientCode: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.client(clientCode), reason);
  }

  async function revokePrincipalObjects(principalSessionId: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.principal(principalSessionId), reason);
  }

  async function revokePrincipalChildObjects(
    principalSessionId: string,
    reason: RevocationReason = "admin_revoke",
    principal?: PrincipalSession,
  ) {
    const summary = createEmptyRevokeSummary();
    let failed = 0;
    let members: string[];
    try {
      members = await store.readIndex(keys.index.principal(principalSessionId));
    }
    catch {
      deps.logger?.warn?.({ event: "session_kernel.child_revocation.enumeration_failed" }, "child enumeration failed; root revocation may continue");
      return summary;
    }
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "principal_session")
        continue;
      try {
        const observed = await store.resolveObjectForUpdate(parsed.kind, parsed.id);
        if (observed.status !== "resolved") {
          if (observed.status === "missing_or_expired")
            counterForKind(summary, parsed.kind).missing += 1;
          else if (observed.status === "revoked" || observed.status === "consumed_replay")
            counterForKind(summary, parsed.kind).alreadyRevoked += 1;
          else
            failed += 1;
          continue;
        }
        if (observed.value.principalSessionId !== principalSessionId
          || (principal !== undefined && (observed.value.subjectContext !== principal.subjectContext
            || observed.value.principal?.principalType !== principal.principal.principalType
            || observed.value.principal?.subjectId !== principal.principal.subjectId))) {
          counterForKind(summary, parsed.kind).excluded += 1;
          continue;
        }
        const child = await revokeObject(parsed.kind, parsed.id, reason, observed);
        mergeRevokeSummary(summary, child);
        failed += counterForKind(child, parsed.kind).excluded;
      }
      catch {
        failed += 1;
      }
    }
    if (failed > 0)
      deps.logger?.warn?.({ event: "session_kernel.child_revocation.incomplete", failed }, "some child revocations were not confirmed");
    return summary;
  }

  async function revokeBindingObjects(bindingId: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.binding(bindingId), reason);
  }

  async function revokeProtocol(protocol: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.protocol(protocol), reason);
  }

  async function revokeByIndex(
    key: string,
    reason: RevocationReason,
    filter: (kind: LifecycleObjectKind) => boolean = () => true,
    includeExpired = false,
  ) {
    const summary = createEmptyRevokeSummary();
    const members = includeExpired
      ? await store.readIndexWithoutMutation(key)
      : await store.readIndex(key);
    const staleMembers: Array<{
      id: string;
      kind: LifecycleObjectKind;
      member: string;
    }> = [];
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (parsed && filter(parsed.kind)) {
        const objectSummary = await revokeObject(parsed.kind, parsed.id, reason);
        const counter = counterForKind(objectSummary, parsed.kind);
        if (counter.missing > 0 || counter.alreadyRevoked > 0)
          staleMembers.push({ id: parsed.id, kind: parsed.kind, member });
        mergeRevokeSummary(summary, objectSummary);
      }
    }
    for (const stale of staleMembers) {
      await store.removeIndexMemberIfObjectInactive(
        key,
        stale.member,
        stale.kind,
        stale.id,
      );
    }
    return summary;
  }

  async function retryPendingCleanup(
    clientCode: string,
    protocol: string,
    indexKey: string,
    member: string,
  ) {
    const summary = createEmptyRevokeSummary();
    const parsed = parseIndexMember(member);
    if (!parsed || parsed.kind === "principal_session")
      return summary;
    const result = await store.resolveObject(parsed.kind, parsed.id);
    if (
      result.status !== "revoked"
      || result.tombstone.reason === "consumed"
      || result.tombstone.clientCode !== clientCode
      || result.tombstone.protocol !== protocol
      || result.tombstone.cleanupRefs.length === 0
    ) {
      return summary;
    }
    counterForKind(summary, parsed.kind).alreadyRevoked += 1;
    const failedBeforeCleanup = summary.cleanup.failed;
    await runCleanupRefs(result.tombstone.cleanupRefs, cleanupAdapters, summary, {
      deleteOwnedKeys: payloadKeys => store.deleteOwnedCleanupKeys(result.tombstone, payloadKeys),
    }, deps.logger);
    if (summary.cleanup.failed === failedBeforeCleanup) {
      await store.finalizeCleanupPending({
        tombstone: result.tombstone,
        indexKey,
        member,
      });
    }
    logCleanupFailureSummary(
      result.tombstone,
      summary.cleanup.failed - failedBeforeCleanup,
    );
    return summary;
  }

  async function revokeObject(
    kind: LifecycleObjectKind,
    id: string,
    reason: RevocationReason,
    expected?: { value: LifecycleObject; serialized: string; observedAt: number },
  ): Promise<RevokeSummary> {
    const summary = createEmptyRevokeSummary();
    const resolved = expected ? { status: "resolved" as const, ...expected } : await store.resolveObjectForUpdate(kind, id);
    if (resolved.status === "revoked" || resolved.status === "consumed_replay") {
      counterForKind(summary, kind).alreadyRevoked += 1;
      if (kind === "principal_session" && resolved.tombstone.cleanupRefs.length > 0) {
        await runCleanupRefs(resolved.tombstone.cleanupRefs, cleanupAdapters, summary, {
          deleteOwnedKeys: payloadKeys => store.deleteOwnedCleanupKeys(resolved.tombstone, payloadKeys),
        }, deps.logger);
        if (summary.cleanup.failed === 0) {
          try {
            await store.finalizeCleanupPending({
              tombstone: resolved.tombstone,
              indexKey: keys.index.principalCleanup,
              member: encodeIndexMember(kind, id),
            });
          }
          catch {
            summary.cleanup.attempted += 1;
            summary.cleanup.failed += 1;
          }
        }
      }
      return summary;
    }
    if (resolved.status === "missing_or_expired") {
      counterForKind(summary, kind).missing += 1;
      return summary;
    }
    if (resolved.status !== "resolved") {
      throw new Error("session kernel revocation observation was not confirmed");
    }

    const now = resolved.observedAt;
    const tombstone = createTombstone(kind, resolved.value, reason, now);
    const cleanupPending = cleanupPendingIndexForTombstone(tombstone);
    const revokeResult = await store.revokeActiveObject({
      expectedSerialized: resolved.serialized,
      kind,
      id,
      lookupHash: lookupHashForObject(resolved.value),
      tombstone,
      indexRemovals: indexRemovalsForObject(kind, resolved.value),
      cleanupPending,
    });

    if (revokeResult.status === "revoked") {
      counterForKind(summary, kind).revoked += 1;
      const failedBeforeCleanup = summary.cleanup.failed;
      await runCleanupRefs(tombstone.cleanupRefs, cleanupAdapters, summary, {
        deleteOwnedKeys: payloadKeys => store.deleteOwnedCleanupKeys(tombstone, payloadKeys),
      }, deps.logger);
      if (cleanupPending && summary.cleanup.failed === failedBeforeCleanup) {
        try {
          await store.finalizeCleanupPending({
            tombstone,
            indexKey: cleanupPending.key,
            member: cleanupPending.member,
          });
        }
        catch {
          summary.cleanup.attempted += 1;
          summary.cleanup.failed += 1;
        }
      }
      logCleanupFailureSummary(tombstone, summary.cleanup.failed - failedBeforeCleanup);
    }
    else if (revokeResult.status === "already_revoked") {
      counterForKind(summary, kind).alreadyRevoked += 1;
    }
    else if (revokeResult.status === "missing") {
      counterForKind(summary, kind).missing += 1;
    }
    else if (revokeResult.status === "comparison_conflict" && kind !== "principal_session") {
      counterForKind(summary, kind).excluded += 1;
    }
    else {
      throw new Error("session kernel revocation transition was not confirmed");
    }
    return summary;
  }

  async function renewPrincipalChildren(principal: PrincipalSession) {
    const members = await store.readIndex(keys.index.principal(principal.principalSessionId));
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || (parsed.kind !== "client_binding" && parsed.kind !== "credential"))
        continue;
      const result = await store.resolveObjectForUpdate(parsed.kind, parsed.id);
      if (result.status !== "resolved" || !canRenewWithPrincipal(result.value.renewalPolicy))
        continue;
      const next = {
        ...result.value,
        expiresAt: Math.min(principal.expiresAt, principal.absoluteExpiresAt),
      };
      if (parsed.kind === "client_binding") {
        await store.updateObject({
          expectedSerialized: result.serialized,
          kind: "client_binding",
          id: parsed.id,
          object: next as ClientBinding,
          indexes: clientBindingIndexes(next as ClientBinding),
        });
      }
      else {
        await store.updateObject({
          expectedSerialized: result.serialized,
          kind: "credential",
          id: parsed.id,
          object: next as IssuedCredential,
          indexes: credentialIndexes(next as IssuedCredential),
        });
      }
    }
  }

  function matchPurpose<T extends ProtocolValidationTarget>(
    result: ResolveResult<T> & { serialized?: string },
    purpose: ProtocolPurpose | CredentialPurpose | ArtifactPurpose,
  ): ResolveResult<T> {
    if (result.status !== "resolved") {
      if ((result.status === "revoked" || result.status === "consumed_replay")
        && !purposeMatches({ ...result.tombstone, ...result.tombstone.metadata }, purpose)) {
        return { status: "purpose_mismatch" };
      }
      return result;
    }
    if (!purposeMatches(result.value, purpose))
      return { status: "purpose_mismatch" };
    if (result.serialized !== undefined)
      observations.set(result.value, { serialized: result.serialized, observedAt: result.observedAt });
    return { status: "resolved", value: result.value, observedAt: result.observedAt };
  }

  function principalSessionIndexes(session: PrincipalSession): StoreIndexWrite[] {
    const member = encodeIndexMember("principal_session", session.principalSessionId);
    return [
      {
        key: keys.index.user(session.principal),
        score: session.expiresAt,
        member,
      },
      {
        key: keys.index.principal(session.principalSessionId),
        score: session.expiresAt,
        member,
      },
      ...(session.principal.principalType === "user"
        ? [{ key: keys.index.principalSessions, score: session.expiresAt, member }]
        : []),
    ];
  }

  function clientBindingIndexes(binding: ClientBinding): StoreIndexWrite[] {
    const member = encodeIndexMember("client_binding", binding.bindingId);
    return [
      { key: keys.index.principal(binding.principalSessionId), score: binding.expiresAt, member },
      { key: keys.index.binding(binding.bindingId), score: binding.expiresAt, member },
      { key: keys.index.client(binding.clientCode), score: binding.expiresAt, member },
      { key: keys.index.clientProtocol(binding.clientCode, binding.protocol), score: binding.expiresAt, member },
      { key: keys.index.protocol(binding.protocol), score: binding.expiresAt, member },
    ];
  }

  function credentialIndexes(credential: IssuedCredential): StoreIndexWrite[] {
    const member = encodeIndexMember("credential", credential.credentialId);
    return [
      { key: keys.index.principal(credential.principalSessionId), score: credential.expiresAt, member },
      ...(credential.bindingId
        ? [{ key: keys.index.binding(credential.bindingId), score: credential.expiresAt, member }]
        : []),
      { key: keys.index.client(credential.clientCode), score: credential.expiresAt, member },
      {
        key: keys.index.clientProtocol(credential.clientCode, credential.protocol),
        score: credential.expiresAt,
        member,
      },
      { key: keys.index.protocol(credential.protocol), score: credential.expiresAt, member },
    ];
  }

  function artifactIndexes(artifact: ProtocolArtifact): StoreIndexWrite[] {
    const member = encodeIndexMember("artifact", artifact.artifactId);
    return [
      ...(artifact.principalSessionId
        ? [{
            key: keys.index.principal(artifact.principalSessionId),
            score: artifact.expiresAt,
            member,
          }]
        : []),
      ...(artifact.bindingId
        ? [{ key: keys.index.binding(artifact.bindingId), score: artifact.expiresAt, member }]
        : []),
      ...(artifact.clientCode
        ? [
            { key: keys.index.client(artifact.clientCode), score: artifact.expiresAt, member },
            {
              key: keys.index.clientProtocol(artifact.clientCode, artifact.protocol),
              score: artifact.expiresAt,
              member,
            },
          ]
        : []),
      { key: keys.index.protocol(artifact.protocol), score: artifact.expiresAt, member },
    ];
  }

  function indexRemovalsForObject(kind: LifecycleObjectKind, object: LifecycleObject) {
    const indexes = kind === "principal_session"
      ? principalSessionIndexes(object as PrincipalSession)
      : kind === "client_binding"
        ? clientBindingIndexes(object as ClientBinding)
        : kind === "credential"
          ? credentialIndexes(object as IssuedCredential)
          : artifactIndexes(object as ProtocolArtifact);
    return indexes.map(({ key, member }) => ({ key, member }));
  }

  function cleanupPendingIndexForTombstone(tombstone: RevokedTombstone) {
    if (tombstone.objectKind === "principal_session" && tombstone.cleanupRefs.length > 0)
      return { key: keys.index.principalCleanup, member: encodeIndexMember(tombstone.objectKind, tombstone.objectId) };
    if (
      tombstone.cleanupRefs.length === 0
      || tombstone.clientCode === undefined
      || tombstone.protocol === undefined
    ) {
      return undefined;
    }
    return {
      key: keys.index.clientProtocolCleanup(tombstone.clientCode, tombstone.protocol),
      member: encodeIndexMember(tombstone.objectKind, tombstone.objectId),
    };
  }

  function createTombstone(
    kind: LifecycleObjectKind,
    object: LifecycleObject,
    reason: RevocationReason,
    now: number,
  ): RevokedTombstone {
    return {
      version: 1,
      objectKind: kind,
      objectId: objectIdForKind(kind, object),
      lookupHash: lookupHashForObject(object),
      reason,
      revokedAt: now,
      expiresAt: calculateTombstoneExpiresAt(object.expiresAt, now, config),
      principalSessionId: "principalSessionId" in object ? object.principalSessionId : undefined,
      bindingId: "bindingId" in object ? object.bindingId : undefined,
      clientCode: "clientCode" in object ? object.clientCode : undefined,
      protocol: "protocol" in object ? object.protocol : undefined,
      cleanupRefs: object.cleanupRefs ?? [],
      metadata: tombstoneMetadata(kind, object),
    };
  }

  function observeResolveResult<T>(
    result: ResolveResult<T>,
    context: { operation: string; objectType: LifecycleObjectKind },
  ) {
    if (result.status === "schema_invalid") {
      deps.logger?.warn?.({
        event: SessionKernelLogEvent.SchemaCorrupted,
        sourceApp: deps.sourceApp ?? "session-kernel",
        operation: context.operation,
        objectType: result.objectKind,
        objectId: result.objectId,
        reason: "schema_invalid",
      }, "session kernel lifecycle payload schema corrupted");
      return;
    }

    if (result.status !== "revoked" && result.status !== "consumed_replay")
      return;

    const tombstone = result.tombstone;
    deps.logger?.warn?.({
      event: SessionKernelLogEvent.TombstoneReplayDetected,
      sourceApp: deps.sourceApp ?? "session-kernel",
      operation: context.operation,
      objectType: tombstone.objectKind,
      protocol: tombstone.protocol,
      clientCode: tombstone.clientCode,
      credentialType: readTombstoneMetadataString(tombstone, "credentialType"),
      artifactType: readTombstoneMetadataString(tombstone, "artifactType"),
      reason: tombstone.reason,
    }, "session kernel tombstone replay detected");
  }

  function logCleanupFailureSummary(tombstone: RevokedTombstone, failureCount: number) {
    if (failureCount <= 0)
      return;
    deps.logger?.warn?.({
      event: SessionKernelLogEvent.RevokeCleanupFailed,
      sourceApp: deps.sourceApp ?? "session-kernel",
      protocol: tombstone.protocol,
      kind: "revoke_cleanup",
      refType: tombstone.objectKind,
      failureCount,
      reason: tombstone.reason,
      clientCode: tombstone.clientCode,
      principalSessionId: tombstone.principalSessionId,
    }, "session kernel revoke cleanup failed");
  }

  return {
    config,
    keys,
    createPrincipalSession,
    resolvePrincipalSession,
    resolvePrincipalSessionById,
    renewPrincipalSession,
    listPrincipalSessions,
    createClientBinding,
    resolveClientBindingById,
    issueCredential,
    resolveCredential,
    createProtocolArtifact,
    resolveProtocolArtifact,
    consumeProtocolArtifact,
    revokePrincipalSession,
    revokeBinding,
    revokeCredential,
    revokeArtifact,
    revokeObservedObject,
    revokeUserSessionRecords,
    revokeUserSessionsByContext,
    prepareUserSessionRevocationByContext,
    inventoryClientProtocol,
    revokeClientProtocol,
    revokeSelectedClientProtocolObjects,
    revokeClient,
    revokePrincipalObjects,
    revokeBindingObjects,
    revokeProtocol,
  };
}

function lifecycleObjectKind(
  object: PrincipalSession | ClientBinding | IssuedCredential | ProtocolArtifact,
): LifecycleObjectKind {
  if ("sessionKind" in object)
    return "principal_session";
  if ("credentialType" in object)
    return "credential";
  if ("artifactType" in object)
    return "artifact";
  return "client_binding";
}

function toPrincipalSessionInventoryItem(session: PrincipalSession): PrincipalSessionInventoryItem {
  return {
    principalSessionId: session.principalSessionId,
    sessionKind: session.sessionKind,
    principal: { ...session.principal },
    authTime: session.authTime,
    expiresAt: session.expiresAt,
    amr: [...session.amr],
    acr: session.acr,
    origin: session.origin ? { ...session.origin } : undefined,
  };
}

function objectIdForKind(kind: LifecycleObjectKind, object: LifecycleObject) {
  switch (kind) {
    case "principal_session":
      return (object as PrincipalSession).principalSessionId;
    case "client_binding":
      return (object as ClientBinding).bindingId;
    case "credential":
      return (object as IssuedCredential).credentialId;
    case "artifact":
      return (object as ProtocolArtifact).artifactId;
  }
}

function lookupHashForObject(object: LifecycleObject) {
  if ("externalTokenLookupHash" in object)
    return object.externalTokenLookupHash;
  if ("lookupHash" in object)
    return object.lookupHash;
  return undefined;
}

function tombstoneMetadata(kind: LifecycleObjectKind, object: LifecycleObject) {
  if (kind === "credential") {
    return {
      credentialType: (object as IssuedCredential).credentialType,
    };
  }
  if (kind === "artifact") {
    return {
      artifactType: (object as ProtocolArtifact).artifactType,
    };
  }
  return undefined;
}

function readTombstoneMetadataString(tombstone: RevokedTombstone, key: string) {
  const value = tombstone.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function purposeMatches(
  object: { protocol?: string; clientCode?: string; credentialType?: unknown; artifactType?: unknown },
  purpose: ProtocolPurpose | CredentialPurpose | ArtifactPurpose,
) {
  return !!purpose && object.protocol === purpose.protocol
    && (purpose.clientCode === undefined || object.clientCode === purpose.clientCode)
    && (!("credentialType" in purpose) || object.credentialType === purpose.credentialType)
    && (!("artifactType" in purpose) || object.artifactType === purpose.artifactType);
}
