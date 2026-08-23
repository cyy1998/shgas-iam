import type { ClockPort, LoggerPort } from "@api/composition/runtime";
import type { ApiRequestContext } from "@api/services/audit/audit.context";
import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type {
  CustomSsoSubjectProjectionPort,
} from "@api/services/sso/custom-sso-subject-delivery.port";
import type { UserDetailDto } from "@api/services/user/user.type";
import type {
  AuthorizationGrantLease,
  AuthorizationGrantRedemption,
  AuthorizationGrantReservation,
} from "@iam/api-core/authorization-grant";
import type {
  IssuedCredential,
  ProtocolArtifact,
  RevokeSummary,
  SessionKernel,
  SessionOrigin,
} from "@iam/api-core/session/kernel";
import type { SubjectClaimName } from "@iam/contracts";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  CustomSsoGatewayOrcasUserPort,
  CustomSsoOrcasLoginPort,
  CustomSsoSubjectDeliveryPort,
} from "./custom-sso-session-kernel.port";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import {
  buildGatewayLoginSuccessAudit,
  buildIndependentLoginSuccessAudit,
} from "@api/services/audit/events/auth.audit";
import {
  AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
} from "@iam/api-core/authorization-grant";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { observabilityLogFields } from "@iam/api-core/observability";
import {
  SubjectAccessDisabledError,
  translateSubjectAccessResolveResult,
} from "@iam/api-core/subject-access";
import {
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
} from "@iam/client-subject-projection";
import { resolveCustomSsoSubjectProjection } from "@iam/client-subject-projection/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  isRetryableServiceUnavailable,
} from "@iam/contracts";
import { z } from "zod";
import { PrincipalSessionInspectionUnavailableError } from "./principal-session-inspection.error";

const CUSTOM_SSO_PROTOCOL = "custom-sso";
const BROWSER_USER_SESSION_KIND = "browser_user";
const AUTH_CODE_ARTIFACT_TYPE = "auth_code";
const LOCAL_SESSION_CREDENTIAL_TYPE = "local_session";

type CustomSsoPrincipalTokenSource = "cookie" | "authorization_header" | "query" | "none";

type CustomSsoPrincipalSessionCreationOptions = {
  amr?: readonly string[];
  origin?: SessionOrigin;
};

type ReservedGatewayAuthorizationGrant = {
  artifactId: string;
  principalSessionId: string;
  reservation: AuthorizationGrantReservation;
  subjectIdentifier: string;
  state?: string;
};

type IssuedClientCredential = {
  credentialId: string;
  token: string;
  ttl: number;
  orcasSessionId: string | null;
};

class CustomSsoCredentialIssueFailure {
  constructor(
    readonly originalError: unknown,
    readonly credentialMayExist: boolean,
  ) {}
}

type CredentialIssueState = "not_started" | "started" | "issued";

type CustomSsoOrcasContext = {
  userId: string;
  sessionId: string | null;
};

type CustomSsoLocalSessionContext = {
  subjectIdentifier: string;
  authenticatedClientCode: string;
  orcasId?: string;
};

type ValidatedCustomSsoCredentialContext
  = CustomSsoLocalSessionContext & {
    credentialConfigVersion: number;
  };

type IndependentClientContext = {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly subjectClaims: readonly SubjectClaimName[];
};

type GatewayClientContext = {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly orcasEnabled: boolean;
};

type ResolvedIndependentAuthorizationGrant = {
  artifactId: string;
  principalSessionId: string;
  reservation: AuthorizationGrantReservation;
  subjectIdentifier: string;
};

const AuthCodeMetadataSchema = z.object({
  version: z.literal(2),
  subjectIdentifier: z.uuid(),
  clientCode: z.string(),
  mode: z.enum(CustomSsoClientMode),
  redirectUri: z.string(),
  state: z.string().optional(),
  configVersion: z.number().int().nonnegative(),
}).strict();

const IndependentCredentialMetadataSchema = z.object({
  version: z.literal(2),
  mode: z.literal(CustomSsoClientMode.Independent),
  configVersion: z.number().int().nonnegative(),
}).strict();

const GatewayCredentialMetadataSchema = z.object({
  version: z.literal(2),
  mode: z.literal(CustomSsoClientMode.Gateway),
  configVersion: z.number().int().nonnegative(),
  orcasId: z.string().min(1).optional(),
}).strict();

const CustomSsoCredentialMetadataSchema = z.discriminatedUnion("mode", [
  IndependentCredentialMetadataSchema,
  GatewayCredentialMetadataSchema,
]);
type CustomSsoCredentialMetadata = z.infer<
  typeof CustomSsoCredentialMetadataSchema
