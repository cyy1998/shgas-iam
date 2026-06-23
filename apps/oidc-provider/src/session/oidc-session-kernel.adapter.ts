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
import type { OidcClientRuntimeMetadata } from "../repositories/client-metadata.ts";
import type { ProviderSessionBinding } from "./provider-session.ts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getCookieValue } from "../interaction/global-session.ts";
import {
  pendingProviderSessionBindingKey,
  providerSessionBindingKey,
  providerSessionBindingLookupKey,
  ProviderSessionBindingSchema,
} from "./provider-session.ts";

export const OIDC_SESSION_PROTOCOL = "oidc";
export const OIDC_RETURN_HANDLE_ARTIFACT_TYPE = "login_return_handle";
export const OIDC_AUTHORIZATION_CODE_ARTIFACT_TYPE = "authorization_code";
export const OIDC_ACCESS_TOKEN_CREDENTIAL_TYPE = "access_token";
export const OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND = "provider_session_uid_mapping";
export const OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND = "provider_token_payload";
export const OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND = "provider_model_payload";

const PendingProviderSessionBindingSchema = ProviderSessionBindingSchema.extend({
  clientId: z.string().min(1),
});

const ProviderSessionBindingLookupSchema = z.object({
  bindingId: z.string().min(1),
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
  findById: (id: number) => Promise<OidcAccountDto | null>;
}

export interface OidcSessionKernelClientReader {
  findRuntime: (clientId: string) => Promise<OidcClientRuntimeMetadata | null>;
  findActiveVersion: (clientId: string) => Promise<number | null>;
}

export interface OidcSessionKernelRedis {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>;
  del: (...keys: string[]) => Promise<unknown>;
}

export interface OidcSessionKernelAdapterDeps {
  kernel: SessionKernel;
  redis: OidcSessionKernelRedis;
  logger: Pick<OidcLogger, "warn">;
  accounts: OidcSessionKernelAccountReader;
  clients: OidcSessionKernelClientReader;
  cookieName: string;
  clock: { now: () => number };
}

export interface ProviderSessionBindingContext {
  clientId: string;
  oidcConfigVersion: number;
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
  deps: { redis: Pick<OidcSessionKernelRedis, "del"> },
): CleanupAdapter[] {
  return [
    {
      protocol: OIDC_SESSION_PROTOCOL,
      kind: OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND,
      async cleanup(refs) {
        await deps.redis.del(...refs.flatMap(ref => [
          providerSessionBindingKey(ref.ref),
          providerSessionBindingLookupKey(ref.ref),
        ]));
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
  async function resolve(request: Pick<IncomingMessage, "headers">): Promise<ResolvedGlobalSession | null> {
    const externalToken = getCookieValue(request.headers.cookie, deps.cookieName);
    if (!externalToken)
      return null;
    const principal = await deps.kernel.resolvePrincipalSession(externalToken);
    if (principal.status !== "resolved")
      return null;
    return await toResolvedGlobalSession(principal.value, externalToken);
  }

  async function resolveById(principalSessionId: string): Promise<ResolvedGlobalSession | null> {
    const principal = await deps.kernel.resolvePrincipalSessionById(principalSessionId);
    return principal.status === "resolved" ? await toResolvedGlobalSession(principal.value) : null;
  }

  async function renew(principalSessionId: string) {
    return (await deps.kernel.renewPrincipalSession(principalSessionId)).status === "resolved";
  }

  async function bind(
    sessionUid: string,
    session: ResolvedGlobalSession,
    context: ProviderSessionBindingContext,
  ): Promise<ProviderSessionBinding | null> {
    const binding = await deps.kernel.createClientBinding({
      principalSessionId: session.sessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: context.clientId,
      renewalPolicy: "extend_with_principal",
      metadata: {
        providerSessionUid: sessionUid,
        oidcConfigVersion: context.oidcConfigVersion,
      },
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_SESSION_MAPPING_CLEANUP_KIND,
        ref: sessionUid,
        metadata: { clientId: context.clientId },
      }],
    });
    if (binding.status !== "created")
      return null;

    const mapped = toProviderSessionBinding(binding.value, session);
    try {
      await writeProviderSessionMapping(sessionUid, mapped);
      return mapped;
    }
    catch (error) {
      await deps.kernel.revokeBinding(binding.value.bindingId, "binding_invalid");
      deps.logger.warn({ err: error, sessionUid }, "failed to write OIDC provider session binding mapping");
      return null;
    }
  }

  async function stage(session: ResolvedGlobalSession, context: ProviderSessionBindingContext) {
    const expiresAt = await principalSessionExpiresAtSeconds(session.sessionId);
    if (expiresAt === null)
      return null;
    const staged = {
      globalSessionId: session.sessionId,
      principalSessionId: session.sessionId,
      bindingId: "pending",
      userId: session.userId,
      accountId: session.accountId,
      authTime: session.authTime,
      oidcConfigVersion: context.oidcConfigVersion,
      expiresAt,
      clientId: context.clientId,
    };
    await deps.redis.set(
      pendingProviderSessionBindingKey(session.accountId),
      JSON.stringify(staged),
      "EX",
      Math.min(Math.max(1, expiresAt - nowSeconds()), 60),
    );
    return ProviderSessionBindingSchema.parse(staged);
  }

  async function consumeStaged(accountId: string, sessionUid: string) {
    const key = pendingProviderSessionBindingKey(accountId);
    const serialized = await deps.redis.get(key);
    if (!serialized)
      return null;
    await deps.redis.del(key);
    const parsed = parseJson(serialized, PendingProviderSessionBindingSchema);
    if (!parsed
      || parsed.accountId !== accountId
      || parsed.expiresAt <= nowSeconds()) {
      return null;
    }
    return await bind(sessionUid, {
      sessionId: parsed.principalSessionId,
      authTime: parsed.authTime,
      userId: parsed.userId,
      accountId: parsed.accountId,
    }, {
      clientId: parsed.clientId,
      oidcConfigVersion: parsed.oidcConfigVersion,
    });
  }

  async function read(sessionUid: string): Promise<ProviderSessionBinding | null> {
    const lookup = await deps.redis.get(providerSessionBindingLookupKey(sessionUid));
    if (!lookup)
      return null;
    const parsedLookup = parseJson(lookup, ProviderSessionBindingLookupSchema);
    if (!parsedLookup)
      return null;
    const binding = await deps.kernel.resolveClientBindingById(parsedLookup.bindingId);
    if (binding.status !== "resolved")
      return null;
    const principal = await resolveById(binding.value.principalSessionId);
    if (!principal)
      return null;
    const providerBinding = toProviderSessionBinding(binding.value, principal);
    await writeProviderSessionMapping(sessionUid, providerBinding);
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
    return artifact.status === "created" && artifact.externalToken ? artifact.externalToken : null;
  }

  async function consumeReturnHandle(handle: string) {
    const consumed = await deps.kernel.consumeProtocolArtifact(handle);
    if (consumed.status !== "resolved"
      || consumed.value.protocol !== OIDC_SESSION_PROTOCOL
      || consumed.value.artifactType !== OIDC_RETURN_HANDLE_ARTIFACT_TYPE) {
      return null;
    }
    const parsed = ReturnHandleMetadataSchema.safeParse(consumed.value.metadata);
    return parsed.success ? parsed.data : null;
  }

  async function registerAuthorizationCodeArtifact(input: RegisterAuthorizationCodeArtifactInput) {
    if (!input.binding)
      return false;
    const clientId = payloadClientId(input.payload);
    if (!clientId)
      return false;
    const version = await deps.clients.findActiveVersion(clientId);
    if (version === null || version !== input.binding.oidcConfigVersion)
      return false;
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
        scopes: payloadScopes(input.payload),
        nonce: payloadString(input.payload, "nonce"),
        oidcConfigVersion: version,
      },
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_MODEL_PAYLOAD_CLEANUP_KIND,
        ref: providerModelKey("AuthorizationCode", input.providerCodeId),
        metadata: { clientId },
      }],
    });
    return artifact.status === "created";
  }

  async function consumeAuthorizationCodeArtifact(providerCodeId: string) {
    const consumed = await deps.kernel.consumeProtocolArtifact(providerCodeId);
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
        scopes: payloadScopes(input.payload),
        authTime: payloadNumber(input.payload, "authTime"),
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
    const credential = await deps.kernel.resolveCredential(externalToken);
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
    const principal = await deps.kernel.resolvePrincipalSession(token);
    if (principal.status === "resolved")
      return await deps.kernel.revokePrincipalSession(principal.value.principalSessionId, "logout");
    return true;
  }

  async function toResolvedGlobalSession(
    principal: PrincipalSession,
    externalToken?: string,
  ): Promise<ResolvedGlobalSession | null> {
    const userId = Number.parseInt(principal.principal.subjectId, 10);
    if (!Number.isSafeInteger(userId))
      return null;
    const account = await deps.accounts.findById(userId);
    if (!account)
      return null;
    return {
      sessionId: principal.principalSessionId,
      externalToken,
      authTime: Math.floor(principal.authTime / 1000),
      userId: account.id,
      accountId: account.oidcSubject,
    };
  }

  async function principalSessionExpiresAtSeconds(principalSessionId: string) {
    const principal = await deps.kernel.resolvePrincipalSessionById(principalSessionId);
    if (principal.status !== "resolved")
      return null;
    return Math.floor(principal.value.expiresAt / 1000);
  }

  async function writeProviderSessionMapping(sessionUid: string, binding: ProviderSessionBinding) {
    const ttl = Math.max(1, binding.expiresAt - nowSeconds());
    await deps.redis.set(providerSessionBindingKey(sessionUid), JSON.stringify(binding), "EX", ttl);
    await deps.redis.set(
      providerSessionBindingLookupKey(sessionUid),
      JSON.stringify({ bindingId: binding.bindingId }),
      "EX",
      ttl,
    );
  }

  function toProviderSessionBinding(
    binding: Pick<ClientBinding, "bindingId" | "principalSessionId" | "authTime" | "expiresAt" | "metadata">,
    session: ResolvedGlobalSession,
  ): ProviderSessionBinding {
    const metadata = z.object({
      oidcConfigVersion: z.number().int().nonnegative(),
    }).passthrough().parse(binding.metadata);
    return {
      globalSessionId: binding.principalSessionId,
      principalSessionId: binding.principalSessionId,
      bindingId: binding.bindingId,
      userId: session.userId,
      accountId: session.accountId,
      authTime: Math.floor(binding.authTime / 1000),
      oidcConfigVersion: metadata.oidcConfigVersion,
      expiresAt: Math.floor(binding.expiresAt / 1000),
    };
  }

  function nowSeconds() {
    return Math.floor(deps.clock.now() / 1000);
  }

  return {
    bind,
    consumeAuthorizationCodeArtifact,
    consume: consumeReturnHandle,
    consumeReturnHandle,
    create: createReturnHandle,
    consumeStaged,
    createReturnHandle,
    logoutPrincipalSession,
    read,
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

function payloadScopes(payload: AdapterPayload) {
  const scope = payloadString(payload, "scope");
  if (scope)
    return scope.split(" ").filter(Boolean);
  const scopes = (payload as { scopes?: unknown }).scopes;
  if (scopes instanceof Set)
    return [...scopes].filter((scope): scope is string => typeof scope === "string");
  if (Array.isArray(scopes))
    return scopes.filter((scope): scope is string => typeof scope === "string");
  return [];
}

function fingerprintPayloadValue(payload: AdapterPayload, key: string) {
  const value = payloadString(payload, key);
  return value ? createHash("sha256").update(value).digest("base64url") : undefined;
}

function providerModelKey(model: string, id: string) {
  return `oidc:model:${model}:${id}`;
}

function consumedProviderModelKey(providerModelKey: string) {
  return providerModelKey.replace("oidc:model:", "oidc:consumed:");
}

function parseJson<T extends z.ZodType>(serialized: string, schema: T): z.infer<T> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : null;
  }
  catch {
    return null;
  }
}

export type OidcSessionKernelAdapter = ReturnType<typeof createOidcSessionKernelAdapter>;
