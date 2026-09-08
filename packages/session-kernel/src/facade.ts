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
  ValidationResult,
} from "./state/model";
import type { CreateResult, ResolveResult } from "./state/result";
import type { SessionKernelArtifactConsumer } from "./storage/artifact-consumption";
import type {
  CredentialCreateResult,
  SessionKernelCredentialCreator,
} from "./storage/credential-creation";
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
import { createCurrentLookupHash } from "./security/hmac";
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
import { createRedisSessionKernelArtifactConsumer } from "./storage/artifact-consumption";
import { createRedisSessionKernelCredentialCreator } from "./storage/credential-creation";
import { createSessionKernelKeyBuilder, encodeIndexMember, parseIndexMember } from "./storage/keys";
import { createRedisSessionKernelObservation } from "./storage/observation";
import { createRedisSessionKernelRevocationTransitions } from "./storage/revocation-transitions";
import { SessionKernelStore } from "./storage/store";

type MaybePromise<T> = Promise<T> | T;
type ProtocolValidationTarget = ClientBinding | IssuedCredential | ProtocolArtifact;

const PRINCIPAL_SESSION_INVENTORY_CHUNK_SIZE = 100;

export type SessionKernelValidationHooks = {
  validateClient?: (object: ProtocolValidationTarget) => MaybePromise<ValidationResult>;
  validateProtocolVersion?: (
    object: ProtocolValidationTarget,
  ) => MaybePromise<ValidationResult>;
};

export type SessionKernelDependencies = {
  redis: SessionKernelRedis;
  config: SessionKernelConfigInput | SessionKernelConfig;
  random?: {
    uuid: () => string;
  };
  validationHooks?: SessionKernelValidationHooks;
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
    ({ redis, keys }) =>
      createRedisSessionKernelArtifactConsumer(redis, keys),
    ({ redis, keys }) =>
      createRedisSessionKernelCredentialCreator(redis, keys),
    ({ redis }) => createRedisSessionKernelRevocationTransitions(redis),
    createRedisSessionKernelObservation,
  );
}

