import type {
  CleanupAdapter,
  ClientBinding,
  PrincipalSession,
  RevokeSummary,
  SessionKernel,
} from "@iam/api-core/session/kernel";
import type { OidcAccountDto } from "@iam/domain/user";
import type { IncomingMessage } from "node:http";
import type { AdapterPayload } from "oidc-provider";
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import type { OidcReturnHandlePayload } from "../interaction/return-handle.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { OidcClientRuntimeMetadata } from "../provider/client-runtime-metadata.ts";
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
  translateSubjectAccessResolveResult,
} from "@iam/api-core/subject-access";
import { z } from "zod";
import { getCookieValue } from "../interaction/global-session.ts";
import { normalizeOidcProtocolScopes } from "../protocol/scopes.ts";
import { markGlobalSessionCookieError } from "./global-session-error-provenance.ts";

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
    ttlSeconds: number;
  }) => Promise<ProviderSessionPublicationResult>;
  publishRebind: (input: {
    attemptId: string;
    binding: ProviderSessionBinding;
    expectedAnchorGeneration: string | null;
    providerSessionUid: string;
    ttlSeconds: number;
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
    ttlSeconds: number;
  }) => Promise<boolean>;
  stage: (staged: StagedProviderSessionBinding, ttlSeconds: number) => Promise<void>;
}

export interface OidcSessionKernelAdapterDeps {
  kernel: SessionKernel;
  providerSessionState: OidcSessionKernelProviderSessionStateStore;
  logger: Pick<OidcLogger, "warn">;
  accounts: OidcSessionKernelAccountReader;
  clients: OidcSessionKernelClientReader;
  cookieName: string;
  clock: { now: () => number };
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
    redis: { del: (...keys: string[]) => Promise<unknown> };
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
      async cleanup(refs) {
        await deps.redis.del(...refs.map(ref => ref.ref));
      },
    },
    {
      protocol: OIDC_SESSION_PROTOCOL,
      kind: OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND,
      async cleanup(refs) {
        await deps.redis.del(...refs.flatMap(ref => [ref.ref, consumedProviderModelKey(ref.ref)]));
      },
    },
  ];
}

