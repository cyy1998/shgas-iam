import type { CleanupAdapter, SessionKernelLogger } from "./cleanup";
import type { SessionKernelConfig, SessionKernelConfigInput } from "./config";
import type {
  CleanupRef,
  ClientBinding,
  IssuedCredential,
  LifecycleObject,
  LifecycleObjectKind,
  PrincipalRef,
  PrincipalSession,
  PrincipalSnapshot,
  ProtocolArtifact,
  RenewalPolicy,
  RevocationReason,
  RevokedTombstone,
  RevokeSummary,
  ValidationResult,
} from "./model";
import type { CreateResult, ResolveResult } from "./result";
import type { SessionKernelRedis, StoreIndexWrite } from "./store";
import type { KernelTokenKind } from "./token";
import { randomUUID } from "node:crypto";
import { runCleanupRefs } from "./cleanup";
import { normalizeSessionKernelConfig } from "./config";
import { createCurrentLookupHash } from "./hmac";
import { createSessionKernelKeyBuilder, encodeIndexMember, parseIndexMember } from "./keys";
import { counterForKind, createEmptyRevokeSummary, failClosed, mergeRevokeSummary } from "./result";
import { SessionKernelStore } from "./store";
import {
  calculateRenewedPrincipalSessionWindow,
  calculateTombstoneExpiresAt,
  canRenewWithPrincipal,
  clampDerivedExpiresAt,
  createPrincipalSessionWindow,
} from "./time";
import { generateKernelToken } from "./token";

type MaybePromise<T> = Promise<T> | T;
type PrincipalValidationTarget = PrincipalSession | ClientBinding | IssuedCredential;
type ProtocolValidationTarget = ClientBinding | IssuedCredential | ProtocolArtifact;

export type SessionKernelValidationHooks = {
  validatePrincipal?: (session: PrincipalValidationTarget) => MaybePromise<ValidationResult>;
  validateClient?: (object: ProtocolValidationTarget) => MaybePromise<ValidationResult>;
  validateProtocolVersion?: (
    object: ProtocolValidationTarget,
  ) => MaybePromise<ValidationResult>;
};

export type SessionKernelDependencies = {
  redis: SessionKernelRedis;
  config: SessionKernelConfigInput | SessionKernelConfig;
  validationHooks?: SessionKernelValidationHooks;
  cleanupAdapters?: CleanupAdapter[];
  logger?: SessionKernelLogger;
};