export function createSessionKernelWithStateAdapterFactories(
  deps: SessionKernelDependencies,
  createArtifactConsumer: (input: {
    redis: SessionKernelRedis;
    keys: ReturnType<typeof createSessionKernelKeyBuilder>;
  }) => SessionKernelArtifactConsumer,
  createCredentialCreator: (input: {
    redis: SessionKernelRedis;
    keys: ReturnType<typeof createSessionKernelKeyBuilder>;
  }) => SessionKernelCredentialCreator | undefined,
  createRevocationTransitions: (input: {
    redis: SessionKernelRedis;
    keys: ReturnType<typeof createSessionKernelKeyBuilder>;
  }) => SessionKernelRevocationTransitions,
  createObservation: (redis: SessionKernelRedis) => SessionKernelObservation,
) {
  const config = normalizeSessionKernelConfig(deps.config);
  const keys = createSessionKernelKeyBuilder(config.namespace);
  const artifactConsumer = createArtifactConsumer({
    redis: deps.redis,
    keys,
  });
  const credentialCreator = createCredentialCreator({
    redis: deps.redis,
    keys,
  });
  const revocationTransitions = createRevocationTransitions({
    redis: deps.redis,
    keys,
  });
  const store = new SessionKernelStore(
    deps.redis,
    keys,
    config,
    artifactConsumer,
    credentialCreator,
    revocationTransitions,
    createObservation(deps.redis),
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
      lookup: ReturnType<typeof createCurrentLookupHash>;
      principalSessionId: string;
      window: ReturnType<typeof createPrincipalSessionWindow>;
      principal: PrincipalRef;
    };
    try {
      const now = await store.now();
      const externalToken = generateKernelToken(config, "principalSession");
      const lookup = createCurrentLookupHash(externalToken, config);
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
        lookupKeyId: prepared.lookup.keyId,
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
      return { status: "created", value: session, observedAt: prepared.window.lastActiveAt, externalToken: prepared.externalToken };
    }
    catch (cause) {
      return failClosed("failed to create principal session", cause);
    }
  }

  async function resolvePrincipalSession(externalToken: string) {
    const result = await store.resolveByExternalToken("principal_session", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "principal_session" });
    return result;
  }

  async function resolvePrincipalSessionById(principalSessionId: string) {
    const result = await store.resolveObject("principal_session", principalSessionId);
    observeResolveResult(result, { operation: "resolve_by_id", objectType: "principal_session" });
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
        return await store.resolveObject("principal_session", principalSessionId);
      await renewPrincipalChildren(renewed);
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
      return { status: "created", value: binding, observedAt: now };
    }
    catch (cause) {
      return failClosed("failed to create client binding", cause);
    }
  }

  async function resolveClientBindingById(bindingId: string) {
    const result = await store.resolveObject("client_binding", bindingId);
    observeResolveResult(result, { operation: "resolve_by_id", objectType: "client_binding" });
    if (result.status !== "resolved")
      return result;
    const validation = await validateLifecycleObject(result.value);
    return validation.ok ? result : validation;
  }

  async function issueCredential(input: IssueCredentialInput): Promise<CreateResult<IssuedCredential>> {
    const principal = await resolvePrincipalSessionById(input.principalSessionId);
    if (principal.status !== "resolved")
      return principal;

    try {
      const now = principal.observedAt;
      const externalToken = input.externalToken ?? generateKernelToken(config, input.tokenKind ?? "credential");
      const lookup = createCurrentLookupHash(externalToken, config);
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
        lookupHash: lookup.lookupHash,
        lookupKeyId: lookup.keyId,
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
      if (createResult !== "created")
        return failClosed(credentialCreateFailureMessage(createResult));
      return { status: "created", value: credential, observedAt: now, externalToken };
    }
    catch (cause) {
      return failClosed("failed to issue credential", cause);
    }
  }

  async function resolveCredential(externalToken: string) {
    const result = await store.resolveByExternalToken("credential", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "credential" });
    return await applyCredentialValidation(result);
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
      const lookup = createCurrentLookupHash(externalToken, config);
      const artifactId = input.artifactId ?? uuid();
      if (artifactId.length === 0)
        return failClosed("artifact identity is invalid");
      const artifact: ProtocolArtifact = {
        version: 1,
        subjectContext: principal?.value.subjectContext,
        artifactId,
        protocol: input.protocol,
        artifactType: input.artifactType,
        lookupHash: lookup.lookupHash,
        lookupKeyId: lookup.keyId,
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
        lookupHash: lookup.lookupHash,
        indexes: artifactIndexes(artifact),
      });
      return { status: "created", value: artifact, observedAt: now, externalToken };
    }
    catch (cause) {
      return failClosed("failed to create protocol artifact", cause);
    }
  }

  async function resolveProtocolArtifact(externalToken: string) {
    const result = await store.resolveByExternalToken("artifact", externalToken);
    observeResolveResult(result, { operation: "resolve", objectType: "artifact" });
    return await applyArtifactValidation(result);
  }

  async function consumeProtocolArtifact(externalToken: string): Promise<ResolveResult<ProtocolArtifact>> {
    const stored = await store.resolveArtifactForConsumption(externalToken);
    const resolved: ResolveResult<ProtocolArtifact> = stored.status === "resolved"
      ? {
          status: "resolved",
          value: stored.value,
          observedAt: stored.observedAt,
          lookupKeyId: stored.lookupKeyId,
        }
      : stored;
    observeResolveResult(resolved, { operation: "consume", objectType: "artifact" });
    const result = await applyArtifactValidation(resolved);
    if (result.status !== "resolved") {
      return result;
    }
    const now = result.observedAt;
    const tombstone = createTombstone("artifact", result.value, "consumed", now);
    try {
      if (stored.status !== "resolved")
        return stored;
      return await store.consumeArtifact({
        artifact: result.value,
        serializedArtifact: stored.serialized,
        observedAt: result.observedAt,
        tombstone,
      });
    }
    catch (cause) {
      return failClosed("failed to consume protocol artifact", cause);
    }
  }

  async function revokePrincipalSession(principalSessionId: string, reason: RevocationReason = "logout") {
    const summary = createEmptyRevokeSummary();
    mergeRevokeSummary(summary, await revokePrincipalChildObjects(principalSessionId, reason));
    mergeRevokeSummary(summary, await revokeObject("principal_session", principalSessionId, reason));
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
      continueAfterFailure: false,
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
          continueAfterFailure: true,
        });
      },
    };
  }

  async function revokeUserSessionsMatching(
    principal: PrincipalRef,
    reason: RevocationReason,
    options: RevokeUserSessionsOptions,
    contextScope?: { contexts: ReadonlySet<string>; continueAfterFailure: boolean },
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
        if (contextScope !== undefined) {
          const resolved = await store.resolveObject("principal_session", parsed.id);
          if (
            resolved.status !== "resolved"
            || resolved.value.principal.principalType !== principal.principalType
            || resolved.value.principal.subjectId !== principal.subjectId
            || resolved.value.principalSessionId !== parsed.id
            || resolved.value.subjectContext === undefined
            || !contextScope.contexts.has(resolved.value.subjectContext)
          ) {
            summary.principalSessions.excluded += 1;
            continue;
          }
        }

        if (excludedPrincipalSessionIds.has(parsed.id)) {
          summary.principalSessions.excluded += 1;
          mergeRevokeSummary(summary, await revokePrincipalChildObjects(parsed.id, reason));
          continue;
        }

        mergeRevokeSummary(summary, await revokePrincipalSession(parsed.id, reason));
      }
      catch (error) {
        if (!contextScope?.continueAfterFailure)
          throw error;
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
  ) {
    return await revokeByIndex(keys.index.principal(principalSessionId), reason, kind => kind !== "principal_session");
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
    await runCleanupRefs(result.tombstone.cleanupRefs, cleanupAdapters, summary, deps.logger);
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
  ): Promise<RevokeSummary> {
    const summary = createEmptyRevokeSummary();
    const resolved = await store.resolveObject(kind, id);
    if (resolved.status === "revoked" || resolved.status === "consumed_replay") {
      counterForKind(summary, kind).alreadyRevoked += 1;
      return summary;
    }
    if (resolved.status === "missing_or_expired") {
      counterForKind(summary, kind).missing += 1;
      return summary;
    }
    if (resolved.status !== "resolved") {
      counterForKind(summary, kind).missing += 1;
      return summary;
    }

    const now = resolved.observedAt;
    const tombstone = createTombstone(kind, resolved.value, reason, now);
    const cleanupPending = cleanupPendingIndexForTombstone(tombstone);
    const revokeResult = await store.revokeActiveObject({
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
      await runCleanupRefs(tombstone.cleanupRefs, cleanupAdapters, summary, deps.logger);
      if (cleanupPending && summary.cleanup.failed === failedBeforeCleanup) {
        await store.finalizeCleanupPending({
          tombstone,
          indexKey: cleanupPending.key,
          member: cleanupPending.member,
        });
      }
      logCleanupFailureSummary(tombstone, summary.cleanup.failed - failedBeforeCleanup);
    }
    else if (revokeResult.status === "already_revoked") {
      counterForKind(summary, kind).alreadyRevoked += 1;
    }
    else if (revokeResult.status === "missing") {
      counterForKind(summary, kind).missing += 1;
    }
    else {
      counterForKind(summary, kind).missing += 1;
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

  async function applyCredentialValidation(
    result: ResolveResult<IssuedCredential>,
  ): Promise<ResolveResult<IssuedCredential>> {
    if (result.status !== "resolved")
      return result;
    const validation = await validateLifecycleObject(result.value);
    if (validation.ok)
      return result;
    return validation;
  }

  async function applyArtifactValidation(
    result: ResolveResult<ProtocolArtifact>,
  ): Promise<ResolveResult<ProtocolArtifact>> {
    if (result.status !== "resolved")
      return result;
    const validation = await validateLifecycleObject(result.value);
    if (validation.ok)
      return result;
    return validation;
  }

  async function validateLifecycleObject(object: ClientBinding | IssuedCredential | ProtocolArtifact) {
    let validation: ValidationResult = { ok: true };
    if (deps.validationHooks?.validateClient) {
      validation = await deps.validationHooks.validateClient(object);
      if (!validation.ok)
        return await validationFailure(object, validation);
    }
    if (deps.validationHooks?.validateProtocolVersion) {
      validation = await deps.validationHooks.validateProtocolVersion(object);
      if (!validation.ok)
        return await validationFailure(object, validation);
    }
    return { ok: true as const };
  }

  async function validationFailure(
    object: ClientBinding | IssuedCredential | ProtocolArtifact,
    failure: Extract<ValidationResult, { ok: false }>,
  ) {
    const clientCode = "clientCode" in object ? object.clientCode : undefined;
    const cleanup = clientCode
      ? async () => await revokeClientProtocol(clientCode, object.protocol, failure.reason)
      : undefined;
    const revokeSummary = cleanup === undefined
      ? createEmptyRevokeSummary()
      : await runValidationCleanup(object, failure, cleanup);
    return {
      ok: false as const,
      status: "validation_failed" as const,
      reason: failure.reason,
      message: failure.message,
      revokeSummary,
    };
  }

  async function runValidationCleanup(
    object: PrincipalSession | ClientBinding | IssuedCredential | ProtocolArtifact,
    failure: Extract<ValidationResult, { ok: false }>,
    cleanup: () => Promise<RevokeSummary>,
  ): Promise<RevokeSummary> {
    try {
      return await cleanup();
    }
    catch (error) {
      try {
        deps.logger?.warn?.({
          event: SessionKernelLogEvent.RevokeCleanupFailed,
          sourceApp: deps.sourceApp ?? "session-kernel",
          kind: "validation_cleanup",
          refType: lifecycleObjectKind(object),
          reason: failure.reason,
          protocol: "protocol" in object ? object.protocol : undefined,
          clientCode: "clientCode" in object ? object.clientCode : undefined,
          errorName: error instanceof Error ? error.name : "Error",
        }, "session kernel validation cleanup failed");
      }
      catch {
        // Validation classification must survive telemetry failures as well.
      }
      return createEmptyRevokeSummary();
    }
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
    revokeUserSessionRecords,
    revokeUserSessionsByContext,
    prepareUserSessionRevocationByContext,
    inventoryClientProtocol,
    revokeClientProtocol,
    revokeClient,
    revokePrincipalObjects,
    revokeBindingObjects,
    revokeProtocol,
  };
}

function credentialCreateFailureMessage(
  result: Exclude<CredentialCreateResult, "created">,
) {
  switch (result) {
    case "active_identity_conflict":
      return "credential identity is already active";
    case "identity_tombstoned":
      return "credential identity is revoked";
    case "lookup_owned":
      return "credential bearer token is already owned";
    case "lookup_tombstoned":
      return "credential bearer token is revoked";
  }
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