>;

export interface CustomSsoSessionKernelAdapterDeps {
  authorizationGrantRedemption: AuthorizationGrantRedemption;
  clients: {
    findRuntimeRecord: (
      clientCode: string,
    ) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  kernel: SessionKernel;
  logger: Pick<LoggerPort, "info" | "warn">;
  orcas: CustomSsoOrcasLoginPort;
  subjectProjection: CustomSsoSubjectProjectionPort;
  subjectDelivery: CustomSsoSubjectDeliveryPort;
  userService: CustomSsoGatewayOrcasUserPort;
  auditLogWriter: ApiAuditLogWriter;
  clock: Pick<ClockPort, "now">;
  random: { uuid: () => string };
  config: {
    authCodeExpireSeconds: number;
    localSessionTtlSeconds: number;
  };
}

export function createCustomSsoSessionKernelAdapter(deps: CustomSsoSessionKernelAdapterDeps) {
  async function assertAuthorizationClientCurrent(input: {
    readonly clientCode: string;
    readonly configVersion: number;
    readonly mode: CustomSsoClientMode;
  }) {
    const client = await deps.clients.findRuntimeRecord(input.clientCode);
    if (
      client === null
      || client.clientCode !== input.clientCode
      || client.status === ClientStatus.Disable
      || client.isDelete
      || !client.customSsoEnabled
      || client.customSsoConfig === null
      || client.customSsoConfig.mode !== input.mode
      || client.customSsoConfigVersion !== input.configVersion
    ) {
      throw new AuthzUnauthorizedError("客户端配置已变更");
    }
  }

  async function createPrincipalSession(
    subjectIdentifier: string,
    options: CustomSsoPrincipalSessionCreationOptions = {},
  ) {
    const result = await deps.kernel.createPrincipalSession(subjectIdentifier, {
      sessionKind: BROWSER_USER_SESSION_KIND,
      amr: options.amr === undefined ? [] : [...options.amr],
      origin: options.origin,
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
    configVersion: number;
    mode: CustomSsoClientMode;
    redirectUrl: string;
    requestContext?: ApiRequestContext;
    state?: string;
  }) {
    if (!input.token) {
      return { isLogin: false as const, code: null };
    }

    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSession(input.token),
    );
    if (principal.status !== "resolved") {
      return { isLogin: false as const, code: null };
    }
    logLegacyBearerSource(input.tokenSource, input.clientCode, input.requestContext);

    const renewed = translateSubjectAccessResolveResult(
      await deps.kernel.renewPrincipalSession(principal.value.principalSessionId),
    );
    if (renewed.status !== "resolved") {
      return { isLogin: false as const, code: null };
    }

    await assertAuthorizationClientCurrent(input);

    const artifactId = deps.random.uuid();
    const artifact = translateSubjectAccessResolveResult(
      await deps.kernel.createProtocolArtifact({
        artifactId,
        principalSessionId: renewed.value.principalSessionId,
        protocol: CUSTOM_SSO_PROTOCOL,
        clientCode: input.clientCode,
        artifactType: AUTH_CODE_ARTIFACT_TYPE,
        cleanupRefs: [{
          protocol: CUSTOM_SSO_PROTOCOL,
          kind: AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
          ref: artifactId,
        }],
        ttlMs: deps.config.authCodeExpireSeconds * 1000,
        tokenKind: "authCode",
        metadata: {
          version: 2,
          subjectIdentifier: renewed.value.principal.subjectId,
          clientCode: input.clientCode,
          mode: input.mode,
          redirectUri: input.redirectUrl,
          ...(input.state === undefined ? {} : { state: input.state }),
          configVersion: input.configVersion,
        },
      }),
    );
    if (artifact.status !== "created" || !artifact.externalToken) {
      throw new CustomError("授权码创建失败");
    }
    try {
      const initialized = await deps.authorizationGrantRedemption.initialize({
        expiresAt: artifact.value.expiresAt,
        grantId: artifact.value.artifactId,
      });
      if (initialized !== "created")
        throw new CustomError("授权码创建失败");
    }
    catch (error) {
      await deps.kernel.revokeArtifact(artifact.value.artifactId, "unknown");
      if (error instanceof CustomError)
        throw error;
      throw new CustomError("授权码创建失败");
    }
    try {
      await assertAuthorizationClientCurrent(input);
    }
    catch (error) {
      try {
        await deps.kernel.revokeArtifact(
          artifact.value.artifactId,
          "client_config_changed",
        );
      }
      catch {
        deps.logger.warn({
          clientCode: input.clientCode,
          ...observabilityLogFields(input.requestContext),
        }, "failed to revoke stale custom sso authorization artifact");
      }
      throw error;
    }
    return {
      isLogin: true as const,
      code: artifact.externalToken,
    };
  }

  async function inspectPrincipalSession(token?: string) {
    if (!token)
      return "absent" as const;

    try {
      const principal = translateSubjectAccessResolveResult(
        await deps.kernel.resolvePrincipalSession(token),
      );
      if (principal.status === "fail_closed") {
        throw new PrincipalSessionInspectionUnavailableError({
          cause: principal.cause,
        });
      }
      return principal.status === "resolved"
        ? "valid" as const
        : "invalid" as const;
    }
    catch (error) {
      if (error instanceof SubjectAccessDisabledError)
        return "invalid" as const;
      throw error;
    }
  }

  async function resolveAuthorizationGrant(input: {
    code: string;
    client: GatewayClientContext;
    redirectUrl?: string;
    invalidCodeError?: "unauthorized" | "invalid_auth_code";
  }): Promise<ReservedGatewayAuthorizationGrant> {
    const resolved = translateSubjectAccessResolveResult(
      await deps.kernel.resolveProtocolArtifact(input.code),
    );
    if (resolved.status !== "resolved") {
      throwInvalidCode(input.invalidCodeError);
    }
    const resolvedGrant = validateGatewayAuthorizationArtifact(
      resolved.value,
      input,
      input.invalidCodeError,
    );

    const reservation = await deps.authorizationGrantRedemption.begin(
      resolved.value.artifactId,
    );
    if (reservation.status !== "reserved") {
      throwInvalidCode(input.invalidCodeError);
    }

    return {
      artifactId: resolved.value.artifactId,
      principalSessionId: resolvedGrant.principalSessionId,
      reservation: reservation.reservation,
      subjectIdentifier: resolvedGrant.subjectIdentifier,
      ...(resolvedGrant.state === undefined ? {} : { state: resolvedGrant.state }),
    };
  }

  async function issueGatewayLocalSession(input: {
    authorizationGrant: ReservedGatewayAuthorizationGrant;
    client: GatewayClientContext;
    orcas?: CustomSsoOrcasContext | null;
  }): Promise<IssuedClientCredential> {
    const metadata = {
      version: 2 as const,
      mode: CustomSsoClientMode.Gateway,
      configVersion: input.client.configVersion,
    };
    const credential = await issueCustomSsoCredential({
      clientCode: input.client.clientCode,
      credentialId: input.authorizationGrant.reservation.attemptId,
      credentialMetadata: {
        ...metadata,
        ...(input.orcas === undefined || input.orcas === null
          ? {}
          : { orcasId: input.orcas.userId }),
      },
      principalSessionId: input.authorizationGrant.principalSessionId,
    });

    return {
      ...credential,
      orcasSessionId: input.orcas?.sessionId ?? null,
    };
  }

  async function redeemIndependentGrant(input: {
    client: IndependentClientContext;
    code: string;
    redirectUri: string;
    requestContext?: ApiRequestContext;
  }) {
    const authorizationGrant = await resolveIndependentAuthorizationGrant(input);
    return await deps.authorizationGrantRedemption.withLease(
      authorizationGrant.reservation,
      async (lease) => {
        let credential: Awaited<ReturnType<typeof issueIndependentCredential>> | undefined;
        let credentialIssueState: CredentialIssueState = "not_started";
        let subject;
        try {
          const principalSession = translateSubjectAccessResolveResult(
            await deps.kernel.resolvePrincipalSessionById(
              authorizationGrant.principalSessionId,
            ),
          );
          if (
            principalSession.status !== "resolved"
            || principalSession.value.principal.subjectId
            !== authorizationGrant.subjectIdentifier
          ) {
            throw new AuthzUnauthorizedError("全局session不存在或已过期");
          }

          const selection = parseSubjectClaimSelection({
            catalogVersion: SUBJECT_CLAIM_CATALOG.version,
            claims: [...input.client.subjectClaims],
          });
          subject = await resolveCustomSsoSubjectProjection(deps.subjectProjection, {
            subjectIdentifier: authorizationGrant.subjectIdentifier,
            clientCode: input.client.clientCode,
            selection,
          });

          credentialIssueState = "started";
          credential = await issueIndependentCredential({
            client: input.client,
            credentialId: authorizationGrant.reservation.attemptId,
            principalSessionId: authorizationGrant.principalSessionId,
          });
          credentialIssueState = "issued";
          const currentContext = await resolveIndependentCredentialContext(
            credential.token,
            input.client.clientCode,
          );
          if (
            currentContext.authenticatedClientCode !== input.client.clientCode
            || currentContext.subjectIdentifier !== authorizationGrant.subjectIdentifier
          ) {
            throw new AuthzUnauthorizedError("未登录");
          }

          const consumed = await lease.consume();
          if (consumed !== "consumed")
            throw new InvalidAuthCodeError("非法Code");
        }
        catch (error) {
          await handleCredentialIssueFailure({
            clientCode: input.client.clientCode,
            credentialId: authorizationGrant.reservation.attemptId,
            credentialIssueState,
            error,
            operation: "independent_credential_compensation",
            releaseGrant: async (reportedError, credentialMayExist) => {
              await releaseRetryableIndependentGrant(
                lease,
                reportedError,
                input.client.clientCode,
                input.requestContext,
                credentialMayExist,
              );
            },
            requestContext: input.requestContext,
          });
        }
        if (credential === undefined || subject === undefined)
          throw new InvalidAuthCodeError("非法Code");

        try {
          await deps.kernel.revokeArtifact(authorizationGrant.artifactId, "consumed");
        }
        catch {
          deps.logger.warn({
            clientCode: input.client.clientCode,
            ...observabilityLogFields(input.requestContext),
          }, "failed to remove consumed custom sso authorization artifact");
        }
        try {
          await deps.auditLogWriter.recordAuditLog(
            withApiRequestContext(
              input.requestContext,
              buildIndependentLoginSuccessAudit(
                authorizationGrant.subjectIdentifier,
                input.client.clientCode,
              ),
            ),
          );
        }
        catch {
          deps.logger.warn({
            clientCode: input.client.clientCode,
            operation: "independent_login_audit",
            outcome: "audit_failed",
            ...observabilityLogFields(input.requestContext),
          }, "custom sso independent login audit after-effect failed");
        }
        return {
          credential: credential.token,
          ttl: credential.ttl,
          subject,
        };
      },
    );
  }

  async function resolveIndependentAuthorizationGrant(input: {
    client: IndependentClientContext;
    code: string;
    redirectUri: string;
  }): Promise<ResolvedIndependentAuthorizationGrant> {
    const resolved = translateSubjectAccessResolveResult(
      await deps.kernel.resolveProtocolArtifact(input.code),
    );
    if (resolved.status !== "resolved")
      throw new InvalidAuthCodeError("非法Code");
    const artifact = resolved.value;
    const metadata = AuthCodeMetadataSchema.safeParse(artifact.metadata);
    if (
      artifact.protocol !== CUSTOM_SSO_PROTOCOL
      || artifact.artifactType !== AUTH_CODE_ARTIFACT_TYPE
      || artifact.clientCode !== input.client.clientCode
      || artifact.principalSessionId === undefined
      || artifact.principal === undefined
      || !metadata.success
      || metadata.data.subjectIdentifier !== artifact.principal.subjectId
      || metadata.data.clientCode !== input.client.clientCode
      || metadata.data.mode !== CustomSsoClientMode.Independent
      || metadata.data.redirectUri !== input.redirectUri
      || metadata.data.configVersion !== input.client.configVersion
    ) {
      throw new InvalidAuthCodeError("非法Code");
    }

    const reservation = await deps.authorizationGrantRedemption.begin(artifact.artifactId);
    if (reservation.status !== "reserved")
      throw new InvalidAuthCodeError("非法Code");

    return {
      artifactId: artifact.artifactId,
      principalSessionId: artifact.principalSessionId,
      reservation: reservation.reservation,
      subjectIdentifier: metadata.data.subjectIdentifier,
    };
  }

  async function issueIndependentCredential(input: {
    client: IndependentClientContext;
    credentialId: string;
    principalSessionId: string;
  }) {
    const metadata = {
      version: 2 as const,
      mode: CustomSsoClientMode.Independent,
      configVersion: input.client.configVersion,
    };
    return await issueCustomSsoCredential({
      clientCode: input.client.clientCode,
      credentialId: input.credentialId,
      credentialMetadata: metadata,
      principalSessionId: input.principalSessionId,
    });
  }

  async function issueCustomSsoCredential(input: {
    clientCode: string;
    credentialId: string;
    credentialMetadata: Record<string, unknown>;
    principalSessionId: string;
  }) {
    const ttlMs = deps.config.localSessionTtlSeconds * 1000;
    let issued;
    try {
      issued = await deps.kernel.issueCredential({
        credentialId: input.credentialId,
        principalSessionId: input.principalSessionId,
        protocol: CUSTOM_SSO_PROTOCOL,
        clientCode: input.clientCode,
        credentialType: LOCAL_SESSION_CREDENTIAL_TYPE,
        ttlMs,
        renewalPolicy: "extend_with_principal",
        tokenKind: "localSession",
        metadata: input.credentialMetadata,
      });
    }
    catch (error) {
      throw new CustomSsoCredentialIssueFailure(error, true);
    }

    let credential;
    try {
      credential = translateSubjectAccessResolveResult(issued);
    }
    catch (error) {
      throw new CustomSsoCredentialIssueFailure(error, false);
    }
    if (credential.status !== "created" || !credential.externalToken) {
      throw new CustomSsoCredentialIssueFailure(
        new AuthzUnauthorizedError("局部session创建失败"),
        credential.status === "fail_closed" && credential.cause !== undefined,
      );
    }

    const ttl = Math.floor((credential.value.expiresAt - deps.clock.now()) / 1000);
    if (ttl <= 0) {
      await deps.kernel.revokeCredential(credential.value.credentialId, "credential_corrupted");
      throw new AuthzUnauthorizedError("局部session创建失败");
    }
    return {
      credentialId: credential.value.credentialId,
      token: credential.externalToken,
      ttl,
    };
  }

  async function releaseRetryableIndependentGrant(
    lease: AuthorizationGrantLease,
    error: unknown,
    clientCode: string,
    requestContext?: ApiRequestContext,
    releaseAfterCredentialIssue = false,
  ) {
    if (!releaseAfterCredentialIssue && !isRetryableServiceUnavailable(error))
      return;
    try {
      const released = await lease.release();
      if (released === "released")
        return;
      deps.logger.warn({
        clientCode,
        operation: "independent_grant_release",
        outcome: released,
        ...observabilityLogFields(requestContext),
      }, "custom sso Independent grant release did not restore the issued state");
    }
    catch {
      deps.logger.warn({
        clientCode,
        operation: "independent_grant_release",
        outcome: "release_failed",
        ...observabilityLogFields(requestContext),
      }, "custom sso Independent grant release failed");
    }
  }

  async function releaseGatewayLease(
    lease: AuthorizationGrantLease,
    clientCode: string,
    requestContext?: ApiRequestContext,
  ) {
    try {
      const released = await lease.release();
      if (released !== "released") {
        deps.logger.warn({
          clientCode,
          operation: "gateway_grant_release",
          outcome: released,
          ...observabilityLogFields(requestContext),
        }, "custom sso Gateway grant release did not restore the issued state");
      }
    }
    catch {
      deps.logger.warn({
        clientCode,
        operation: "gateway_grant_release",
        outcome: "release_failed",
        ...observabilityLogFields(requestContext),
      }, "custom sso Gateway grant release failed");
    }
  }

  async function revokeFailedCredential(input: {
    clientCode: string;
    credentialId: string;
    operation: "gateway_local_session_compensation" | "independent_credential_compensation";
    requestContext?: ApiRequestContext;
  }) {
    try {
      await deps.kernel.revokeCredential(
        input.credentialId,
        "credential_corrupted",
      );
      return true;
    }
    catch {
      deps.logger.warn({
        clientCode: input.clientCode,
        operation: input.operation,
        outcome: "revoke_failed",
        ...observabilityLogFields(input.requestContext),
      }, "custom sso credential compensation failed closed");
      return false;
    }
  }

  async function handleCredentialIssueFailure(input: {
    clientCode: string;
    credentialId: string;
    credentialIssueState: CredentialIssueState;
    error: unknown;
    operation: "gateway_local_session_compensation" | "independent_credential_compensation";
    releaseGrant: (
      reportedError: unknown,
      credentialMayExist: boolean,
    ) => Promise<void>;
    requestContext?: ApiRequestContext;
  }): Promise<never> {
    const reportedError = input.error instanceof CustomSsoCredentialIssueFailure
      ? input.error.originalError
      : input.error;
    const credentialMayExist = input.error instanceof CustomSsoCredentialIssueFailure
      ? input.error.credentialMayExist
      : input.credentialIssueState !== "not_started";
    const compensated = !credentialMayExist
      || await revokeFailedCredential({
        clientCode: input.clientCode,
        credentialId: input.credentialId,
        operation: input.operation,
        requestContext: input.requestContext,
      });
    if (compensated)
      await input.releaseGrant(reportedError, credentialMayExist);
    throw reportedError;
  }

  async function resolveIndependentCredentialContext(
    credentialToken: string,
    clientCode: string,
  ) {
    return (await resolveLocalSessionContext(
      credentialToken,
      clientCode,
      CustomSsoClientMode.Independent,
    )).authenticationContext;
  }

  async function assertCurrentGatewayClient(expected: GatewayClientContext) {
    const client = await deps.clients.findRuntimeRecord(expected.clientCode);
    if (
      client === null
      || client.status === ClientStatus.Disable
      || client.isDelete
      || !client.customSsoEnabled
      || client.customSsoConfig?.mode !== CustomSsoClientMode.Gateway
      || client.customSsoConfigVersion !== expected.configVersion
      || client.customSsoConfig.orcas.enabled !== expected.orcasEnabled
    ) {
      throw new AuthzUnauthorizedError("非法code");
    }
  }

  async function completeGatewayLogin(input: {
    client: GatewayClientContext;
    code: string;
    redirectUrl: string;
    requestContext?: ApiRequestContext;
  }) {
    const authorizationGrant = await resolveAuthorizationGrant({
      client: input.client,
      code: input.code,
      redirectUrl: input.redirectUrl,
      invalidCodeError: "unauthorized",
    });
    return await deps.authorizationGrantRedemption.withLease(
      authorizationGrant.reservation,
      async (lease) => {
        let localSession: IssuedClientCredential | undefined;
        let credentialIssueState: CredentialIssueState = "not_started";
        let userDetail: UserDetailDto | undefined;
        try {
          const revalidated = translateSubjectAccessResolveResult(
            await deps.kernel.resolveProtocolArtifact(input.code),
          );
          if (revalidated.status !== "resolved")
            throw new AuthzUnauthorizedError("非法code");
          const revalidatedGrant = validateGatewayAuthorizationArtifact(
            revalidated.value,
            input,
            "unauthorized",
          );
          if (
            revalidated.value.artifactId !== authorizationGrant.artifactId
            || revalidatedGrant.principalSessionId
            !== authorizationGrant.principalSessionId
          ) {
            throw new AuthzUnauthorizedError("非法code");
          }

          const principalSession = translateSubjectAccessResolveResult(
            await deps.kernel.resolvePrincipalSessionById(
              authorizationGrant.principalSessionId,
            ),
          );
          if (principalSession.status !== "resolved")
            throw new AuthzUnauthorizedError("全局session不存在或已过期");

          let orcas: CustomSsoOrcasContext | null = null;
          if (input.client.orcasEnabled) {
            const liveUser = await assertLiveUserAvailable(
              principalSession.value.principal.subjectId,
              principalSession.value.subjectAccessTransitionId,
            );
            userDetail = await getProfileUserDetailById(liveUser.id);
            const { id, username, name, mobile } = userDetail;
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
          credentialIssueState = "started";
          localSession = await issueGatewayLocalSession({
            authorizationGrant,
            client: input.client,
            orcas,
          });
          credentialIssueState = "issued";

          await assertCurrentGatewayClient(input.client);
          const consumed = await lease.consume();
          if (consumed !== "consumed")
            throw new AuthzUnauthorizedError("非法code");
        }
        catch (error) {
          await handleCredentialIssueFailure({
            clientCode: input.client.clientCode,
            credentialId: authorizationGrant.reservation.attemptId,
            credentialIssueState,
            error,
            operation: "gateway_local_session_compensation",
            releaseGrant: async () => {
              await releaseGatewayLease(
                lease,
                input.client.clientCode,
                input.requestContext,
              );
            },
            requestContext: input.requestContext,
          });
        }
        if (localSession === undefined)
          throw new AuthzUnauthorizedError("局部session创建失败");

        try {
          await deps.kernel.revokeArtifact(authorizationGrant.artifactId, "consumed");
        }
        catch {
          deps.logger.warn({
            clientCode: input.client.clientCode,
            ...observabilityLogFields(input.requestContext),
          }, "failed to remove consumed custom sso authorization artifact");
        }
        try {
          await deps.auditLogWriter.recordAuditLog(
            withApiRequestContext(
              input.requestContext,
              buildGatewayLoginSuccessAudit(
                authorizationGrant.subjectIdentifier,
                input.client.clientCode,
              ),
            ),
          );
        }
        catch {
          deps.logger.warn({
            clientCode: input.client.clientCode,
            operation: "gateway_login_audit",
            outcome: "audit_failed",
            ...observabilityLogFields(input.requestContext),
          }, "custom sso Gateway login audit after-effect failed");
        }
        return {
          orcasSessionId: localSession.orcasSessionId,
          ...(authorizationGrant.state === undefined
            ? {}
            : { state: authorizationGrant.state }),
          token: localSession.token,
        };
      },
    );
  }

  async function authorizeLocalSession(
    localSessionToken: string,
    clientCode: string,
  ) {
    const context = await resolveValidatedCustomSsoCredential(
      localSessionToken,
      clientCode,
      CustomSsoClientMode.Gateway,
    );
    return await deps.subjectDelivery.resolveGatewaySubjectHeader({
      subjectIdentifier: context.subjectIdentifier,
      authenticatedClientCode: context.authenticatedClientCode,
      expectedConfigVersion: context.credentialConfigVersion,
    });
  }

  async function resolvePrincipalSessionContext(token: string) {
    const principalSession = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSession(token),
    );
    if (principalSession.status !== "resolved") {
      throw new AuthzUnauthorizedError("未登录");
    }
    return {
      subjectIdentifier: principalSession.value.principal.subjectId,
    };
  }

  async function resolveLocalSessionContext(
    localSessionToken: string,
    clientCode: string,
    expectedMode?: CustomSsoClientMode,
  ) {
    const credentialContext = await resolveValidatedCustomSsoCredential(
      localSessionToken,
      clientCode,
      expectedMode,
    );
    return {
      authenticationContext: toLocalSessionContext(credentialContext),
      credentialConfigVersion: credentialContext.credentialConfigVersion,
    };
  }

  async function resolvePublicAuthentication(
    sessionToken: string,
    clientCode: string,
  ) {
    if (clientCode === "iam") {
      const principal = await resolvePrincipalSessionContext(sessionToken);
      const authenticationContext = {
        ...principal,
        authenticatedClientCode: clientCode,
      };
      return {
        authenticationContext,
        subjectDeliveryCapability:
          deps.subjectDelivery.createUserInfoCapability(
            authenticationContext,
          ),
      };
    }

    const localSessionContext = await resolveLocalSessionContext(
      sessionToken,
      clientCode,
    );
    return {
      authenticationContext: localSessionContext.authenticationContext,
      subjectDeliveryCapability:
        deps.subjectDelivery.createUserInfoCapability({
          ...localSessionContext.authenticationContext,
          expectedConfigVersion:
            localSessionContext.credentialConfigVersion,
        }),
    };
  }

  async function logout(token: string | undefined): Promise<RevokeSummary | true> {
    if (!token) {
      return true;
    }

    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSession(token),
    );
    if (principal.status === "resolved") {
      return await deps.kernel.revokePrincipalSession(principal.value.principalSessionId, "logout");
    }

    const credential = translateSubjectAccessResolveResult(
      await deps.kernel.resolveCredential(token),
    );
    if (credential.status === "resolved" && credential.value.protocol === CUSTOM_SSO_PROTOCOL) {
      await assertLogoutCredentialCurrent(credential.value);
      return await deps.kernel.revokePrincipalSession(credential.value.principalSessionId, "logout");
    }

    return true;
  }

