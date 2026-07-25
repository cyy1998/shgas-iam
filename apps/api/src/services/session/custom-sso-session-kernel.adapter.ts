import type { ClockPort, LoggerPort, RedisPort } from "@api/composition/runtime";
import type { ApiAuditLogWriter, ApiRequestContext } from "@api/services/audit/audit.service";
import type { ClientDto } from "@api/services/client/client.type";
import type { UserService } from "@api/services/user/user.service";
import type { UserDetailDto } from "@api/services/user/user.type";
import type {
  CleanupAdapter,
  RevokeSummary,
  SessionKernel,
} from "@iam/api-core/session/kernel";
import type { CustomSsoOrcasLoginPort } from "./custom-sso-session-kernel.port";
import { randomUUID } from "node:crypto";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import { buildLocalLoginSuccessAudit } from "@api/services/audit/events/auth.audit";
import { UserDetailDtoSchema } from "@api/services/user/user.schema";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { observabilityLogFields } from "@iam/api-core/observability";
import { reviveIsoDates } from "@iam/api-core/utils";
import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
import { z } from "zod";

const CUSTOM_SSO_PROTOCOL = "custom-sso";
const BROWSER_USER_SESSION_KIND = "browser_user";
const AUTH_CODE_ARTIFACT_TYPE = "auth_code";
const LOCAL_SESSION_CREDENTIAL_TYPE = "local_session";
const LOCAL_SESSION_PAYLOAD_VERSION = 1;
const LOCAL_SESSION_PAYLOAD_CLEANUP_KIND = "local_session_payload";

type CustomSsoPrincipalTokenSource = "cookie" | "authorization_header" | "query" | "none";

type ResolvedAuthorizationGrant = {
  principalSessionId: string;
  userDetail: UserDetailDto;
};

type IssuedClientCredential = {
  token: string;
  ttl: number;
  userInfo: UserDetailDto;
  orcasSessionId: string | null;
};

type CustomSsoOrcasContext = {
  userId: string;
  sessionId: string | null;
};

type CustomSsoLocalSessionContext = {
  userDetail: UserDetailDto;
  orcasId: string | null;
};

export type FetchPort = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const AuthCodeMetadataSchema = z.object({
  clientCode: z.string(),
  redirectUrl: z.string(),
});

const CredentialMetadataSchema = z.object({
  mode: z.enum(ClientManagementLevel),
  payloadRef: z.string(),
});

const OrcasContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string().nullable(),
});

const LocalSessionPayloadSchema = z.object({
  version: z.literal(LOCAL_SESSION_PAYLOAD_VERSION),
  payloadRef: z.string(),
  credentialId: z.string(),
  bindingId: z.string(),
  principalSessionId: z.string(),
  clientCode: z.string(),
  mode: z.enum(ClientManagementLevel),
  localSessionId: z.string(),
  user: UserDetailDtoSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  logoutEndpoint: z.string().optional(),
  orcas: OrcasContextSchema.nullable().optional(),
  orcasSessionId: z.string().nullable().optional(),
}).transform(payload => ({
  ...payload,
  orcas: payload.orcas ?? null,
}));

type LocalSessionPayload = z.infer<typeof LocalSessionPayloadSchema>;

export interface CustomSsoCleanupAdapterDeps {
  redis: Pick<RedisPort, "get" | "del">;
  logger: Pick<LoggerPort, "warn">;
  fetch: FetchPort;
}

export interface CustomSsoSessionKernelAdapterDeps {
  kernel: SessionKernel;
  redis: Pick<RedisPort, "get" | "set">;
  logger: Pick<LoggerPort, "info" | "warn">;
  orcas: CustomSsoOrcasLoginPort;
  userService: Pick<UserService, "getActiveUserById" | "getUserDetailById">;
  auditLogWriter: ApiAuditLogWriter;
  clock: Pick<ClockPort, "now">;
  config: {
    authCodeExpireSeconds: number;
    localSessionTtlSeconds: number;
  };
}

export function customSsoLocalSessionPayloadKey(payloadRef: string) {
  return `custom-sso:local-session-payload:${payloadRef}`;
}

