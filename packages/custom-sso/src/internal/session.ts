import type { SubjectClaimName } from "@iam/contracts";
import type { AuditRequestContext } from "@iam/domain/audit";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  IssuedCredential,
  ProtocolArtifact,
  RevokeSummary,
} from "@iam/session-kernel";

import type { CustomSsoAuditPort, CustomSsoKernelPort, CustomSsoLoggerPort as LoggerPort } from "../custom-sso.port";

import type {
  CustomSsoSubjectProjectionPort,
} from "../subject-projection.port";
import type {
  CustomSsoAccess,
  CustomSsoOrcasLoginPort,
  CustomSsoSubjectDeliveryPort,
} from "./session.port";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { observabilityLogFields } from "@iam/api-core/observability";
import {
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
} from "@iam/api-core/subject-access";
import {
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
} from "@iam/client-subject-projection";
import {
  ClientStatus,
  CustomSsoClientMode,
} from "@iam/contracts";
import { resolveCustomSsoSubjectProjection } from "@iam/custom-sso/wire";
import { z } from "zod";
import { PrincipalSessionInspectionUnavailableError } from "../principal-session-inspection.error";
import { CustomSsoConfigurationUnavailableError, CustomSsoRequestMismatchError } from "../protocol-validation.error";
import { buildGatewayLoginSuccessAudit, buildIndependentLoginSuccessAudit, withRequestContext } from "./audit";

const CUSTOM_SSO_PROTOCOL = "custom-sso";
const AUTH_CODE_ARTIFACT_TYPE = "auth_code";
const LOCAL_SESSION_CREDENTIAL_TYPE = "local_session";

type CustomSsoPrincipalTokenSource = "cookie" | "authorization_header" | "query" | "none";

interface ResolvedGatewayAuthorizationGrant {
  artifact: ProtocolArtifact;
  principalSessionId: string;
  subjectIdentifier: string;
  state?: string;
}

interface IssuedClientCredential {
  credentialId: string;
  token: string;
  ttl: number;
  orcasSessionId: string | null;
}

class CustomSsoCredentialIssueFailure {
  constructor(
    readonly originalError: unknown,
    readonly credentialMayExist: boolean,
  ) {}
}

interface CustomSsoOrcasContext {
  userId: string;
  sessionId: string | null;
}

interface CustomSsoLocalSessionContext {
  subjectIdentifier: string;
  authenticatedClientCode: string;
  orcasId?: string;
}

type ValidatedCustomSsoCredentialContext
  = CustomSsoLocalSessionContext & {
    credentialConfigVersion: number;
    runtimeClient: CustomSsoClientRuntimeDto;
  };

interface IndependentClientContext {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly subjectClaims: readonly SubjectClaimName[];
}

interface GatewayClientContext {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly orcasEnabled: boolean;
}

interface ResolvedIndependentAuthorizationGrant {
  artifact: ProtocolArtifact;
  principalSessionId: string;
  subjectIdentifier: string;
}

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
  access: CustomSsoAccess;
  clients: {
    findRuntimeRecord: (
      clientCode: string,
    ) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  kernel: CustomSsoKernelPort;
  logger: Pick<LoggerPort, "info" | "warn">;
  orcas: CustomSsoOrcasLoginPort;
  subjectProjection: CustomSsoSubjectProjectionPort;
  subjectDelivery: CustomSsoSubjectDeliveryPort;
  auditLogWriter: CustomSsoAuditPort;
  random: { uuid: () => string };
  config: {
    authCodeExpireSeconds: number;
    localSessionTtlSeconds: number;
  };
}