  async function assertLogoutCredentialCurrent(
    credential: IssuedCredential,
  ) {
    if (credential.bindingId !== undefined) {
      await deps.kernel.revokeCredential(
        credential.credentialId,
        "credential_corrupted",
      );
      throw new AuthzUnauthorizedError("未登录");
    }
    const metadata = CustomSsoCredentialMetadataSchema.safeParse(
      credential.metadata,
    );
    if (
      credential.credentialType !== LOCAL_SESSION_CREDENTIAL_TYPE
      || !metadata.success
    ) {
      throw new AuthzUnauthorizedError("未登录");
    }

    if (!await isCredentialClientCurrent(
      credential.clientCode,
      metadata.data,
    )) {
      throw new AuthzUnauthorizedError("未登录");
    }
  }

  async function resolveValidatedCustomSsoCredential(
    localSessionToken: string,
    clientCode: string,
    expectedMode?: CustomSsoClientMode,
  ): Promise<ValidatedCustomSsoCredentialContext> {
    const credential = translateSubjectAccessResolveResult(
      await deps.kernel.resolveCredential(localSessionToken),
    );
    if (credential.status !== "resolved") {
      throw new AuthzUnauthorizedError("未登录");
    }
    if (credential.value.protocol !== CUSTOM_SSO_PROTOCOL
      || credential.value.credentialType !== LOCAL_SESSION_CREDENTIAL_TYPE
      || credential.value.clientCode !== clientCode) {
      throw new AuthzUnauthorizedError("未登录");
    }
    if (credential.value.bindingId !== undefined) {
      await deps.kernel.revokeCredential(
        credential.value.credentialId,
        "credential_corrupted",
      );
      throw new AuthzUnauthorizedError("未登录");
    }

    const credentialMetadata = CustomSsoCredentialMetadataSchema.safeParse(
      credential.value.metadata,
    );
    if (!credentialMetadata.success) {
      await deps.kernel.revokeCredential(
        credential.value.credentialId,
        "credential_corrupted",
      );
      throw new AuthzUnauthorizedError("未登录");
    }
    if (
      expectedMode !== undefined
      && credentialMetadata.data.mode !== expectedMode
    ) {
      throw new AuthzUnauthorizedError("未登录");
    }

    if (!await isCredentialClientCurrent(
      clientCode,
      credentialMetadata.data,
    )) {
      await deps.kernel.revokeCredential(
        credential.value.credentialId,
        "client_config_changed",
      );
      throw new AuthzUnauthorizedError("未登录");
    }

    const principal = translateSubjectAccessResolveResult(
      await deps.kernel.resolvePrincipalSessionById(credential.value.principalSessionId),
    );
    if (principal.status !== "resolved") {
      await deps.kernel.revokeCredential(credential.value.credentialId, "credential_corrupted");
      throw new AuthzUnauthorizedError("未登录");
    }

    return {
      subjectIdentifier: principal.value.principal.subjectId,
      authenticatedClientCode: clientCode,
      credentialConfigVersion: credentialMetadata.data.configVersion,
      ...(credentialMetadata.data.mode === CustomSsoClientMode.Gateway
        && credentialMetadata.data.orcasId !== undefined
        ? { orcasId: credentialMetadata.data.orcasId }
        : {}),
    };
  }