export function createCustomSsoCleanupAdapter(deps: CustomSsoCleanupAdapterDeps): CleanupAdapter {
  return {
    protocol: CUSTOM_SSO_PROTOCOL,
    kind: LOCAL_SESSION_PAYLOAD_CLEANUP_KIND,
    async cleanup(refs) {
      for (const ref of refs) {
        const key = customSsoLocalSessionPayloadKey(ref.ref);
        const serialized = await deps.redis.get(key);
        if (serialized !== null) {
          const result = parseLocalSessionPayload(serialized);
          if (result.success) {
            await notifyIndependentClientLogout(deps, result.data);
          }
          else {
            deps.logger.warn({
              payloadRef: ref.ref,
              issues: result.error.issues,
            }, "invalid custom sso local session payload during cleanup");
          }
        }
        await deps.redis.del(key);
      }
    },
  };
}

export function createCustomSsoSessionKernelAdapter(deps: CustomSsoSessionKernelAdapterDeps) {
  async function createPrincipalSession(user: UserDetailDto, options: { amr?: string[] } = {}) {
    const result = await deps.kernel.createPrincipalSession({
      principal: toPrincipalRef(user),
      snapshot: toPrincipalSnapshot(user),
      sessionKind: BROWSER_USER_SESSION_KIND,
      amr: options.amr ?? [],
    });
    if (result.status !== "created" || !result.externalToken) {
      throw new CustomError("全局session创建失败");
    }
    return {
      token: result.externalToken,
      principalSession: result.value,
    };
  }

  async function issueAuthorizationCode(input: {
    token?: string;
    tokenSource: CustomSsoPrincipalTokenSource;
    clientCode: string;
    redirectUrl: string;
    requestContext?: ApiRequestContext;
  }) {
    if (!input.token) {
      return { isLogin: false as const, code: null };
    }

    const principal = await deps.kernel.resolvePrincipalSession(input.token);
    if (principal.status !== "resolved") {
      return { isLogin: false as const, code: null };
    }
    logLegacyBearerSource(input.tokenSource, input.clientCode, input.requestContext);

    const renewed = await deps.kernel.renewPrincipalSession(principal.value.principalSessionId);
    if (renewed.status !== "resolved") {
      return { isLogin: false as const, code: null };
    }

    const artifact = await deps.kernel.createProtocolArtifact({
      principalSessionId: renewed.value.principalSessionId,
      protocol: CUSTOM_SSO_PROTOCOL,
      clientCode: input.clientCode,
      artifactType: AUTH_CODE_ARTIFACT_TYPE,
      ttlMs: deps.config.authCodeExpireSeconds * 1000,
      tokenKind: "authCode",
      metadata: {
        clientCode: input.clientCode,
        redirectUrl: input.redirectUrl,
      },
    });
    if (artifact.status !== "created" || !artifact.externalToken) {
      throw new CustomError("授权码创建失败");
    }
    return {
      isLogin: true as const,
      code: artifact.externalToken,
    };
  }

  async function resolveAuthorizationGrant(input: {
    code: string;
    clientCode: string;
    redirectUrl?: string;
    invalidCodeError?: "unauthorized" | "invalid_auth_code";
  }): Promise<ResolvedAuthorizationGrant> {
    const consumed = await deps.kernel.consumeProtocolArtifact(input.code);
    if (consumed.status !== "resolved") {
      throwInvalidCode(input.invalidCodeError);
    }
    const artifact = consumed.value;
    if (artifact.protocol !== CUSTOM_SSO_PROTOCOL || artifact.artifactType !== AUTH_CODE_ARTIFACT_TYPE) {
      throwInvalidCode(input.invalidCodeError);
    }
    const metadata = AuthCodeMetadataSchema.safeParse(artifact.metadata);
    if (!metadata.success
      || metadata.data.clientCode !== input.clientCode
      || (input.redirectUrl !== undefined && metadata.data.redirectUrl !== input.redirectUrl)) {
      throwInvalidCode(input.invalidCodeError);
    }
    if (!artifact.principalSessionId) {
      throw new AuthzUnauthorizedError("全局session不存在");
    }

    const principalSession = await deps.kernel.resolvePrincipalSessionById(artifact.principalSessionId);
    if (principalSession.status !== "resolved") {
      throw new AuthzUnauthorizedError("全局session不存在或已过期");
    }

    await assertLiveUserAvailable(principalSession.value.principal.subjectId);
    const userDetail = await getProfileUserDetail(principalSession.value.principal.subjectId);
    return {
      principalSessionId: principalSession.value.principalSessionId,
      userDetail,
    };
  }

  async function issueClientCredential(input: {
    authorizationGrant: ResolvedAuthorizationGrant;
    client: ClientDto;
    mode: ClientManagementLevel;
    orcas?: CustomSsoOrcasContext | null;
    requestContext?: ApiRequestContext;
  }): Promise<IssuedClientCredential> {
    const clientCode = input.client.clientCode;
    const payloadRef = randomUUID();
    const cleanupRefs = [{
      protocol: CUSTOM_SSO_PROTOCOL,
      kind: LOCAL_SESSION_PAYLOAD_CLEANUP_KIND,
      ref: payloadRef,
      metadata: { clientCode },
    }];

    const binding = await deps.kernel.createClientBinding({
      principalSessionId: input.authorizationGrant.principalSessionId,
      protocol: CUSTOM_SSO_PROTOCOL,
      clientCode,
      ttlMs: deps.config.localSessionTtlSeconds * 1000,
      renewalPolicy: "extend_with_principal",
      metadata: {
        mode: input.mode,
      },
    });
    if (binding.status !== "created") {
      throw new AuthzUnauthorizedError("局部session创建失败");
    }

    const credential = await deps.kernel.issueCredential({
      principalSessionId: input.authorizationGrant.principalSessionId,
      bindingId: binding.value.bindingId,
      protocol: CUSTOM_SSO_PROTOCOL,
      clientCode,
      credentialType: LOCAL_SESSION_CREDENTIAL_TYPE,
      ttlMs: deps.config.localSessionTtlSeconds * 1000,
      renewalPolicy: "extend_with_principal",
      tokenKind: "localSession",
      metadata: {
        mode: input.mode,
        payloadRef,
      },
      cleanupRefs,
    });
    if (credential.status !== "created" || !credential.externalToken) {
      await deps.kernel.revokeBinding(binding.value.bindingId, "binding_invalid");
      throw new AuthzUnauthorizedError("局部session创建失败");
    }

    const ttl = Math.floor((credential.value.expiresAt - deps.clock.now()) / 1000);
    if (ttl <= 0) {
      await deps.kernel.revokeBinding(binding.value.bindingId, "binding_invalid");
      throw new AuthzUnauthorizedError("局部session创建失败");
    }

    const payload: LocalSessionPayload = {
      version: LOCAL_SESSION_PAYLOAD_VERSION,
      payloadRef,
      credentialId: credential.value.credentialId,
      bindingId: binding.value.bindingId,
      principalSessionId: input.authorizationGrant.principalSessionId,
      clientCode,
      mode: input.mode,
      localSessionId: credential.externalToken,
      user: input.authorizationGrant.userDetail,
      issuedAt: credential.value.issuedAt,
      expiresAt: credential.value.expiresAt,
      logoutEndpoint: input.mode === ClientManagementLevel.Independent
        ? input.client.extAttributes.logoutEndpoint
        : undefined,
      orcas: input.orcas ?? null,
    };

    try {
      await deps.redis.set(customSsoLocalSessionPayloadKey(payloadRef), JSON.stringify(payload), "EX", ttl);
    }
    catch (error) {
      await deps.kernel.revokeBinding(binding.value.bindingId, "binding_invalid");
      deps.logger.warn({
        err: error,
        clientCode,
        ...observabilityLogFields(input.requestContext),
      }, "failed to write custom sso local session payload");
      throw new AuthzUnauthorizedError("局部session创建失败");
    }

    await deps.auditLogWriter.recordAuditLog(
      withApiRequestContext(
        input.requestContext,
        buildLocalLoginSuccessAudit(input.authorizationGrant.userDetail, clientCode, input.mode),
      ),
    );

    return {
      token: credential.externalToken,
      ttl,
      userInfo: input.authorizationGrant.userDetail,
      orcasSessionId: input.orcas?.sessionId ?? null,
    };
  }

  async function redeemIndependentGrant(input: {
    client: ClientDto;
    code: string;
    requestContext?: ApiRequestContext;
  }) {
    const authorizationGrant = await resolveAuthorizationGrant({
      clientCode: input.client.clientCode,
      code: input.code,
      invalidCodeError: "invalid_auth_code",
    });
    const credential = await issueClientCredential({
      authorizationGrant,
      client: input.client,
      mode: ClientManagementLevel.Independent,
      requestContext: input.requestContext,
    });
    return {
      credential: credential.token,
      ttl: credential.ttl,
      userInfo: credential.userInfo,
    };
  }

  async function completeGatewayLogin(input: {
    client: ClientDto;
    code: string;
    redirectUrl: string;
    requestContext?: ApiRequestContext;
  }) {
    const authorizationGrant = await resolveAuthorizationGrant({
      clientCode: input.client.clientCode,
      code: input.code,
      redirectUrl: input.redirectUrl,
      invalidCodeError: "unauthorized",
    });
    let orcas: CustomSsoOrcasContext | null = null;
    if (input.client.extAttributes.requireOrcas === true) {
      const { id, username, name, mobile } = authorizationGrant.userDetail;
      const { orcasSessionId, orcasId } = await deps.orcas.orcasLogin({
        id,
        username,
        name,
        mobile,
      });
      orcas = {
        userId: orcasId,
        sessionId: orcasSessionId,
      };
    }
    const localSession = await issueClientCredential({
      authorizationGrant,
      client: input.client,
      mode: ClientManagementLevel.Gateway,
      orcas,
      requestContext: input.requestContext,
    });
    return {
      orcasSessionId: localSession.orcasSessionId,
      token: localSession.token,
    };
  }

  async function authorizeLocalSession(localSessionToken: string, client: ClientDto) {
    const { userDetail } = await resolveValidatedLocalSession(localSessionToken, client, { enforceMaintenance: true });
    const userAbstract = {
      username: userDetail.username,
      id: userDetail.id,
      name: userDetail.name,
    };
    return Buffer.from(JSON.stringify(userAbstract), "utf8").toString("base64");
  }

  async function resolvePrincipalSessionUser(token: string) {
    const principalSession = await deps.kernel.resolvePrincipalSession(token);
    if (principalSession.status !== "resolved") {
      throw new AuthzUnauthorizedError("未登录");
    }
    await assertLiveUserAvailable(principalSession.value.principal.subjectId);
    return await getProfileUserDetail(principalSession.value.principal.subjectId);
  }

  async function resolveLocalSessionUser(localSessionToken: string, client: ClientDto) {
    const { userDetail } = await resolveLocalSessionContext(localSessionToken, client);
    return userDetail;
  }

  async function resolveLocalSessionContext(
    localSessionToken: string,
    client: ClientDto,
  ): Promise<CustomSsoLocalSessionContext> {
    const { payload, userDetail } = await resolveValidatedLocalSession(
      localSessionToken,
      client,
      { enforceMaintenance: false },
    );
    return {
      userDetail,
      orcasId: payload.orcas?.userId ?? null,
    };
  }

  async function logout(token: string | undefined): Promise<RevokeSummary | true> {
    if (!token) {
      return true;
    }

    const principal = await deps.kernel.resolvePrincipalSession(token);
    if (principal.status === "resolved") {
      return await deps.kernel.revokePrincipalSession(principal.value.principalSessionId, "logout");
    }

    const credential = await deps.kernel.resolveCredential(token);
    if (credential.status === "resolved" && credential.value.protocol === CUSTOM_SSO_PROTOCOL) {
      return await deps.kernel.revokePrincipalSession(credential.value.principalSessionId, "logout");
    }

    return true;
  }

  async function lazyRevokeUserSessions(userId: number) {
    return await deps.kernel.revokeUserSessions({
      principalType: "user",
      subjectId: String(userId),
    }, "user_disabled");
  }

  async function resolveValidatedLocalSession(
    localSessionToken: string,
    client: ClientDto,
    options: { enforceMaintenance: boolean },
  ) {
    const credential = await deps.kernel.resolveCredential(localSessionToken);
    if (credential.status !== "resolved") {
      throw new AuthzUnauthorizedError("未登录");
    }
    if (credential.value.protocol !== CUSTOM_SSO_PROTOCOL
      || credential.value.credentialType !== LOCAL_SESSION_CREDENTIAL_TYPE
      || credential.value.clientCode !== client.clientCode) {
      throw new AuthzUnauthorizedError("未登录");
    }

    if (credential.value.bindingId === undefined) {
      await deps.kernel.revokeCredential(credential.value.credentialId, "credential_corrupted");
      throw new AuthzUnauthorizedError("未登录");
    }

    const binding = await deps.kernel.resolveClientBindingById(credential.value.bindingId);
    if (binding.status !== "resolved") {
      await deps.kernel.revokeCredential(credential.value.credentialId, "binding_invalid");
      throw new AuthzUnauthorizedError("未登录");
    }

    const principal = await deps.kernel.resolvePrincipalSessionById(credential.value.principalSessionId);
    if (principal.status !== "resolved") {
      await deps.kernel.revokeBinding(credential.value.bindingId, "binding_invalid");
      throw new AuthzUnauthorizedError("未登录");
    }

    const liveUser = await assertLiveUserAvailable(principal.value.principal.subjectId);
    if (client.isDelete) {
      await deps.kernel.revokeClientProtocol(client.clientCode, CUSTOM_SSO_PROTOCOL, "client_deleted");
      throw new AuthzUnauthorizedError("未登录");
    }
    if (client.status === ClientStatus.Disable) {
      await deps.kernel.revokeClientProtocol(client.clientCode, CUSTOM_SSO_PROTOCOL, "client_disabled");
      throw new AuthzUnauthorizedError("未登录");
    }

    const credentialMetadata = CredentialMetadataSchema.safeParse(credential.value.metadata);
    if (!credentialMetadata.success) {
      await deps.kernel.revokeCredential(credential.value.credentialId, "credential_corrupted");
      throw new AuthzUnauthorizedError("未登录");
    }
    const payload = await readPayload(credentialMetadata.data.payloadRef);
    if (!payload
      || payload.credentialId !== credential.value.credentialId
      || payload.bindingId !== credential.value.bindingId
      || payload.principalSessionId !== credential.value.principalSessionId
      || payload.clientCode !== client.clientCode) {
      await deps.kernel.revokeCredential(credential.value.credentialId, "credential_corrupted");
      throw new AuthzUnauthorizedError("未登录");
    }

    if (options.enforceMaintenance
      && client.status === ClientStatus.Maintenance
      && !isUserExcludedFromMaintenance(client, liveUser)) {
      throw new AuthzMaintenanceError("系统维护中");
    }

    const userDetail = await getProfileUserDetail(principal.value.principal.subjectId);
    return { payload, userDetail };
  }

  async function readPayload(payloadRef: string) {
    const serialized = await deps.redis.get(customSsoLocalSessionPayloadKey(payloadRef));
    if (serialized === null) {
      return null;
    }
    const parsed = parseLocalSessionPayload(serialized);
    if (!parsed.success) {
      deps.logger.warn({ payloadRef, issues: parsed.error.issues }, "invalid custom sso local session payload");
      return null;
    }
    return parsed.data;
  }

  function parseUserId(subjectId: string) {
    const userId = Number.parseInt(subjectId, 10);
    if (!Number.isSafeInteger(userId)) {
      throw new AuthzUnauthorizedError("未登录");
    }
    return userId;
  }

  async function assertLiveUserAvailable(subjectId: string) {
    const userId = parseUserId(subjectId);
    const user = await deps.userService.getActiveUserById(userId);
    if (user === null) {
      await deps.kernel.revokeUserSessions({
        principalType: "user",
        subjectId: String(userId),
      }, "user_disabled");
      throw new AuthzUnauthorizedError("未登录");
    }
    return user;
  }

  async function getProfileUserDetail(subjectId: string) {
    try {
      return await deps.userService.getUserDetailById(parseUserId(subjectId));
    }
    catch {
      throw new AuthzUnauthorizedError("未登录");
    }
  }

  function logLegacyBearerSource(
    source: CustomSsoPrincipalTokenSource,
    clientCode: string,
    requestContext?: ApiRequestContext,
  ) {
    if (source !== "authorization_header" && source !== "query")
      return;
    deps.logger.info({
      event: SystemLogEvent.SsoLegacyBearerSourceUsed,
      sourceApp: LoggerSourceApp.Api,
      source,
      clientCode,
      ...observabilityLogFields(requestContext),
    }, "legacy principal session bearer source used");
  }

  return {
    authorizeLocalSession,
    completeGatewayLogin,
    createPrincipalSession,
    issueAuthorizationCode,
    lazyRevokeUserSessions,
    logout,
    redeemIndependentGrant,
    resolveLocalSessionContext,
    resolveLocalSessionUser,
    resolvePrincipalSessionUser,
  };
}