export function createCustomSsoSessionKernelAdapter(deps: CustomSsoSessionKernelAdapterDeps) {
  async function issueAuthorizationCode(input: {
    token?: string;
    tokenSource: CustomSsoPrincipalTokenSource;
    clientCode: string;
    configVersion: number;
    mode: CustomSsoClientMode;
    redirectUrl: string;
    requestContext?: AuditRequestContext;
    state?: string;
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

    const artifactId = deps.random.uuid();
    const artifact = await deps.kernel.createProtocolArtifact({
      artifactId,
      principalSessionId: renewed.value.principalSessionId,
      protocol: CUSTOM_SSO_PROTOCOL,
      clientCode: input.clientCode,
      artifactType: AUTH_CODE_ARTIFACT_TYPE,
      cleanupRefs: [],
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
    });
    if (artifact.status !== "created" || !artifact.externalToken) {
      throw new CustomError("授权码创建失败");
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
      const principal = await deps.kernel.resolvePrincipalSession(token);
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
  }): Promise<ResolvedGatewayAuthorizationGrant> {
    const resolved = await deps.kernel.resolveProtocolArtifact(input.code, { protocol: CUSTOM_SSO_PROTOCOL, artifactType: AUTH_CODE_ARTIFACT_TYPE, clientCode: input.client.clientCode });
    if (resolved.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: resolved.cause });
    if (resolved.status !== "resolved") {
      throwInvalidCode(input.invalidCodeError);
    }
    const resolvedGrant = await validateAuthorizationArtifact(
      resolved.value,
      input,
      CustomSsoClientMode.Gateway,
      input.invalidCodeError,
    );
    await acquireGrantPermission(resolved.value, resolvedGrant.subjectIdentifier, resolvedGrant.principalSessionId);

    return {
      artifact: resolved.value,
      principalSessionId: resolvedGrant.principalSessionId,
      subjectIdentifier: resolvedGrant.subjectIdentifier,
      ...(resolvedGrant.state === undefined ? {} : { state: resolvedGrant.state }),
    };
  }

  async function issueGatewayLocalSession(input: {
    authorizationGrant: ResolvedGatewayAuthorizationGrant;
    credentialId: string;
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
      credentialId: input.credentialId,
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
    requestContext?: AuditRequestContext;
  }) {
    const authorizationGrant = await resolveIndependentAuthorizationGrant(input);
    const principal = await deps.kernel.resolvePrincipalSessionById(authorizationGrant.principalSessionId);
    if (principal.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: principal.cause });
    if (principal.status !== "resolved" || principal.value.principal.subjectId !== authorizationGrant.subjectIdentifier)
      throw new AuthzUnauthorizedError("全局session不存在或已过期");

    // One authority owns consumption. Only a confirmed CAS success permits effects.
    const consumed = await deps.kernel.consumeProtocolArtifact(input.code, {
      protocol: CUSTOM_SSO_PROTOCOL,
      artifactType: AUTH_CODE_ARTIFACT_TYPE,
      clientCode: input.client.clientCode,
    }, authorizationGrant.artifact);
    if (consumed.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: consumed.cause });
    if (consumed.status !== "resolved")
      throw new InvalidAuthCodeError("非法Code");

    const selection = parseSubjectClaimSelection({
      catalogVersion: SUBJECT_CLAIM_CATALOG.version,
      claims: [...input.client.subjectClaims],
    });
    const subject = await resolveCustomSsoSubjectProjection(deps.subjectProjection, {
      subjectIdentifier: authorizationGrant.subjectIdentifier,
      clientCode: input.client.clientCode,
      selection,
    });
    const credentialId = deps.random.uuid();
    let credential;
    try {
      credential = await issueIndependentCredential({
        client: input.client,
        credentialId,
        principalSessionId: authorizationGrant.principalSessionId,
      });
      // Keep parent existence/revocation and subject equality after issuance.
      // The operation adapter reuses permission; no new account/config observation.
      const postIssuePrincipal = await deps.kernel.resolvePrincipalSessionById(authorizationGrant.principalSessionId);
      if (postIssuePrincipal.status !== "resolved"
        || postIssuePrincipal.value.principal.subjectId !== authorizationGrant.subjectIdentifier) {
        throw new AuthzUnauthorizedError("全局session不存在或已过期");
      }
    }
    catch (error) {
      const reportedError = error instanceof CustomSsoCredentialIssueFailure ? error.originalError : error;
      if (!(error instanceof CustomSsoCredentialIssueFailure) || error.credentialMayExist) {
        await revokeFailedCredential({
          clientCode: input.client.clientCode,
          credentialId,
          operation: "independent_credential_compensation",
          requestContext: input.requestContext,
        });
      }
      throw reportedError;
    }

    try {
      await deps.auditLogWriter.recordAuditLog(withRequestContext(
        input.requestContext,
        buildIndependentLoginSuccessAudit(authorizationGrant.subjectIdentifier, input.client.clientCode),
      ));
    }
    catch {
      deps.logger.warn({
        clientCode: input.client.clientCode,
        operation: "independent_login_audit",
        outcome: "audit_failed",
        ...observabilityLogFields(input.requestContext),
      }, "custom sso independent login audit after-effect failed");
    }
    return { credential: credential.token, ttl: credential.ttl, subject };
  }

  async function resolveIndependentAuthorizationGrant(input: {
    client: IndependentClientContext;
    code: string;
    redirectUri: string;
  }): Promise<ResolvedIndependentAuthorizationGrant> {
    const resolved = await deps.kernel.resolveProtocolArtifact(input.code, { protocol: CUSTOM_SSO_PROTOCOL, artifactType: AUTH_CODE_ARTIFACT_TYPE, clientCode: input.client.clientCode });
    if (resolved.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: resolved.cause });
    if (resolved.status !== "resolved")
      throw new InvalidAuthCodeError("非法Code");
    const artifact = resolved.value;
    const metadata = await validateAuthorizationArtifact(artifact, { client: input.client, redirectUrl: input.redirectUri }, CustomSsoClientMode.Independent);

    await acquireGrantPermission(artifact, metadata.subjectIdentifier, metadata.principalSessionId);
    return {
      artifact,
      principalSessionId: metadata.principalSessionId,
      subjectIdentifier: metadata.subjectIdentifier,
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
      credential = issued;
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

    const ttl = Math.ceil((credential.value.expiresAt - credential.observedAt) / 1000);
    return {
      credentialId: credential.value.credentialId,
      token: credential.externalToken,
      ttl,
    };
  }

  async function revokeFailedCredential(input: {
    clientCode: string;
    credentialId: string;
    operation: "gateway_local_session_compensation" | "independent_credential_compensation";
    requestContext?: AuditRequestContext;
  }) {
    try {
      await deps.kernel.revokeCredential(
        input.credentialId,
        "credential_corrupted",
      );
    }
    catch {
      deps.logger.warn({
        clientCode: input.clientCode,
        operation: input.operation,
        outcome: "revoke_failed",
        ...observabilityLogFields(input.requestContext),
      }, "custom sso credential compensation failed closed");
    }
  }

  async function completeGatewayLogin(input: {
    client: GatewayClientContext;
    code: string;
    redirectUrl: string;
    requestContext?: AuditRequestContext;
  }) {
    const authorizationGrant = await resolveAuthorizationGrant({
      client: input.client,
      code: input.code,
      redirectUrl: input.redirectUrl,
      invalidCodeError: "unauthorized",
    });
    const principalSession = await deps.kernel.resolvePrincipalSessionById(authorizationGrant.principalSessionId);
    if (principalSession.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: principalSession.cause });
    if (principalSession.status !== "resolved"
      || principalSession.value.principal.subjectId !== authorizationGrant.subjectIdentifier) {
      throw new AuthzUnauthorizedError("全局session不存在或已过期");
    }

    const consumed = await deps.kernel.consumeProtocolArtifact(input.code, {
      protocol: CUSTOM_SSO_PROTOCOL,
      artifactType: AUTH_CODE_ARTIFACT_TYPE,
      clientCode: input.client.clientCode,
    }, authorizationGrant.artifact);
    if (consumed.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: consumed.cause });
    if (consumed.status !== "resolved")
      throw new AuthzUnauthorizedError("非法code");

    let orcas: CustomSsoOrcasContext | null = null;
    if (input.client.orcasEnabled) {
      const { id, username, name, mobile } = await resolveOrcasUser(principalSession.value);
      const { orcasSessionId, orcasId } = await deps.orcas.orcasLogin({ id, username, name, mobile });
      orcas = { userId: orcasId, sessionId: orcasSessionId };
    }
    const credentialId = deps.random.uuid();
    let localSession;
    try {
      localSession = await issueGatewayLocalSession({ authorizationGrant, credentialId, client: input.client, orcas });
      const postIssuePrincipal = await deps.kernel.resolvePrincipalSessionById(authorizationGrant.principalSessionId);
      if (postIssuePrincipal.status !== "resolved"
        || postIssuePrincipal.value.principal.subjectId !== authorizationGrant.subjectIdentifier) {
        throw new AuthzUnauthorizedError("全局session不存在或已过期");
      }
    }
    catch (error) {
      const reportedError = error instanceof CustomSsoCredentialIssueFailure ? error.originalError : error;
      if (!(error instanceof CustomSsoCredentialIssueFailure) || error.credentialMayExist) {
        await revokeFailedCredential({
          clientCode: input.client.clientCode,
          credentialId,
          operation: "gateway_local_session_compensation",
          requestContext: input.requestContext,
        });
      }
      throw reportedError;
    }

    try {
      await deps.auditLogWriter.recordAuditLog(withRequestContext(
        input.requestContext,
        buildGatewayLoginSuccessAudit(authorizationGrant.subjectIdentifier, input.client.clientCode),
      ));
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
      ...(authorizationGrant.state === undefined ? {} : { state: authorizationGrant.state }),
      token: localSession.token,
      ttl: localSession.ttl,
    };
  }

  async function authorizeLocalSession(
    localSessionToken: string,
    clientCode: string,
    clientDenied = false,
  ) {
    const context = await resolveValidatedCustomSsoCredential(
      localSessionToken,
      clientCode,
      CustomSsoClientMode.Gateway,
      clientDenied,
    );
    return await deps.subjectDelivery.resolveGatewaySubjectHeader({
      subjectIdentifier: context.subjectIdentifier,
      authenticatedClientCode: context.authenticatedClientCode,
      expectedConfigVersion: context.credentialConfigVersion,
    }, context.runtimeClient);
  }

  async function resolvePrincipalSessionContext(token: string) {
    const principalSession = await deps.kernel.resolvePrincipalSession(token);
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
      runtimeClient: credentialContext.runtimeClient,
    };
  }

  async function resolvePublicAuthentication(
    sessionToken: string,
    clientCode: string,
    clientDenied = false,
  ) {
    if (clientDenied) {
      if (clientCode !== "iam")
        await resolveValidatedCustomSsoCredential(sessionToken, clientCode, undefined, true);
      throw new AuthzUnauthorizedError("未登录");
    }
    if (clientCode === "iam") {
      const principal = await resolvePrincipalSessionContext(sessionToken);
      const authenticationContext = {
        ...principal,
        authenticatedClientCode: clientCode,
      };
      const runtimeClient = await deps.clients.findRuntimeRecord(clientCode);
      if (runtimeClient === null)
        throw new AuthzUnauthorizedError("未登录");
      return {
        authenticationContext,
        subjectDeliveryCapability:
          deps.subjectDelivery.createUserInfoCapability(
            authenticationContext,
            runtimeClient,
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
        }, localSessionContext.runtimeClient),
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

    const credential = await deps.kernel.resolveCredential(token, { protocol: CUSTOM_SSO_PROTOCOL, credentialType: LOCAL_SESSION_CREDENTIAL_TYPE });
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
      await deps.kernel.revokeObservedObject(
        credential,
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
    clientDenied = false,
  ): Promise<ValidatedCustomSsoCredentialContext> {
    const credential = await deps.kernel.resolveCredential(localSessionToken, { protocol: CUSTOM_SSO_PROTOCOL, credentialType: LOCAL_SESSION_CREDENTIAL_TYPE, clientCode });
    if (credential.status === "purpose_mismatch")
      throw new CustomSsoRequestMismatchError();
    if (credential.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: credential.cause });
    if (credential.status !== "resolved") {
      throw new AuthzUnauthorizedError("未登录");
    }
    const mode = z.object({ mode: z.enum(CustomSsoClientMode) }).safeParse(credential.value.metadata);
    if (expectedMode !== undefined && mode.success && mode.data.mode !== expectedMode)
      throw new CustomSsoRequestMismatchError();
    if (credential.value.protocol !== CUSTOM_SSO_PROTOCOL
      || credential.value.credentialType !== LOCAL_SESSION_CREDENTIAL_TYPE
      || credential.value.clientCode !== clientCode) {
      throw new CustomSsoRequestMismatchError();
    }
    if (credential.value.bindingId !== undefined) {
      await deps.kernel.revokeObservedObject(
        credential.value,
        "credential_corrupted",
      );
      throw new AuthzUnauthorizedError("未登录");
    }

    const credentialMetadata = CustomSsoCredentialMetadataSchema.safeParse(
      credential.value.metadata,
    );
    if (!credentialMetadata.success) {
      await deps.kernel.revokeObservedObject(
        credential.value,
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

    const currentClient = await deps.clients.findRuntimeRecord(clientCode);
    if (currentClient !== null && credentialMetadata.data.configVersion > currentClient.customSsoConfigVersion)
      throw new CustomSsoRequestMismatchError();
    const runtimeClient = isCredentialClientCurrentRecord(currentClient, clientCode, credentialMetadata.data) ? currentClient : null;
    if (clientDenied || runtimeClient === null) {
      await deps.kernel.revokeObservedObject(
        credential.value,
        "client_config_changed",
      );
      throw new AuthzUnauthorizedError("未登录");
    }

    await requireSubjectAccessOperation(deps.access.operation).acquireForSession({
      subjectIdentifier: credential.value.principal.subjectId,
      subjectContext: credential.value.subjectContext,
      principalSessionId: credential.value.principalSessionId,
    });
    const principal = await deps.kernel.resolvePrincipalSessionById(credential.value.principalSessionId);
    if (principal.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: principal.cause });
    if (principal.status !== "resolved") {
      await deps.kernel.revokeObservedObject(credential.value, "credential_corrupted");
      throw new AuthzUnauthorizedError("未登录");
    }

    return {
      subjectIdentifier: principal.value.principal.subjectId,
      authenticatedClientCode: clientCode,
      credentialConfigVersion: credentialMetadata.data.configVersion,
      runtimeClient,
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
    return await findCredentialClient(clientCode, metadata) !== null;
  }

  async function findCredentialClient(
    clientCode: string,
    metadata: CustomSsoCredentialMetadata,
  ) {
    const client = await deps.clients.findRuntimeRecord(clientCode);
    return isCredentialClientCurrentRecord(client, clientCode, metadata) ? client : null;
  }

  function isCredentialClientCurrentRecord(client: CustomSsoClientRuntimeDto | null, clientCode: string, metadata: CustomSsoCredentialMetadata) {
    return client !== null
      && client.clientCode === clientCode
      && client.status !== ClientStatus.Disable
      && !client.isDelete
      && client.customSsoEnabled
      && client.customSsoConfig !== null
      && client.customSsoConfig.mode === metadata.mode
      && client.customSsoConfigVersion === metadata.configVersion;
  }

  async function acquireGrantPermission(artifact: ProtocolArtifact, subjectIdentifier: string, principalSessionId: string) {
    await requireSubjectAccessOperation(deps.access.operation).acquireForSession({
      subjectIdentifier,
      subjectContext: artifact.subjectContext,
      principalSessionId,
    });
  }

  async function validateAuthorizationArtifact(
    artifact: ProtocolArtifact,
    input: { client: { clientCode: string; configVersion?: number }; redirectUrl?: string },
    mode: CustomSsoClientMode,
    invalidCodeError?: "unauthorized" | "invalid_auth_code",
    clientDenied = false,
  ) {
    const ownership = z.object({
      clientCode: z.string(),
      mode: z.enum(CustomSsoClientMode),
      redirectUri: z.string(),
    }).safeParse(artifact.metadata);
    // Establish request ownership independently of the version/full metadata parser.
    if (artifact.protocol !== CUSTOM_SSO_PROTOCOL
      || artifact.artifactType !== AUTH_CODE_ARTIFACT_TYPE
      || artifact.clientCode !== input.client.clientCode
      || !ownership.success
      || ownership.data.clientCode !== input.client.clientCode
      || ownership.data.mode !== mode
      || (input.redirectUrl !== undefined && ownership.data.redirectUri !== input.redirectUrl)) {
      throwInvalidCode(invalidCodeError);
    }

    const metadata = AuthCodeMetadataSchema.safeParse(artifact.metadata);
    if (metadata.success && input.client.configVersion !== undefined
      && metadata.data.configVersion > input.client.configVersion) {
      throwInvalidCode(invalidCodeError);
    }
    if (clientDenied || !metadata.success || artifact.principalSessionId === undefined || artifact.principal === undefined
      || metadata.data.subjectIdentifier !== artifact.principal.subjectId
      || metadata.data.configVersion !== input.client.configVersion) {
      await deps.kernel.revokeObservedObject(artifact, metadata.success ? "client_config_changed" : "credential_corrupted");
      throwInvalidCode(invalidCodeError);
    }
    return {
      principalSessionId: artifact.principalSessionId,
      subjectIdentifier: metadata.data.subjectIdentifier,
      ...(metadata.data.state === undefined ? {} : { state: metadata.data.state }),
    };
  }

  async function rejectAuthorizationGrant(input: {
    code: string;
    clientCode: string;
    redirectUri: string;
    mode: CustomSsoClientMode;
  }) {
    const resolved = await deps.kernel.resolveProtocolArtifact(input.code, {
      protocol: CUSTOM_SSO_PROTOCOL,
      artifactType: AUTH_CODE_ARTIFACT_TYPE,
      clientCode: input.clientCode,
    });
    if (resolved.status === "fail_closed")
      throw new CustomSsoConfigurationUnavailableError({ cause: resolved.cause });
    if (resolved.status === "resolved") {
      const client = await deps.clients.findRuntimeRecord(input.clientCode);
      await validateAuthorizationArtifact(resolved.value, {
        client: { clientCode: input.clientCode, configVersion: client?.customSsoConfigVersion },
        redirectUrl: input.redirectUri,
      }, input.mode, input.mode === CustomSsoClientMode.Gateway ? "unauthorized" : "invalid_auth_code", true);
    }
  }

  async function resolveOrcasUser(principal: { principal: { subjectId: string } }) {
    requireSubjectAccessOperation(deps.access.operation).requirePermission(principal.principal.subjectId);
    const user = await deps.access.users.findOrcasUserBySubjectIdentifier(principal.principal.subjectId);
    if (user === null)
      throw new AuthzUnauthorizedError("未登录");
    return user;
  }

  function logLegacyBearerSource(
    source: CustomSsoPrincipalTokenSource,
    clientCode: string,
    requestContext?: AuditRequestContext,
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
    issueAuthorizationCode,
    inspectPrincipalSession,
    logout,
    redeemIndependentGrant,
    rejectAuthorizationGrant,
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

function throwInvalidCode(kind: "unauthorized" | "invalid_auth_code" = "invalid_auth_code"): never {
  if (kind === "unauthorized") {
    throw new AuthzUnauthorizedError("非法code");
  }
  throw new InvalidAuthCodeError("非法Code");
}

export type CustomSsoSessionKernelAdapter = ReturnType<typeof createCustomSsoSessionKernelAdapter>;