  async function isCredentialClientCurrent(
    clientCode: string,
    metadata: CustomSsoCredentialMetadata,
  ) {
    const client = await deps.clients.findRuntimeRecord(clientCode);
    return client !== null
      && client.clientCode === clientCode
      && client.status !== ClientStatus.Disable
      && !client.isDelete
      && client.customSsoEnabled
      && client.customSsoConfig !== null
      && client.customSsoConfig.mode === metadata.mode
      && client.customSsoConfigVersion === metadata.configVersion;
  }

  async function assertLiveUserAvailable(
    subjectIdentifier: string,
    subjectAccessTransitionId: string,
  ) {
    const user = await deps.userService.getActiveUserBySubjectIdentifier(subjectIdentifier);
    if (user === null) {
      await deps.kernel.revokeUserSessions({
        principalType: "user",
        subjectId: subjectIdentifier,
      }, "user_disabled", {
        onlySubjectAccessTransitionId: subjectAccessTransitionId,
      });
      throw new AuthzUnauthorizedError("未登录");
    }
    return user;
  }

  async function getProfileUserDetailById(userId: number) {
    try {
      return await deps.userService.getUserDetailById(userId);
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
    inspectPrincipalSession,
    logout,
    redeemIndependentGrant,
    resolvePublicAuthentication,
  };
}

function toLocalSessionContext(
  context: ValidatedCustomSsoCredentialContext,
): CustomSsoLocalSessionContext {
  return {
    subjectIdentifier: context.subjectIdentifier,
    authenticatedClientCode: context.authenticatedClientCode,
    ...(context.orcasId === undefined
      ? {}
      : { orcasId: context.orcasId }),
  };
}

function validateGatewayAuthorizationArtifact(
  artifact: ProtocolArtifact,
  input: {
    client: GatewayClientContext;
    redirectUrl?: string;
  },
  invalidCodeError?: "unauthorized" | "invalid_auth_code",
) {
  const metadata = AuthCodeMetadataSchema.safeParse(artifact.metadata);
  if (
    artifact.protocol !== CUSTOM_SSO_PROTOCOL
    || artifact.artifactType !== AUTH_CODE_ARTIFACT_TYPE
    || artifact.clientCode !== input.client.clientCode
    || artifact.principalSessionId === undefined
    || artifact.principal === undefined
    || !metadata.success
    || metadata.data.subjectIdentifier !== artifact.principal.subjectId
    || metadata.data.clientCode !== input.client.clientCode
    || metadata.data.mode !== CustomSsoClientMode.Gateway
    || metadata.data.configVersion !== input.client.configVersion
    || (input.redirectUrl !== undefined
      && metadata.data.redirectUri !== input.redirectUrl)
  ) {
    throwInvalidCode(invalidCodeError);
  }
  return {
    principalSessionId: artifact.principalSessionId,
    subjectIdentifier: metadata.data.subjectIdentifier,
    ...(metadata.data.state === undefined ? {} : { state: metadata.data.state }),
  };
}

function throwInvalidCode(kind: "unauthorized" | "invalid_auth_code" = "invalid_auth_code"): never {
  if (kind === "unauthorized") {
    throw new AuthzUnauthorizedError("非法code");
  }
  throw new InvalidAuthCodeError("非法Code");
}

export type CustomSsoSessionKernelAdapter = ReturnType<typeof createCustomSsoSessionKernelAdapter>;