function parseLocalSessionPayload(serialized: string) {
  try {
    const parsed = JSON.parse(serialized, reviveIsoDates);
    return LocalSessionPayloadSchema.safeParse(normalizeLegacyLocalSessionPayload(parsed));
  }
  catch (error) {
    return {
      success: false as const,
      error: {
        issues: [{ code: "custom", message: "invalid JSON", path: [], error }],
      },
    };
  }
}

function normalizeLegacyLocalSessionPayload(value: unknown) {
  if (!isRecord(value) || value.orcas !== undefined || !isRecord(value.user)) {
    return value;
  }
  const legacyOrcasId = value.user.orcasId;
  if (typeof legacyOrcasId !== "string") {
    return value;
  }
  return {
    ...value,
    orcas: {
      userId: legacyOrcasId,
      sessionId: typeof value.orcasSessionId === "string" ? value.orcasSessionId : null,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function notifyIndependentClientLogout(deps: CustomSsoCleanupAdapterDeps, payload: LocalSessionPayload) {
  if (payload.mode !== ClientManagementLevel.Independent || !payload.logoutEndpoint)
    return;

  try {
    const response = await deps.fetch(payload.logoutEndpoint, {
      method: "POST",
      body: JSON.stringify({ sid: payload.localSessionId }),
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
    });
    if (!response.ok) {
      deps.logger.warn({
        event: SystemLogEvent.SessionNotificationUnexpectedResponse,
        clientCode: payload.clientCode,
        status: response.status,
      }, "independent client logout endpoint returned non-OK response");
    }
  }
  catch (error) {
    deps.logger.warn({
      event: SystemLogEvent.SessionNotificationFailed,
      err: error,
      clientCode: payload.clientCode,
    }, "independent client logout endpoint failed");
  }
}

function toPrincipalRef(user: UserDetailDto) {
  return {
    principalType: "user",
    subjectId: String(user.id),
    displayName: user.name,
  };
}

function toPrincipalSnapshot(user: UserDetailDto) {
  return {
    subjectId: String(user.id),
    username: user.username,
    displayName: user.name,
  };
}

function throwInvalidCode(kind: "unauthorized" | "invalid_auth_code" = "invalid_auth_code"): never {
  if (kind === "unauthorized") {
    throw new AuthzUnauthorizedError("非法code");
  }
  throw new InvalidAuthCodeError("非法Code");
}

function isUserExcludedFromMaintenance(client: ClientDto, user: { username: string }) {
  return client.extAttributes.userExcluding !== undefined
    && client.extAttributes.userExcluding !== null
    && client.extAttributes.userExcluding.includes(user.username);
}

export type CustomSsoSessionKernelAdapter = ReturnType<typeof createCustomSsoSessionKernelAdapter>;
