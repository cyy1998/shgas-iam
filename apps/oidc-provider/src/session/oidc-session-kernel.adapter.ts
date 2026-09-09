import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { OidcAccountDto } from "@iam/domain/user";
import type {
  CleanupAdapter,
  ClientBinding,
  IssuedCredential,
  PrincipalSession,
  ProtocolArtifact,
  RevokeSummary,
  SessionKernel,
} from "@iam/session-kernel";
import type { IncomingMessage } from "node:http";
import type { AdapterPayload } from "oidc-provider";
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import type { OidcReturnHandlePayload } from "../interaction/return-handle.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { OidcClientRuntimeMetadata } from "../provider/client/client-runtime-metadata.ts";
import type {
  ProviderSessionBinding,
  ProviderSessionBindingLookup,
  ProviderSessionLifecycleFence,
  ProviderSessionPrincipalAnchor,
  ProviderSessionPublicationResult,
  StagedProviderSessionBinding,
} from "./provider-session.ts";
import { createHash, randomUUID } from "node:crypto";
import {
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { errors } from "oidc-provider";
import { z } from "zod";
import { getCookieValue } from "../interaction/global-session.ts";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
import { OidcOnlineAccessUnavailableError } from "../provider/client/client-traffic-gate.ts";
import { markGlobalSessionCookieError } from "./global-session-error-provenance.ts";

const returnHandleObservations = new WeakMap<OidcReturnHandlePayload, ProtocolArtifact>();

export const OIDC_SESSION_PROTOCOL = "oidc";
export const OIDC_RETURN_HANDLE_ARTIFACT_TYPE = "login_return_handle";
export const OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE = "authorization_code";
export const OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE = "access_token";
export const OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND = "provider_session_uid_mapping";
export const OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND = "provider_token_payload";
export const OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND = "provider_model_payload";

const ProviderSessionMappingCleanupMetadataSchema = z.object({
  anchorGeneration: z.string().min(1).optional(),
  clientCode: z.string().min(1),
  mappingOwnerId: z.string().min(1).optional(),
});

const ReturnHandleMetadataSchema = z.object({
  interactionUid: z.string().min(1),
  clientId: z.string().min(1),
  oidcConfigVersion: z.number().int().nonnegative(),
  browserBinding: z.string().min(1),
  returnTarget: z.string().min(1),
});

const AuthorizationCodeMetadataSchema = z.object({
  providerCodeId: z.string().min(1),
  clientId: z.string().min(1),
  oidcConfigVersion: z.number().int().nonnegative(),
}).passthrough();

const AccessTokenMetadataSchema = z.object({
  authTime: z.number().int().nonnegative(),
  providerTokenKey: z.string().min(1),
  providerTokenId: z.string().min(1),
  oidcConfigVersion: z.number().int().nonnegative(),
});

export interface OidcSessionKernelAccountReader {
  findBySubject: (subjectIdentifier: string) => Promise<OidcAccountDto | null>;
}

export interface OidcSessionKernelClientReader {
  findRuntime: (clientId: string) => Promise<OidcClientRuntimeMetadata | null>;
  findActiveVersion: (clientId: string) => Promise<number | null>;
}

export interface OidcSessionKernelProviderSessionStateStore {
  claim: (input: {
    accountId: string;
    authorizationAttemptId: string;
    clientCode: string;
    providerSessionUid: string;
  }) => Promise<StagedProviderSessionBinding | null>;
  deleteOwned: (input: {
    anchorGeneration?: string;
    clientCode: string;
    mappingOwnerId?: string;
    providerSessionUid: string;
  }) => Promise<unknown>;
  destroyProviderSession: (
    providerSessionUid: string,
    expected?: ProviderSessionLifecycleFence,
  ) => Promise<boolean>;
  publishClientBinding: (input: {
    anchor: ProviderSessionPrincipalAnchor;
    binding: ProviderSessionBinding;
    expectedLookup: ProviderSessionBindingLookup | null;
    providerSessionUid: string;
    expiresAt: number;
  }) => Promise<ProviderSessionPublicationResult>;
  publishRebind: (input: {
    attemptId: string;
    binding: ProviderSessionBinding;
    expectedAnchorGeneration: string | null;
    providerSessionUid: string;
    expiresAt: number;
  }) => Promise<ProviderSessionPublicationResult>;
  readAnchor: (sessionUid: string) => Promise<ProviderSessionPrincipalAnchor | null>;
  readLookup: (sessionUid: string, clientCode: string) => Promise<{
    exists: boolean;
    value: ProviderSessionBindingLookup | null;
  }>;
  readStaged: (authorizationAttemptId: string) => Promise<StagedProviderSessionBinding | null>;
  refresh: (input: {
    binding: ProviderSessionBinding;
    providerSessionUid: string;
    expiresAt: number;
  }) => Promise<boolean>;
  stage: (staged: StagedProviderSessionBinding, expiresAt: number) => Promise<void>;
}

export interface OidcSessionKernelAdapterDeps {
  kernel: SessionKernel;
  providerSessionState: OidcSessionKernelProviderSessionStateStore;
  logger: Pick<OidcLogger, "warn">;
  accounts: OidcSessionKernelAccountReader;
  clients: OidcSessionKernelClientReader;
  cookieName: string;
  traffic?: { check: (clientCode: string) => Promise<ClientTrafficGateResult> };
  permit?: (object: ClientBinding | IssuedCredential | ProtocolArtifact) => Promise<void>;
}

export interface ProviderSessionBindingContext {
  authorizationAttemptId?: string;
  clientId: string;
  oidcConfigVersion: number;
  providerSessionUid?: string | null;
}

export interface RegisterAuthorizationCodeArtifactInput {
  providerCodeId: string;
  payload: AdapterPayload;
  expiresIn: number;
  binding: ProviderSessionBinding | null;
}

export interface RegisterAccessTokenCredentialInput {
  providerTokenId: string;
  providerTokenKey: string;
  payload: AdapterPayload;
  expiresIn: number;
  binding: ProviderSessionBinding | null;
}

export type OidcAccessTokenExtraWithKernel = {
  kernelCredentialId?: string;
};

export function createOidcSessionKernelCleanupAdapter(
  deps: {
    providerSessionState: Pick<OidcSessionKernelProviderSessionStateStore, "deleteOwned">;
  },
): CleanupAdapter[] {
  return [
    {
      protocol: OIDC_SESSION_PROTOCOL,
      kind: OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND,
      async cleanup(refs) {
        await Promise.all(refs.map(async (ref) => {
          const { anchorGeneration, clientCode, mappingOwnerId }
            = ProviderSessionMappingCleanupMetadataSchema.parse(ref.metadata);
          await deps.providerSessionState.deleteOwned({
            anchorGeneration,
            clientCode,
            mappingOwnerId,
            providerSessionUid: ref.ref,
          });
        }));
      },
    },
    {
      protocol: OIDC_SESSION_PROTOCOL,
      kind: OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
      async cleanup(refs, execution) {
        await execution.deleteOwnedKeys(refs.map(ref => ref.ref));
      },
    },
    {
      protocol: OIDC_SESSION_PROTOCOL,
      kind: OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND,
      async cleanup(refs, execution) {
        await execution.deleteOwnedKeys(refs.flatMap(ref => [ref.ref, consumedProviderModelKey(ref.ref)]));
      },
    },
  ];
}

export type OidcSessionLifecycle = Pick<SessionKernel, | "consumeProtocolArtifact"
  | "createClientBinding"
  | "createProtocolArtifact"
  | "issueCredential"
  | "renewPrincipalSession"
  | "resolveClientBindingById"
  | "resolveCredential"
  | "resolvePrincipalSession"
  | "resolvePrincipalSessionById"
  | "resolveProtocolArtifact"
  | "revokeObservedObject"
  | "revokeBinding"
  | "revokeClientProtocol"
  | "revokeCredential"
  | "revokePrincipalSession">;

export function createOidcSessionKernelAdapter(
  deps: Omit<OidcSessionKernelAdapterDeps, "kernel"> & { kernel: OidcSessionLifecycle },
) {
  const providerSessionState = deps.providerSessionState;
  const codeObservations = new Map<string, { remainingSeconds: number; artifact: ProtocolArtifact; serializedProviderCode: string }>();
  async function inspect(request: Pick<IncomingMessage, "headers">) {
    const externalToken = getCookieValue(request.headers.cookie, deps.cookieName);
    if (!externalToken)
      return { status: "absent" as const };
    try {
      const principal = await deps.kernel.resolvePrincipalSession(externalToken);
      if (principal.status === "fail_closed") {
        throw new SubjectAccessUnavailableError(principal.cause);
      }
      if (principal.status !== "resolved")
        return { status: "invalid" as const };
      return { status: "valid" as const };
    }
    catch (error) {
      if (error instanceof SubjectAccessDisabledError)
        return { status: "invalid" as const };
      throw markGlobalSessionCookieError(error);
    }
  }

  async function resolve(request: Pick<IncomingMessage, "headers">): Promise<ResolvedGlobalSession | null> {
    const externalToken = getCookieValue(request.headers.cookie, deps.cookieName);
    if (!externalToken)
      return null;
    try {
      const principal = await deps.kernel.resolvePrincipalSession(externalToken);
      if (principal.status !== "resolved")
        return null;
      return await toResolvedGlobalSession(principal.value);
    }
    catch (error) {
      throw markGlobalSessionCookieError(error);
    }
  }

  async function resolveById(principalSessionId: string): Promise<ResolvedGlobalSession | null> {
    const principal = await deps.kernel.resolvePrincipalSessionById(principalSessionId);
    return principal.status === "resolved" ? await toResolvedGlobalSession(principal.value) : null;
  }

  async function renew(principalSessionId: string) {
    const principal = await deps.kernel.renewPrincipalSession(principalSessionId);
    if (principal.status === "fail_closed")
      throw new SubjectAccessUnavailableError(principal.cause);
    return principal.status === "resolved";
  }

  async function bindAndPublish(
    sessionUid: string,
    session: ResolvedGlobalSession,
    context: ProviderSessionBindingContext,
    publication: {
      kind: "rebind";
      attemptId: string;
      expectedAnchorGeneration: string | null;
    } | {
      kind: "client";
      anchor: ProviderSessionPrincipalAnchor;
    },
  ): Promise<ProviderSessionBinding | null> {
    const existingLookup = await providerSessionState.readLookup(sessionUid, context.clientId);
    if (existingLookup.exists && !existingLookup.value) {
      deps.logger.warn({ sessionUid }, "invalid OIDC provider session binding lookup");
      return null;
    }
    const mappingOwnerId = randomUUID();
    const anchorGeneration = publication.kind === "rebind"
      ? publication.attemptId
      : publication.anchor.generation;
    const binding = await deps.kernel.createClientBinding({
      principalSessionId: session.sessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: context.clientId,
      renewalPolicy: "extend_with_principal",
      metadata: {
        anchorGeneration,
        mappingOwnerId,
        providerSessionUid: sessionUid,
        oidcConfigVersion: context.oidcConfigVersion,
      },
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND,
        ref: sessionUid,
        metadata: { anchorGeneration, clientCode: context.clientId, mappingOwnerId },
      }],
    });
    if (binding.status !== "created")
      return null;

    const mapped = toProviderSessionBinding(binding.value, session);
    const expiresAt = binding.value.expiresAt;
    const published = publication.kind === "rebind"
      ? await providerSessionState.publishRebind({
          attemptId: publication.attemptId,
          binding: mapped,
          expectedAnchorGeneration: publication.expectedAnchorGeneration,
          providerSessionUid: sessionUid,
          expiresAt,
        })
      : await providerSessionState.publishClientBinding({
          anchor: publication.anchor,
          binding: mapped,
          expectedLookup: existingLookup.value,
          providerSessionUid: sessionUid,
          expiresAt,
        });
    if (published.status === "unknown") {
      deps.logger.warn({ err: published.error, sessionUid }, "OIDC provider session binding publish outcome is unknown");
      return null;
    }
    if (published.status === "conflict") {
      await deps.kernel.revokeBinding(binding.value.bindingId, "binding_invalid");
      return null;
    }
    if (existingLookup.value?.bindingId && existingLookup.value.bindingId !== mapped.bindingId) {
      const revoked = await deps.kernel.revokeBinding(existingLookup.value.bindingId, "binding_invalid");
      if (revoked.cleanup.failed) {
        deps.logger.warn({
          bindingId: existingLookup.value.bindingId,
          sessionUid,
          cleanupFailures: revoked.cleanup.failures,
        }, "failed to clean replaced OIDC provider session binding");
      }
    }
    return mapped;
  }

  async function stage(session: ResolvedGlobalSession, context: ProviderSessionBindingContext) {
    if (!context.authorizationAttemptId)
      return null;
    const expiresAt = await principalSessionExpiresAt(session.sessionId);
    if (expiresAt === null)
      return null;
    const anchor = context.providerSessionUid
      ? await providerSessionState.readAnchor(context.providerSessionUid)
      : null;
    if (anchor && anchor.accountId !== session.accountId)
      return null;
    const staged = {
      accountId: session.accountId,
      authorizationAttemptId: context.authorizationAttemptId,
      authTime: session.authTime,
      clientCode: context.clientId,
      expectedAnchorGeneration: anchor?.generation ?? null,
      expiresAt: Math.floor(expiresAt / 1000),
      oidcConfigVersion: context.oidcConfigVersion,
      principalSessionId: session.sessionId,
      providerSessionUid: context.providerSessionUid ?? null,
    };
    await providerSessionState.stage(
      staged,
      expiresAt,
    );
    return {
      principalSessionId: session.sessionId,
      bindingId: "pending",
      clientCode: context.clientId,
      accountId: session.accountId,
      authTime: session.authTime,
      oidcConfigVersion: context.oidcConfigVersion,
      expiresAt: Math.floor(expiresAt / 1000),
      anchorGeneration: context.authorizationAttemptId,
    };
  }

  async function consumeStaged(input: {
    accountId: string;
    authorizationAttemptId: string;
    clientCode: string;
    providerSessionUid: string;
  }) {
    const staged = await providerSessionState.claim(input);
    if (!staged)
      return null;
    const activeVersion = await deps.clients.findActiveVersion(staged.clientCode);
    if (activeVersion !== staged.oidcConfigVersion)
      return null;
    const binding = await bindAndPublish(input.providerSessionUid, {
      sessionId: staged.principalSessionId,
      authTime: staged.authTime,
      accountId: staged.accountId,
    }, {
      clientId: staged.clientCode,
      oidcConfigVersion: staged.oidcConfigVersion,
    }, {
      kind: "rebind",
      attemptId: staged.authorizationAttemptId,
      expectedAnchorGeneration: staged.expectedAnchorGeneration,
    });
    if (!binding)
      throw new Error("OIDC staged Provider Session binding commit failed");
    return binding;
  }

  async function ensureClientBinding(input: {
    accountId: string;
    anchorGeneration: string;
    clientCode: string;
    oidcConfigVersion: number;
    principalSessionId: string;
    providerSessionUid: string;
  }) {
    const activeVersion = await deps.clients.findActiveVersion(input.clientCode);
    if (activeVersion !== input.oidcConfigVersion)
      return null;
    const anchor = await readPrincipalAnchor(input.providerSessionUid, input.accountId);
    if (!anchor
      || anchor.generation !== input.anchorGeneration
      || anchor.principalSessionId !== input.principalSessionId) {
      return null;
    }
    const existing = await readForAuthorization(input.providerSessionUid, input.clientCode);
    if (existing
      && existing.accountId === input.accountId
      && existing.anchorGeneration === input.anchorGeneration
      && existing.principalSessionId === input.principalSessionId
      && existing.oidcConfigVersion === input.oidcConfigVersion) {
      return existing;
    }
    const principal = await resolveById(input.principalSessionId);
    if (!principal || principal.accountId !== input.accountId)
      return null;
    return await bindAndPublish(input.providerSessionUid, principal, {
      clientId: input.clientCode,
      oidcConfigVersion: input.oidcConfigVersion,
    }, {
      anchor,
      kind: "client",
    });
  }

  async function readPrincipalAnchor(sessionUid: string, accountId: string) {
    const anchor = await providerSessionState.readAnchor(sessionUid);
    return anchor?.accountId === accountId ? anchor : null;
  }

  function matchesStagedPrincipal(
    staged: StagedProviderSessionBinding | null,
    authorizationAttemptId: string,
    clientId: string,
    session: ResolvedGlobalSession,
  ): staged is StagedProviderSessionBinding {
    return staged?.accountId === session.accountId
      && staged.authorizationAttemptId === authorizationAttemptId
      && staged.clientCode === clientId
      && staged.principalSessionId === session.sessionId;
  }

  async function destroyProviderSession(
    sessionUid: string,
    expected?: ProviderSessionLifecycleFence,
  ) {
    return await providerSessionState.destroyProviderSession(sessionUid, expected);
  }

  async function isCurrentOrStagedPrincipal(
    sessionUid: string,
    clientId: string,
    session: ResolvedGlobalSession,
    authorizationAttemptId: string | null,
  ) {
    const anchor = await readPrincipalAnchor(sessionUid, session.accountId);
    if (anchor?.principalSessionId === session.sessionId)
      return true;
    if (!authorizationAttemptId)
      return false;
    const staged = await providerSessionState.readStaged(authorizationAttemptId);
    if (!matchesStagedPrincipal(
      staged,
      authorizationAttemptId,
      clientId,
      session,
    )) {
      return false;
    }
    return staged.providerSessionUid === null
      || staged.providerSessionUid === sessionUid;
  }

  async function isStagedPrincipal(
    authorizationAttemptId: string,
    clientId: string,
    session: ResolvedGlobalSession,
  ) {
    const staged = await providerSessionState.readStaged(authorizationAttemptId);
    return matchesStagedPrincipal(
      staged,
      authorizationAttemptId,
      clientId,
      session,
    );
  }

  async function readValidatedBinding(sessionUid: string, clientCode: string) {
    const lookup = await providerSessionState.readLookup(sessionUid, clientCode);
    if (!lookup.exists)
      return null;
    const parsedLookup = lookup.value;
    if (!parsedLookup) {
      deps.logger.warn({
        sessionUidFingerprint: fingerprintForLog(sessionUid),
      }, "invalid OIDC provider session binding lookup");
      return null;
    }
    const binding = await deps.kernel.resolveClientBindingById(parsedLookup.bindingId, { protocol: OIDC_SESSION_PROTOCOL, clientCode });
    if (binding.status !== "resolved") {
      deps.logger.warn({
        sessionUidFingerprint: fingerprintForLog(sessionUid),
        bindingId: parsedLookup.bindingId,
        status: binding.status,
      }, "failed to resolve OIDC provider session binding");
      return null;
    }
    if (!parsedLookup.mappingOwnerId
      || binding.value.protocol !== OIDC_SESSION_PROTOCOL
      || binding.value.clientCode !== clientCode
      || binding.value.metadata?.providerSessionUid !== sessionUid
      || binding.value.metadata?.mappingOwnerId !== parsedLookup.mappingOwnerId) {
      deps.logger.warn({
        sessionUidFingerprint: fingerprintForLog(sessionUid),
        bindingId: parsedLookup.bindingId,
        expectedClientCode: clientCode,
        actualClientCode: binding.value.clientCode,
      }, "OIDC provider session binding owner mismatch");
      return null;
    }
    const expectedAnchor = await readPrincipalAnchor(sessionUid, binding.value.principal.subjectId);
    if (!expectedAnchor || expectedAnchor.generation !== binding.value.metadata?.anchorGeneration
      || expectedAnchor.principalSessionId !== binding.value.principalSessionId) {
      return null;
    }
    if (!await validateProtocolObject(binding.value))
      return null;
    await deps.permit?.(binding.value);
    return binding.value;
  }

  async function readForAuthorization(sessionUid: string, clientCode: string): Promise<ProviderSessionBinding | null> {
    const binding = await readValidatedBinding(sessionUid, clientCode);
    if (!binding)
      return null;
    const principal = await resolveById(binding.principalSessionId);
    if (!principal || principal.accountId !== binding.principal.subjectId
      || principal.authTime !== Math.floor(binding.authTime / 1000)) {
      return null;
    }
    return await deliverProviderBinding(sessionUid, binding, principal.accountId);
  }

  async function readForAccessToken(sessionUid: string, clientCode: string): Promise<ProviderSessionBinding | null> {
    const binding = await readValidatedBinding(sessionUid, clientCode);
    return binding ? await deliverProviderBinding(sessionUid, binding, binding.principal.subjectId) : null;
  }

  async function deliverProviderBinding(sessionUid: string, binding: ClientBinding, accountId: string) {
    const providerBinding = toProviderSessionBinding(binding, { accountId });
    if (providerBinding.mappingOwnerId)
      await refreshProviderSessionBinding(sessionUid, providerBinding, binding.expiresAt);
    return providerBinding;
  }

  async function createReturnHandle(payload: OidcReturnHandlePayload, ttlSeconds: number) {
    const artifact = await deps.kernel.createProtocolArtifact({
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: payload.clientId,
      artifactType: OIDC_RETURN_HANDLE_ARTIFACT_TYPE,
      ttlMs: ttlSeconds * 1000,
      tokenKind: "oidcReturnHandle",
      metadata: payload,
    });
    if (artifact.status === "fail_closed")
      throw new SubjectAccessUnavailableError(artifact.cause);
    return artifact.status === "created" && artifact.externalToken ? artifact.externalToken : null;
  }

  async function consumeReturnHandle(handle: string, payload: OidcReturnHandlePayload) {
    const artifact = returnHandleObservations.get(payload);
    if (!artifact)
      return null;
    const consumed = await deps.kernel.consumeProtocolArtifact(handle, {
      protocol: OIDC_SESSION_PROTOCOL,
      artifactType: OIDC_RETURN_HANDLE_ARTIFACT_TYPE,
      clientCode: payload.clientId,
    }, artifact);
    if (consumed.status === "fail_closed")
      throw new SubjectAccessUnavailableError(consumed.cause);
    return consumed.status === "resolved" ? payload : null;
  }

  async function resolveReturnHandle(handle: string, expected: {
    browserBinding: string;
    returnTarget: string;
    clientId?: string;
    interactionUid?: string;
  }) {
    const resolved = await deps.kernel.resolveProtocolArtifact(handle, {
      protocol: OIDC_SESSION_PROTOCOL,
      artifactType: OIDC_RETURN_HANDLE_ARTIFACT_TYPE,
      ...(expected.clientId ? { clientCode: expected.clientId } : {}),
    });
    if (resolved.status === "fail_closed")
      throw new SubjectAccessUnavailableError(resolved.cause);
    if (resolved.status !== "resolved")
      return null;
    const parsed = ReturnHandleMetadataSchema.safeParse(resolved.value.metadata);
    if (!parsed.success
      || parsed.data.clientId !== resolved.value.clientCode
      || parsed.data.browserBinding !== expected.browserBinding
      || parsed.data.returnTarget !== expected.returnTarget
      || (expected.interactionUid !== undefined && parsed.data.interactionUid !== expected.interactionUid)) {
      return null;
    }
    if (!await validateProtocolObject(resolved.value))
      return null;
    returnHandleObservations.set(parsed.data, resolved.value);
    return parsed.data;
  }

  async function registerAuthorizationCodeArtifact(input: RegisterAuthorizationCodeArtifactInput) {
    if (!input.binding) {
      deps.logger.warn({
        hasSessionUid: typeof input.payload.sessionUid === "string",
        sessionUidFingerprint: typeof input.payload.sessionUid === "string"
          ? fingerprintForLog(input.payload.sessionUid)
          : undefined,
        clientId: payloadClientId(input.payload),
      }, "missing OIDC provider session binding for authorization code");
      return false;
    }
    const clientId = payloadClientId(input.payload);
    if (!clientId) {
      deps.logger.warn({
        bindingId: input.binding.bindingId,
      }, "missing OIDC client id for authorization code");
      return false;
    }
    const version = await deps.clients.findActiveVersion(clientId);
    if (version === null || version !== input.binding.oidcConfigVersion) {
      deps.logger.warn({
        clientId,
        activeVersion: version,
        bindingVersion: input.binding.oidcConfigVersion,
        bindingId: input.binding.bindingId,
      }, "OIDC client config version mismatch for authorization code");
      return false;
    }
    if (input.binding.clientCode !== clientId)
      return false;
    const scopes = normalizeOidcProtocolScopes(input.payload);
    if (!scopes)
      return false;
    const nonce = payloadString(input.payload, "nonce");
    const artifact = await deps.kernel.createProtocolArtifact({
      principalSessionId: input.binding.principalSessionId,
      bindingId: input.binding.bindingId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: clientId,
      artifactType: OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE,
      ttlMs: input.expiresIn * 1000,
      tokenKind: "authCode",
      externalToken: input.providerCodeId,
      metadata: {
        providerCodeId: input.providerCodeId,
        clientId,
        clientCode: clientId,
        principalSessionId: input.binding.principalSessionId,
        bindingId: input.binding.bindingId,
        redirectUriFingerprint: fingerprintPayloadValue(input.payload, "redirectUri"),
        scopes,
        ...(nonce ? { nonce } : {}),
        oidcConfigVersion: version,
      },
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND,
        ref: providerModelKey("AuthorizationCode", input.providerCodeId),
        metadata: { clientId },
      }],
    });
    if (artifact.status !== "created") {
      deps.logger.warn({
        status: artifact.status,
        message: artifact.status === "fail_closed" ? artifact.message : undefined,
        clientId,
        bindingId: input.binding.bindingId,
      }, "failed to register OIDC authorization code Kernel artifact");
    }
    return artifact.status === "created";
  }

  async function resolveAuthorizationCodeSessionLifetime(providerCodeId: string, serializedProviderCode: string, expected?: { clientCode: string; code: string; redirectUri: string }) {
    if (expected && expected.code !== providerCodeId)
      return null;
    const acquired = codeObservations.get(providerCodeId);
    if (acquired) {
      if (expected && (acquired.artifact.clientCode !== expected.clientCode
        || acquired.artifact.metadata?.redirectUriFingerprint !== createHash("sha256").update(expected.redirectUri).digest("base64url"))) {
        return null;
      }
      return acquired;
    }
    const artifact = await deps.kernel.resolveProtocolArtifact(providerCodeId, { protocol: OIDC_SESSION_PROTOCOL, artifactType: OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE, ...(expected ? { clientCode: expected.clientCode } : {}) });
    if (artifact.status !== "resolved"
      || artifact.value.protocol !== OIDC_SESSION_PROTOCOL
      || artifact.value.artifactType !== OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE
      || !artifact.value.principalSessionId
      || !AuthorizationCodeMetadataSchema.safeParse(artifact.value.metadata).success) {
      return null;
    }
    if (expected && artifact.value.metadata?.redirectUriFingerprint !== createHash("sha256").update(expected.redirectUri).digest("base64url"))
      return null;
    if (!await validateProtocolObject(artifact.value))
      return null;
    await deps.permit?.(artifact.value);
    const principal = await deps.kernel.resolvePrincipalSessionById(artifact.value.principalSessionId);
    if (principal.status !== "resolved")
      return null;
    const acquiredLifetime = { serializedProviderCode, remainingSeconds: Math.ceil((principal.value.expiresAt - principal.observedAt) / 1000), artifact: artifact.value };
    codeObservations.set(providerCodeId, acquiredLifetime);
    return acquiredLifetime;
  }

  async function consumeAuthorizationCodeArtifact(providerCodeId: string, artifact: ProtocolArtifact) {
    if (artifact.protocol !== OIDC_SESSION_PROTOCOL || artifact.artifactType !== OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE)
      return null;
    await deps.permit?.(artifact);
    const consumed = await deps.kernel.consumeProtocolArtifact(providerCodeId, { protocol: OIDC_SESSION_PROTOCOL, artifactType: OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE }, artifact);
    codeObservations.delete(providerCodeId);
    if (consumed.status !== "resolved"
      || consumed.value.protocol !== OIDC_SESSION_PROTOCOL
      || consumed.value.artifactType !== OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE) {
      return null;
    }
    const parsed = AuthorizationCodeMetadataSchema.safeParse(consumed.value.metadata);
    return parsed.success ? { artifact: consumed.value, metadata: parsed.data } : null;
  }

  async function registerAccessTokenCredential(input: RegisterAccessTokenCredentialInput) {
    if (!input.binding)
      return null;
    const clientId = payloadClientId(input.payload);
    if (!clientId)
      return null;
    const version = await deps.clients.findActiveVersion(clientId);
    if (version === null || version !== input.binding.oidcConfigVersion)
      return null;
    if (input.binding.clientCode !== clientId)
      return null;
    const scopes = normalizeOidcProtocolScopes(input.payload);
    if (!scopes)
      return null;
    const extra = z.object({ authTime: z.number().int().nonnegative() }).safeParse(input.payload.extra);
    if (!extra.success || extra.data.authTime !== input.binding.authTime)
      return null;
    const credential = await deps.kernel.issueCredential({
      principalSessionId: input.binding.principalSessionId,
      bindingId: input.binding.bindingId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: clientId,
      credentialType: OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE,
      ttlMs: input.expiresIn * 1000,
      renewalPolicy: "fixed_at_issue",
      externalToken: input.providerTokenId,
      metadata: {
        providerTokenKey: input.providerTokenKey,
        providerTokenId: input.providerTokenId,
        scopes,
        authTime: input.binding.authTime,
        oidcConfigVersion: version,
      },
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
        ref: input.providerTokenKey,
        metadata: { clientId },
      }],
    });
    return credential.status === "created" ? credential.value : null;
  }

  async function resolveAccessTokenCredential(externalToken: string) {
    const credential = await deps.kernel.resolveCredential(externalToken, { protocol: OIDC_SESSION_PROTOCOL, credentialType: OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE });
    if (credential.status !== "resolved"
      || credential.value.protocol !== OIDC_SESSION_PROTOCOL
      || credential.value.credentialType !== OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE) {
      return null;
    }
    const metadata = AccessTokenMetadataSchema.safeParse(credential.value.metadata);
    if (!metadata.success || !await validateProtocolObject(credential.value))
      return null;
    await deps.permit?.(credential.value);
    return { credential: credential.value, metadata: metadata.data };
  }

  async function validateProtocolObject(object: ClientBinding | IssuedCredential | ProtocolArtifact) {
    if (object.clientCode && deps.traffic) {
      const gate = await deps.traffic.check(object.clientCode);
      if (gate.outcome === "maintenance" || gate.outcome === "unavailable") {
        throw "credentialType" in object
          ? new OidcOnlineAccessUnavailableError()
          : new errors.TemporarilyUnavailable();
      }
    }
    const version = object.metadata?.oidcConfigVersion;
    const current = object.clientCode ? await deps.clients.findActiveVersion(object.clientCode) : null;
    if (current !== null && Number.isSafeInteger(version) && current === version)
      return true;
    if (current !== null && typeof version === "number" && Number.isSafeInteger(version) && version > current)
      return false;
    try {
      await deps.kernel.revokeObservedObject(object, current !== null ? "client_config_changed" : "client_disabled");
    }
    catch {
      deps.logger.warn({ protocol: OIDC_SESSION_PROTOCOL }, "OIDC invalid object cleanup failed");
    }
    return false;
  }

  async function revokeAccessTokenCredential(credentialId: string) {
    return await deps.kernel.revokeCredential(credentialId, "admin_revoke");
  }

  async function revokeClientProtocol(clientId: string, reason: Parameters<SessionKernel["revokeClientProtocol"]>[2]) {
    return await deps.kernel.revokeClientProtocol(clientId, OIDC_SESSION_PROTOCOL, reason);
  }

  async function logoutPrincipalSession(token: string | undefined): Promise<RevokeSummary | true> {
    if (!token)
      return true;
    const principal = await deps.kernel.resolvePrincipalSession(token);
    if (principal.status === "resolved")
      return await deps.kernel.revokePrincipalSession(principal.value.principalSessionId, "logout");
    return true;
  }

  async function toResolvedGlobalSession(principal: PrincipalSession): Promise<ResolvedGlobalSession | null> {
    const account = await deps.accounts.findBySubject(principal.principal.subjectId);
    if (!account)
      return null;
    return {
      sessionId: principal.principalSessionId,
      authTime: Math.floor(principal.authTime / 1000),
      accountId: account.subjectIdentifier,
    };
  }

  async function principalSessionExpiresAt(principalSessionId: string) {
    const principal = await deps.kernel.resolvePrincipalSessionById(principalSessionId);
    if (principal.status === "fail_closed")
      throw new SubjectAccessUnavailableError(principal.cause);
    if (principal.status !== "resolved")
      return null;
    return principal.value.expiresAt;
  }

  async function refreshProviderSessionBinding(sessionUid: string, binding: ProviderSessionBinding, expiresAt: number) {
    await providerSessionState.refresh({
      binding,
      providerSessionUid: sessionUid,
      expiresAt,
    });
  }

  function toProviderSessionBinding(
    binding: Pick<
      ClientBinding,
      "bindingId" | "clientCode" | "principalSessionId" | "authTime" | "expiresAt" | "metadata"
    >,
    session: Pick<ResolvedGlobalSession, "accountId">,
  ): ProviderSessionBinding {
    const metadata = z.object({
      anchorGeneration: z.string().min(1).optional(),
      mappingOwnerId: z.string().min(1).optional(),
      oidcConfigVersion: z.number().int().nonnegative(),
    }).passthrough().parse(binding.metadata);
    return {
      principalSessionId: binding.principalSessionId,
      bindingId: binding.bindingId,
      clientCode: binding.clientCode,
      accountId: session.accountId,
      authTime: Math.floor(binding.authTime / 1000),
      oidcConfigVersion: metadata.oidcConfigVersion,
      expiresAt: Math.floor(binding.expiresAt / 1000),
      ...(metadata.anchorGeneration ? { anchorGeneration: metadata.anchorGeneration } : {}),
      ...(metadata.mappingOwnerId ? { mappingOwnerId: metadata.mappingOwnerId } : {}),
    };
  }

  return {
    consumeAuthorizationCodeArtifact,
    resolveAuthorizationCodeSessionLifetime,
    consume: consumeReturnHandle,
    create: createReturnHandle,
    resolveReturnHandle,
    consumeStaged,
    destroyProviderSession,
    ensureClientBinding,
    inspect,
    isCurrentOrStagedPrincipal,
    isStagedPrincipal,
    logoutPrincipalSession,
    readForAuthorization,
    readForAccessToken,
    readPrincipalAnchor,
    registerAccessTokenCredential,
    registerAuthorizationCodeArtifact,
    renew,
    resolve,
    resolveAccessTokenCredential,
    resolveById,
    revokeAccessTokenCredential,
    revokeClientProtocol,
    stage,
  };
}

function payloadClientId(payload: AdapterPayload) {
  if (typeof payload.clientId === "string")
    return payload.clientId;
  if (typeof payload.cid === "string")
    return payload.cid;
  if (typeof payload.params?.client_id === "string")
    return payload.params.client_id;
  return null;
}

function payloadString(payload: AdapterPayload, key: string) {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

function fingerprintPayloadValue(payload: AdapterPayload, key: string) {
  const value = payloadString(payload, key);
  return value ? createHash("sha256").update(value).digest("base64url") : undefined;
}

function fingerprintForLog(value: string) {
  return createHash("sha256").update(value).digest("base64url").slice(0, 12);
}

function providerModelKey(model: string, id: string) {
  return `oidc:model:${model}:${id}`;
}

function consumedProviderModelKey(providerModelKey: string) {
  return providerModelKey.replace("oidc:model:", "oidc:consumed:");
}

export type OidcSessionKernelAdapter = ReturnType<typeof createOidcSessionKernelAdapter>;