export function createOidcSessionKernelAdapter(deps: OidcSessionKernelAdapterDeps) {
  const providerSessionState = deps.providerSessionState;
  async function inspect(request: Pick<IncomingMessage, "headers">) {
    const externalToken = getCookieValue(request.headers.cookie, deps.cookieName);
    if (!externalToken)
      return { status: "absent" as const };
    try {
      const principal = translateSubjectAccessResolveResult(
        await deps.kernel.resolvePrincipalSession(externalToken),
      );
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
      const principal = translateSubjectAccessResolveResult(
        await deps.kernel.resolvePrincipalSession(externalToken),
      );
      if (principal.status !== "resolved")
        return null;
      return await toResolvedGlobalSession(principal.value);
    }
    catch (error) {
      throw markGlobalSessionCookieError(error);
    }
  }

  async function resolveById(principalSessionId: string): Promise<ResolvedGlobalSession | null> {
    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSessionById(principalSessionId),
    );
    return principal.status === "resolved" ? await toResolvedGlobalSession(principal.value) : null;
  }

  async function renew(principalSessionId: string) {
    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.renewPrincipalSession(principalSessionId),
    );
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
    const binding = translateSubjectAccessResolveResult(
      await deps.kernel.createClientBinding({
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
      }),
    );
    if (binding.status !== "created")
      return null;

    const mapped = toProviderSessionBinding(binding.value, session);
    const ttlSeconds = Math.max(1, mapped.expiresAt - nowSeconds());
    const published = publication.kind === "rebind"
      ? await providerSessionState.publishRebind({
          attemptId: publication.attemptId,
          binding: mapped,
          expectedAnchorGeneration: publication.expectedAnchorGeneration,
          providerSessionUid: sessionUid,
          ttlSeconds,
        })
      : await providerSessionState.publishClientBinding({
          anchor: publication.anchor,
          binding: mapped,
          expectedLookup: existingLookup.value,
          providerSessionUid: sessionUid,
          ttlSeconds,
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
    const expiresAt = await principalSessionExpiresAtSeconds(session.sessionId);
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
      expiresAt,
      oidcConfigVersion: context.oidcConfigVersion,
      principalSessionId: session.sessionId,
      providerSessionUid: context.providerSessionUid ?? null,
    };
    await providerSessionState.stage(
      staged,
      Math.min(Math.max(1, expiresAt - nowSeconds()), 60),
    );
    return {
      principalSessionId: session.sessionId,
      bindingId: "pending",
      clientCode: context.clientId,
      accountId: session.accountId,
      authTime: session.authTime,
      oidcConfigVersion: context.oidcConfigVersion,
      expiresAt,
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
    if (!staged || staged.expiresAt <= nowSeconds())
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
    const existing = await read(input.providerSessionUid, input.clientCode);
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
      && staged.principalSessionId === session.sessionId
      && staged.expiresAt > nowSeconds();
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

  async function read(sessionUid: string, clientCode: string): Promise<ProviderSessionBinding | null> {
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
    const binding = translateSubjectAccessResolveResult(
      await deps.kernel.resolveClientBindingById(parsedLookup.bindingId),
    );
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
    const principal = await resolveById(binding.value.principalSessionId);
    if (!principal) {
      deps.logger.warn({
        sessionUidFingerprint: fingerprintForLog(sessionUid),
        bindingId: parsedLookup.bindingId,
        principalSessionId: binding.value.principalSessionId,
      }, "failed to resolve OIDC provider session principal");
      return null;
    }
    const providerBinding = toProviderSessionBinding(binding.value, principal);
    const anchor = providerBinding.anchorGeneration
      ? await readPrincipalAnchor(sessionUid, providerBinding.accountId)
      : null;
    if (!anchor
      || anchor.generation !== providerBinding.anchorGeneration
      || anchor.principalSessionId !== providerBinding.principalSessionId) {
      deps.logger.warn({
        sessionUidFingerprint: fingerprintForLog(sessionUid),
        bindingId: parsedLookup.bindingId,
      }, "OIDC provider session binding anchor mismatch");
      return null;
    }
    if (providerBinding.mappingOwnerId)
      await refreshProviderSessionBinding(sessionUid, providerBinding);
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

  async function consumeReturnHandle(handle: string) {
    const consumed = translateSubjectAccessResolveResult(
      await deps.kernel.consumeProtocolArtifact(handle),
    );
    if (consumed.status === "fail_closed")
      throw new SubjectAccessUnavailableError(consumed.cause);
    if (consumed.status !== "resolved"
      || consumed.value.protocol !== OIDC_SESSION_PROTOCOL
      || consumed.value.artifactType !== OIDC_RETURN_HANDLE_ARTIFACT_TYPE) {
      return null;
    }
    const parsed = ReturnHandleMetadataSchema.safeParse(consumed.value.metadata);
    return parsed.success ? parsed.data : null;
  }

  async function resolveReturnHandle(handle: string) {
    const resolved = translateSubjectAccessResolveResult(
      await deps.kernel.resolveProtocolArtifact(handle),
    );
    if (resolved.status === "fail_closed")
      throw new SubjectAccessUnavailableError(resolved.cause);
    if (resolved.status !== "resolved"
      || resolved.value.protocol !== OIDC_SESSION_PROTOCOL
      || resolved.value.artifactType !== OIDC_RETURN_HANDLE_ARTIFACT_TYPE) {
      return null;
    }
    const parsed = ReturnHandleMetadataSchema.safeParse(resolved.value.metadata);
    return parsed.success ? parsed.data : null;
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
    const artifact = translateSubjectAccessResolveResult(
      await deps.kernel.createProtocolArtifact({
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
      }),
    );
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

  async function consumeAuthorizationCodeArtifact(providerCodeId: string) {
    const consumed = translateSubjectAccessResolveResult(
      await deps.kernel.consumeProtocolArtifact(providerCodeId),
    );
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
    const credential = translateSubjectAccessResolveResult(
      await deps.kernel.issueCredential({
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
          authTime: payloadNumber(input.payload, "authTime"),
          oidcConfigVersion: version,
        },
        cleanupRefs: [{
          protocol: OIDC_SESSION_PROTOCOL,
          kind: OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
          ref: input.providerTokenKey,
          metadata: { clientId },
        }],
      }),
    );
    return credential.status === "created" ? credential.value : null;
  }

  async function resolveAccessTokenCredential(externalToken: string) {
    const credential = translateSubjectAccessResolveResult(
      await deps.kernel.resolveCredential(externalToken),
    );
    if (credential.status !== "resolved"
      || credential.value.protocol !== OIDC_SESSION_PROTOCOL
      || credential.value.credentialType !== OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE) {
      return null;
    }
    const metadata = AccessTokenMetadataSchema.safeParse(credential.value.metadata);
    return metadata.success ? { credential: credential.value, metadata: metadata.data } : null;
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
    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSession(token),
    );
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

  async function principalSessionExpiresAtSeconds(principalSessionId: string) {
    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSessionById(principalSessionId),
    );
    if (principal.status === "fail_closed")
      throw new SubjectAccessUnavailableError(principal.cause);
    if (principal.status !== "resolved")
      return null;
    return Math.floor(principal.value.expiresAt / 1000);
  }

  async function refreshProviderSessionBinding(sessionUid: string, binding: ProviderSessionBinding) {
    await providerSessionState.refresh({
      binding,
      providerSessionUid: sessionUid,
      ttlSeconds: Math.max(1, binding.expiresAt - nowSeconds()),
    });
  }

  function toProviderSessionBinding(
    binding: Pick<
      ClientBinding,
      "bindingId" | "clientCode" | "principalSessionId" | "authTime" | "expiresAt" | "metadata"
    >,
    session: ResolvedGlobalSession,
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

  function nowSeconds() {
    return Math.floor(deps.clock.now() / 1000);
  }

  return {
    consumeAuthorizationCodeArtifact,
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
    read,
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

function payloadNumber(payload: AdapterPayload, key: string) {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