export type CreatePrincipalSessionInput = {
  principal: PrincipalRef;
  snapshot: PrincipalSnapshot;
  sessionKind?: string;
  amr?: string[];
  acr?: string;
  tenantId?: string;
  issuerId?: string;
  metadata?: Record<string, unknown>;
  cleanupRefs?: CleanupRef[];
  externalToken?: string;
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

export type SessionKernel = ReturnType<typeof createSessionKernel>;

export function createSessionKernel(deps: SessionKernelDependencies) {
  const config = normalizeSessionKernelConfig(deps.config);
  const keys = createSessionKernelKeyBuilder(config.namespace);
  const store = new SessionKernelStore(deps.redis, keys, config);
  const cleanupAdapters = deps.cleanupAdapters ?? [];

  async function createPrincipalSession(
    input: CreatePrincipalSessionInput,
  ): Promise<CreateResult<PrincipalSession>> {
    try {
      const now = config.clock.now();
      const externalToken = input.externalToken ?? generateKernelToken(config, "principalSession");
      const lookup = createCurrentLookupHash(externalToken, config);
      const principalSessionId = randomUUID();
      const window = createPrincipalSessionWindow(now, config);
      const session: PrincipalSession = {
        version: 1,
        sessionKind: input.sessionKind ?? "browser_user",
        principalSessionId,
        externalTokenLookupHash: lookup.lookupHash,
        lookupKeyId: lookup.keyId,
        principal: input.principal,
        authTime: window.authTime,
        lastActiveAt: window.lastActiveAt,
        expiresAt: window.expiresAt,
        absoluteExpiresAt: window.absoluteExpiresAt,
        amr: input.amr ?? [],
        acr: input.acr,
        snapshot: input.snapshot,
        tenantId: input.tenantId,
        issuerId: input.issuerId,
        metadata: input.metadata,
        cleanupRefs: input.cleanupRefs ?? [],
      };
      await store.putObject({
        kind: "principal_session",
        id: principalSessionId,
        object: session,
        lookupHash: lookup.lookupHash,
        indexes: principalSessionIndexes(session),
      });
      return { status: "created", value: session, externalToken };
    }
    catch (cause) {
      return failClosed("failed to create principal session", cause);
    }
  }

  async function resolvePrincipalSession(externalToken: string) {
    const result = await store.resolveByExternalToken("principal_session", externalToken);
    return await applyPrincipalValidation(result);
  }

  async function resolvePrincipalSessionById(principalSessionId: string) {
    const result = await store.resolveObject("principal_session", principalSessionId);
    return await applyPrincipalValidation(result);
  }

  async function renewPrincipalSession(principalSessionId: string): Promise<ResolveResult<PrincipalSession>> {
    const result = await store.resolveObject("principal_session", principalSessionId);
    if (result.status !== "resolved")
      return result;
    const now = config.clock.now();
    const window = calculateRenewedPrincipalSessionWindow(result.value, now, config);
    if (!window)
      return { status: "missing_or_expired" };
    const renewed: PrincipalSession = {
      ...result.value,
      lastActiveAt: window.lastActiveAt,
      expiresAt: window.expiresAt,
    };
    try {
      await store.updateObject({
        kind: "principal_session",
        id: renewed.principalSessionId,
        object: renewed,
        indexes: principalSessionIndexes(renewed),
      });
      await renewPrincipalChildren(renewed);
      return { status: "resolved", value: renewed };
    }
    catch (cause) {
      return failClosed("failed to renew principal session", cause);
    }
  }

  async function createClientBinding(input: CreateClientBindingInput): Promise<CreateResult<ClientBinding>> {
    try {
      const principal = await store.resolveObject("principal_session", input.principalSessionId);
      if (principal.status !== "resolved")
        return failClosed("cannot create client binding for inactive principal session", principal);
      const now = config.clock.now();
      const expiresAt = clampDerivedExpiresAt({
        now,
        ttlMs: input.ttlMs,
        expiresAt: input.expiresAt,
        principalSession: principal.value,
      });
      const binding: ClientBinding = {
        version: 1,
        bindingId: randomUUID(),
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
      return { status: "created", value: binding };
    }
    catch (cause) {
      return failClosed("failed to create client binding", cause);
    }
  }

  async function resolveClientBindingById(bindingId: string) {
    const result = await store.resolveObject("client_binding", bindingId);
    if (result.status !== "resolved")
      return result;
    const validation = await validateLifecycleObject(result.value);
    return validation.ok ? result : validation;
  }

  async function issueCredential(input: IssueCredentialInput): Promise<CreateResult<IssuedCredential>> {
    try {
      const principal = await store.resolveObject("principal_session", input.principalSessionId);
      if (principal.status !== "resolved")
        return failClosed("cannot issue credential for inactive principal session", principal);
      const now = config.clock.now();
      const externalToken = input.externalToken ?? generateKernelToken(config, input.tokenKind ?? "credential");
      const lookup = createCurrentLookupHash(externalToken, config);
      if (await store.hasLookupTombstone("credential", lookup.lookupHash))
        return failClosed("credential lookup hash is revoked");
      const expiresAt = clampDerivedExpiresAt({
        now,
        ttlMs: input.ttlMs,
        expiresAt: input.expiresAt,
        principalSession: principal.value,
      });
      const credential: IssuedCredential = {
        version: 1,
        credentialId: randomUUID(),
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
      await store.putObject({
        kind: "credential",
        id: credential.credentialId,
        object: credential,
        lookupHash: lookup.lookupHash,
        indexes: credentialIndexes(credential),
      });
      return { status: "created", value: credential, externalToken };
    }
    catch (cause) {
      return failClosed("failed to issue credential", cause);
    }
  }

  async function resolveCredential(externalToken: string) {
    const result = await store.resolveByExternalToken("credential", externalToken);
    return await applyCredentialValidation(result);
  }

  async function createProtocolArtifact(input: CreateProtocolArtifactInput): Promise<CreateResult<ProtocolArtifact>> {
    try {
      const principal = input.principalSessionId
        ? await store.resolveObject("principal_session", input.principalSessionId)
        : undefined;
      if (principal && principal.status !== "resolved")
        return failClosed("cannot create protocol artifact for inactive principal session", principal);
      const now = config.clock.now();
      const externalToken = input.externalToken ?? generateKernelToken(config, input.tokenKind ?? "artifact");
      const lookup = createCurrentLookupHash(externalToken, config);
      const artifact: ProtocolArtifact = {
        version: 1,
        artifactId: randomUUID(),
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
      return { status: "created", value: artifact, externalToken };
    }
    catch (cause) {
      return failClosed("failed to create protocol artifact", cause);
    }
  }

  async function resolveProtocolArtifact(externalToken: string) {
    const result = await store.resolveByExternalToken("artifact", externalToken);
    return await applyArtifactValidation(result);
  }

  async function consumeProtocolArtifact(externalToken: string): Promise<ResolveResult<ProtocolArtifact>> {
    const result = await resolveProtocolArtifact(externalToken);
    if (result.status !== "resolved")
      return result;
    const now = config.clock.now();
    const tombstone = createTombstone("artifact", result.value, "consumed", now);
    try {
      return await store.consumeArtifact({ artifact: result.value, tombstone });
    }
    catch (cause) {
      return failClosed("failed to consume protocol artifact", cause);
    }
  }

  async function revokePrincipalSession(principalSessionId: string, reason: RevocationReason = "logout") {
    const summary = createEmptyRevokeSummary();
    const members = await store.readIndex(keys.index.principal(principalSessionId));
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (!parsed || parsed.kind === "principal_session")
        continue;
      mergeRevokeSummary(summary, await revokeObject(parsed.kind, parsed.id, reason));
    }
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

  async function revokeUserSessions(principal: PrincipalRef, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.user(principal), reason, kind => kind === "principal_session");
  }

  async function revokeClientProtocol(clientCode: string, protocol: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.clientProtocol(clientCode, protocol), reason);
  }

  async function revokeClient(clientCode: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.client(clientCode), reason);
  }

  async function revokePrincipalObjects(principalSessionId: string, reason: RevocationReason = "admin_revoke") {
    return await revokeByIndex(keys.index.principal(principalSessionId), reason);
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
  ) {
    const summary = createEmptyRevokeSummary();
    const members = await store.readIndex(key);
    for (const member of members) {
      const parsed = parseIndexMember(member);
      if (parsed && filter(parsed.kind))
        mergeRevokeSummary(summary, await revokeObject(parsed.kind, parsed.id, reason));
    }
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

    const now = config.clock.now();
    const tombstone = createTombstone(kind, resolved.value, reason, now);
    const revokeResult = await store.revokeActiveObject({
      kind,
      id,
      lookupHash: lookupHashForObject(resolved.value),
      tombstone,
      indexRemovals: indexRemovalsForObject(kind, resolved.value),
    });

    if (revokeResult.status === "revoked") {
      counterForKind(summary, kind).revoked += 1;
      await runCleanupRefs(tombstone.cleanupRefs, cleanupAdapters, summary, deps.logger);
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
      const result = await store.resolveObject(parsed.kind, parsed.id);
      if (result.status !== "resolved" || !canRenewWithPrincipal(result.value.renewalPolicy))
        continue;
      const next = {
        ...result.value,
        expiresAt: Math.min(principal.expiresAt, principal.absoluteExpiresAt),
      };
      if (parsed.kind === "client_binding") {
        await store.updateObject({
          kind: "client_binding",
          id: parsed.id,
          object: next as ClientBinding,
          indexes: clientBindingIndexes(next as ClientBinding),
        });
      }
      else {
        await store.updateObject({
          kind: "credential",
          id: parsed.id,
          object: next as IssuedCredential,
          indexes: credentialIndexes(next as IssuedCredential),
        });
      }
    }
  }

  async function applyPrincipalValidation<T extends PrincipalSession>(
    result: ResolveResult<T>,
  ): Promise<ResolveResult<T>> {
    if (result.status !== "resolved" || !deps.validationHooks?.validatePrincipal)
      return result;
    const validation = await deps.validationHooks.validatePrincipal(result.value);
    if (validation.ok)
      return result;
    const revokeSummary = await revokeUserSessions(result.value.principal, validation.reason);
    return { status: "validation_failed", reason: validation.reason, message: validation.message, revokeSummary };
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
    const validations = [
      deps.validationHooks?.validatePrincipal && "principal" in object && object.principal
        ? await deps.validationHooks.validatePrincipal(object as ClientBinding | IssuedCredential)
        : undefined,
      deps.validationHooks?.validateClient ? await deps.validationHooks.validateClient(object) : undefined,
      deps.validationHooks?.validateProtocolVersion
        ? await deps.validationHooks.validateProtocolVersion(object)
        : undefined,
    ].filter((item): item is Exclude<typeof item, undefined> => item !== undefined);

    const failure = validations.find(item => !item.ok);
    if (!failure)
      return { ok: true as const };

    let revokeSummary: RevokeSummary;
    if (failure.reason === "user_disabled" || failure.reason === "user_deleted") {
      revokeSummary = "principal" in object && object.principal
        ? await revokeUserSessions(object.principal, failure.reason)
        : createEmptyRevokeSummary();
    }
    else if (failure.reason === "client_disabled" || failure.reason === "client_deleted") {
      revokeSummary = "clientCode" in object && object.clientCode
        ? await revokeClientProtocol(object.clientCode, object.protocol, failure.reason)
        : createEmptyRevokeSummary();
    }
    else {
      revokeSummary = "clientCode" in object && object.clientCode
        ? await revokeClientProtocol(object.clientCode, object.protocol, failure.reason)
        : createEmptyRevokeSummary();
    }
    return {
      status: "validation_failed" as const,
      reason: failure.reason,
      message: failure.message,
      revokeSummary,
    };
  }

  function principalSessionIndexes(session: PrincipalSession): StoreIndexWrite[] {
    return [
      {
        key: keys.index.user(session.principal),
        score: session.expiresAt,
        member: encodeIndexMember("principal_session", session.principalSessionId),
      },
      {
        key: keys.index.principal(session.principalSessionId),
        score: session.expiresAt,
        member: encodeIndexMember("principal_session", session.principalSessionId),
      },
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
    };
  }

  return {
    config,
    keys,
    createPrincipalSession,
    resolvePrincipalSession,
    resolvePrincipalSessionById,
    renewPrincipalSession,
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
    revokeUserSessions,
    revokeClientProtocol,
    revokeClient,
    revokePrincipalObjects,
    revokeBindingObjects,
    revokeProtocol,
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
