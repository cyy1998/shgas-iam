import { createApiPublicAuthenticationHandler } from "@api/middlewares/public-authentication";
import type { CreateAuthHandlersDeps } from "@api/routes/auth/auth.handlers";
import {
  createInternalAuthzHandler,
  createLocalSessionAuthzHandler,
  createRootAuthHandlers,
} from "@api/routes/auth/auth.handlers";
import * as authRoutes from "@api/routes/auth/auth.routes";
import { createOidcHttpRouter } from "@api/routes/oidc/oidc.http";
import {
  createPublicDelegationHandlers,
  type PublicDelegationDependencies,
} from "@api/routes/public/delegation/delegation.handlers";
import { createPublicDelegationRoute } from "@api/routes/public/delegation/delegation.index";
import type { CreatePublicHandlersDeps } from "@api/routes/public/public.handlers";
import { createPublicHandlers, createRootPublicHandlers } from "@api/routes/public/public.handlers";
import * as publicRoutes from "@api/routes/public/public.routes";
import type { CreateRootSsoHandlersDeps, SsoEndpointsOptions } from "@api/routes/sso/sso.handlers";
import { createRootSsoHandlers, createSsoEndpointsHandler } from "@api/routes/sso/sso.handlers";
import * as ssoRoutes from "@api/routes/sso/sso.routes";
import { CUSTOM_SSO_BASIC_SECURITY_SCHEME } from "@api/routes/sso/sso.security";
import {
  createInspectCustomSsoWechatQr,
  createUnifiedAuthorizationHandlers,
} from "@api/routes/sso/unified-authorization.handlers";
import { createUnifiedCallbackHandler } from "@api/routes/sso/unified-callback.handler";
import { createUnifiedTokenHandler } from "@api/routes/sso/unified-token.handler";
import { getWechatLoginLogPath } from "@api/routes/sso/wechat-login-log-path";
import { createWechatQrDesktopRouter, createWechatQrMobileRouter } from "@api/routes/sso/wechat-qr.http";
import { createRootSessionService } from "@api/services/authentication/root-session.service";
import { createUserSessionAuthenticationAdapter } from "@api/services/authentication/user-session.adapter";
import { createWechatQrState } from "@api/services/authentication/wechat-qr.state";
import { createCustomSsoSubjectDeliveryRequestScope } from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/transport/custom-sso-delivery.security";
import type {
  WechatQrCompletionPorts,
  WechatQrConfig,
  WechatQrDirectoryPort,
  WechatQrIdentityPort,
} from "@api/use-cases/authentication/wechat-qr/wechat-qr.port";
import { createWechatQrUseCase } from "@api/use-cases/authentication/wechat-qr/wechat-qr.use-case";
import type { WechatQrBindingPorts } from "@api/use-cases/authentication/wechat-qr/wechat-qr-binding.port";
import { createWechatQrBindingUseCase } from "@api/use-cases/authentication/wechat-qr/wechat-qr-binding.use-case";
import { createWechatQrCompletionUseCase } from "@api/use-cases/authentication/wechat-qr/wechat-qr-completion.use-case";
import { createRouter } from "@iam/api-core/core/create-router";
import { createErrorHandler } from "@iam/api-core/middlewares";
import type { PublicBindings } from "@iam/api-core/types";
import type { ClientSnapshotReader } from "@iam/client-snapshot";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import type { UnifiedCustomSsoAuthorizationOptions, UnifiedCustomSsoOperationsOptions } from "@iam/custom-sso";
import {
  createSsoRedirectUrlValidator,
  createUnifiedCustomSsoAuthorization,
  createUnifiedCustomSsoOperations,
} from "@iam/custom-sso";
import type {
  OidcAuthorizationOptions,
  OidcClientAuthRateLimiter,
  OidcHintVerificationPort,
  OidcTokenOptions,
} from "@iam/oidc";
import {
  createOidcAuthorization,
  createOidcLogout,
  createOidcTokens,
  createOidcUserInfo,
  OidcProtocolError,
  OidcStateUnavailableError,
} from "@iam/oidc";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import type { SubjectAccessOperation, SubjectAccessOperationBarrierPort } from "@iam/subject-access";
import {
  createSubjectAccessOperations,
  requireSubjectAccessOperation,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";
import { createAuthenticationUseCases } from "./use-cases/authentication";

type AuthenticationOptions = Parameters<typeof createAuthenticationUseCases>[0];
type ProjectionOptions = Parameters<typeof createPermittedClientSubjectProjectionService<SubjectAccessOperation>>[0];

export interface RootAuthenticationCompositionOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  barrier: SubjectAccessOperationBarrierPort;
  authentication: Omit<AuthenticationOptions, "services"> & {
    services: Omit<AuthenticationOptions["services"], "principalSessions" | "oaCurrentSessions" | "user"> & {
      user: AuthenticationOptions["services"]["user"] & WechatQrCompletionPorts["users"];
      loginRestriction: AuthenticationOptions["services"]["loginRestriction"] &
        WechatQrBindingPorts["loginRestriction"];
    };
  };
  clients: ClientSnapshotReader;
  subjectFacts: ProjectionOptions["subjectFacts"];
  loginCredentialParser: CreateAuthHandlersDeps["loginCredentialParser"];
  internalClients: CreateAuthHandlersDeps["clientService"];
  internalAuthzLogger?: CreateAuthHandlersDeps["logger"];
  logger: Parameters<typeof createErrorHandler>[0];
  config: CreateRootSsoHandlersDeps["config"];
  endpoints?: SsoEndpointsOptions;
  publicServices?: Pick<CreatePublicHandlersDeps, "userService">;
  publicDelegation?: PublicDelegationDependencies;
  customSso?: Omit<UnifiedCustomSsoAuthorizationOptions, "kernel" | "clients" | "redirectUrls">;
  oidc?: Omit<OidcAuthorizationOptions, "kernel" | "clients"> & {
    issuers: { internal: string; external: string };
    secureCookies: boolean;
  };
  wechatQr?: {
    redis: Parameters<typeof createWechatQrState>[0];
    namespace: string;
    config: WechatQrConfig;
    directory: WechatQrDirectoryPort;
    wechat: WechatQrIdentityPort;
    binding?: Pick<
      WechatQrBindingPorts,
      "users" | "sms" | "uow" | "verifyUserPassword" | "credentials" | "humanRisk" | "humanVerification"
    >;
  };
  oidcClientAuth?: OidcClientAuthRateLimiter;
  oidcTrustProxy?: boolean;
  oidcTokens?: Pick<OidcTokenOptions, "credentials" | "signing" | "tokenTtlSeconds" | "failureEffectTimeoutMs">;
  oidcLogout?: { verification: OidcHintVerificationPort; confirmationTtlSeconds: number };
  customSsoAccess?: Pick<
    UnifiedCustomSsoOperationsOptions,
    "credentials" | "tokenTtlSeconds" | "failureEffectTimeoutMs" | "business"
  > & {
    managed?: UnifiedCustomSsoOperationsOptions["managed"];
  };
}

/** One generation owns root authentication and both online protocols. */
export function createRootAuthenticationComposition(options: RootAuthenticationCompositionOptions) {
  let operations: ReturnType<typeof createSubjectAccessOperations>;
  const revocation = createUnifiedSubjectAccessSessionRevocation(options.kernel, {
    run: (callback) => operations.run(callback),
  });
  operations = createSubjectAccessOperations({ barrier: options.barrier, revocation });
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts: options.subjectFacts,
    assertPermission: (operation, subjectIdentifier) =>
      requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier),
  });
  const customAccess =
    options.customSso &&
    options.customSsoAccess &&
    createUnifiedCustomSsoOperations({
      ...options.customSsoAccess,
      redis: options.customSso.redis,
      namespace: options.customSso.namespace,
      kernel: options.kernel,
      clients: options.clients,
      projection,
    });
  const roots = createRootSessionService({
    logoutApplicationToken: (token, operation) =>
      customAccess ? customAccess.forOperation(operation).logout(token) : Promise.resolve(false),
    kernel: options.kernel,
    clients: options.clients,
    projection,
  });
  const principalSessions = createUserSessionAuthenticationAdapter(options.kernel, operations);
  const authentication = createAuthenticationUseCases({
    ...options.authentication,
    services: {
      ...options.authentication.services,
      principalSessions,
      oaCurrentSessions: {
        resolve: (token) =>
          operations.run(async (operation) => {
            try {
              const { observation } = await roots.forOperation(operation).resolvePermittedRoot(token);
              return {
                subjectIdentifier: observation.userSession.subjectIdentifier,
                remainingSeconds: observation.remainingSeconds,
              };
            } catch (error) {
              if (error instanceof AuthzUnauthorizedError) return null;
              if (error instanceof SubjectAccessOperationDeniedError) {
                if (error.reason === "identity_mismatch") throw new SubjectAccessUnavailableError(error);
                return null;
              }
              throw error;
            }
          }),
        logout: (token) => operations.run(async (operation) => await roots.forOperation(operation).logout(token)),
      },
    },
  });
  const auth = createRootAuthHandlers({
    authentication,
    loginCredentialParser: options.loginCredentialParser,
    config: options.config,
  });
  const sso = createRootSsoHandlers({
    authentication,
    config: options.config,
    sso: {
      logout: {
        execute: (input) =>
          operations.run(
            async (operation) =>
              await roots.forOperation(operation).logout(input.sessionToken, input.allowApplicationToken),
          ),
      },
    },
  });
  const delivery = createCustomSsoSubjectDeliveryRequestScope();
  const publicHandlers = createRootPublicHandlers({
    subjectDeliveryRequests: delivery,
    config: options.config,
  });
  const router = createRouter();
  const authenticationRouter = createRouter();
  authenticationRouter.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );
  authenticationRouter.openapi(authRoutes.loginPassword, auth.loginPassword);
  authenticationRouter.openapi(authRoutes.loginMobile, auth.loginMobile);
  if (options.internalAuthzLogger) {
    authenticationRouter.openapi(
      authRoutes.internalAuthz,
      createInternalAuthzHandler({
        clientService: options.internalClients,
        logger: options.internalAuthzLogger,
      }),
    );
  }
  const ssoRouter = createRouter();
  if (options.endpoints)
    ssoRouter.openapi(ssoRoutes.endpointsConfiguration, createSsoEndpointsHandler(options.endpoints));
  ssoRouter.openapi(ssoRoutes.loginOA, sso.loginOA);
  ssoRouter.openapi(ssoRoutes.loginWX, sso.loginWX);
  const customSso =
    options.customSso &&
    createUnifiedCustomSsoAuthorization({
      ...options.customSso,
      kernel: options.kernel,
      clients: options.clients,
      redirectUrls: createSsoRedirectUrlValidator({ logger: options.logger }),
    });
  const wechatQrState = options.wechatQr && createWechatQrState(options.wechatQr.redis, options.wechatQr.namespace);
  const wechatQrBinding =
    wechatQrState &&
    options.wechatQr?.binding &&
    createWechatQrBindingUseCase({
      ...options.wechatQr.binding,
      state: wechatQrState,
      loginRestriction: options.authentication.services.loginRestriction,
      auditLogWriter: options.authentication.auditLogWriter,
      requireAccess: (subjectIdentifier) =>
        operations.run(async (operation) => {
          await operation.acquireForAuthentication(subjectIdentifier);
        }),
    });
  const wechatQrCompletion =
    wechatQrState &&
    createWechatQrCompletionUseCase({
      state: wechatQrState,
      principalSessions,
      auditLogWriter: options.authentication.auditLogWriter,
      loginRestriction: options.authentication.services.loginRestriction,
      users: options.authentication.services.user,
    });
  const wechatQr =
    options.wechatQr &&
    wechatQrState &&
    createWechatQrUseCase({
      config: options.wechatQr.config,
      state: wechatQrState,
      directory: options.wechatQr.directory,
      wechat: options.wechatQr.wechat,
    });
  if (wechatQr) ssoRouter.route("/wechat-qr/mobile", createWechatQrMobileRouter(wechatQr));
  if (customAccess) {
    ssoRouter.openAPIRegistry.registerComponent("securitySchemes", CUSTOM_SSO_BASIC_SECURITY_SCHEME, {
      type: "http",
      scheme: "basic",
      description: "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
    });
    if (options.customSsoAccess?.managed) {
      ssoRouter.openapi(
        ssoRoutes.callback,
        createUnifiedCallbackHandler({
          custom: customAccess,
          operations,
          retryAfterSeconds: options.config.projectionRetryAfterSeconds,
        }),
      );
    }
    // Keep the public form contract documented while validation runs after authentication/location.
    ssoRouter.openAPIRegistry.registerPath(ssoRoutes.token);
    ssoRouter.post(
      ssoRoutes.token.path,
      createUnifiedTokenHandler({
        custom: customAccess,
        operations,
        retryAfterSeconds: options.config.projectionRetryAfterSeconds,
      }),
    );
    authenticationRouter.openapi(
      authRoutes.authz,
      createLocalSessionAuthzHandler({
        config: options.config,
        localSessionAuthorizer: {
          authorizeLocalSession: (token, client) =>
            operations.run((operation) => customAccess.forOperation(operation).authorizeLocalSession(token, client)),
        },
      }),
    );
  }
  if (customSso) {
    const handlers = createUnifiedAuthorizationHandlers({
      authorization: customSso,
      operations,
      logger: options.logger,
      loginEndpoint: options.config.loginEndpoint,
      retryAfterSeconds: options.config.projectionRetryAfterSeconds,
      wechatQrEnabled: Boolean(wechatQr),
    });
    if (wechatQr && wechatQrState) {
      ssoRouter.route(
        "/wechat-qr",
        createWechatQrDesktopRouter({
          qr: wechatQr,
          state: wechatQrState,
          complete: wechatQrCompletion,
          binding: wechatQrBinding,
          internalOrigin: options.endpoints?.config.ssoInternalOrigin,
          inspect: createInspectCustomSsoWechatQr({
            inspectLoginContinuation: (input) =>
              operations.run((operation) => customSso.forOperation(operation).inspectLoginContinuation(input)),
            retryAfterSeconds: options.config.projectionRetryAfterSeconds,
          }),
        }),
      );
    }
    ssoRouter.openapi(ssoRoutes.authorize, handlers.authorize);
    ssoRouter.openapi(ssoRoutes.loginGuard, handlers.loginGuard);
  }
  ssoRouter.openapi(ssoRoutes.logout, sso.logout);
  const publicRouter = createRouter<PublicBindings>();
  publicRouter.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );
  publicRouter.use(
    "*",
    createApiPublicAuthenticationHandler({
      runWithAuthentication: (token, clientCode, deliver) =>
        operations.run(async (operation) => {
          const session = clientCode === "iam" || !customAccess ? roots : customAccess;
          const resolved = await session.forOperation(operation).resolvePublicAuthentication(token, clientCode);
          await deliver(resolved);
        }),
      runWithCapability: delivery.runWithCapability,
      retryAfterSeconds: options.config.projectionRetryAfterSeconds,
    }),
  );
  publicRouter.openapi(publicRoutes.userInfo, publicHandlers.userInfo);
  if (options.publicDelegation) {
    const handlers = createPublicDelegationHandlers(options.publicDelegation);
    publicRouter.route("/", createPublicDelegationRoute(handlers));
  }
  if (options.publicServices) {
    const handlers = createPublicHandlers({
      ...options.publicServices,
      subjectDeliveryRequests: delivery,
      config: options.config,
    });
    publicRouter.openapi(publicRoutes.passwordChange, handlers.passwordChange);
    publicRouter.openapi(publicRoutes.mobileSet, handlers.mobileSet);
  }
  router.route("/auth", authenticationRouter);
  router.route("/sso", ssoRouter);
  router.route("/public", publicRouter);
  const oidc =
    options.oidc && createOidcAuthorization({ ...options.oidc, kernel: options.kernel, clients: options.clients });
  const oidcTokens =
    options.oidc &&
    options.oidcTokens &&
    createOidcTokens({
      ...options.oidc,
      ...options.oidcTokens,
      kernel: options.kernel,
      clients: options.clients,
      subjectFacts: options.subjectFacts,
    });
  const oidcLogout =
    options.oidc &&
    options.oidcLogout &&
    createOidcLogout({
      ...options.oidc,
      ...options.oidcLogout,
      kernel: options.kernel,
      clients: options.clients,
    });
  const oidcRouter = createRouter();
  if (oidc && options.oidc) {
    oidcRouter.route(
      "/",
      createOidcHttpRouter({
        trustProxy: options.oidcTrustProxy,
        clientAuthRateLimiter: options.oidcClientAuth,
        reportProtocolFailure: (failure) =>
          options.logger[failure.outcome === "unavailable" ? "error" : "warn"](
            {
              event: failure.outcome === "unavailable" ? "oidc_server_error" : "oidc_protocol_error",
              ...failure,
            },
            "OIDC request failed",
          ),
        authorization: oidc,
        wechatQr:
          wechatQr && wechatQrState && wechatQrCompletion
            ? {
                useCase: wechatQr,
                state: wechatQrState,
                complete: wechatQrCompletion,
                binding: wechatQrBinding,
                handleApiError: createErrorHandler(options.logger, getWechatLoginLogPath),
              }
            : undefined,
        reportAdmissionDenied: (clientCode, request) =>
          options.logger.warn(
            { ...request, event: "application.admission.denied", outcome: "no-match", protocol: "oidc", clientCode },
            "Application admission denied",
          ),
        tokens: oidcTokens,
        logout: oidcLogout,
        reportLogoutEffect: (effect, request) =>
          options.logger.warn(
            {
              ...request,
              event: "oidc_logout_effect",
              choice: "choice" in effect ? effect.choice : "confirm",
              revocation: effect.revocation,
            },
            "OIDC logout effect",
          ),
        userInfo: oidcTokens && createOidcUserInfo({ tokens: oidcTokens, subjectFacts: options.subjectFacts }),
        operations,
        issuers: options.oidc.issuers,
        secureCookies: options.oidc.secureCookies,
        loginEndpoint: options.config.loginEndpoint,
        reportExchangeFailure: (failure, request) =>
          options.logger.warn(
            {
              ...request,
              event: "oidc_exchange_failed",
              consumption: failure.consumption,
              failure:
                failure.failure instanceof OidcProtocolError
                  ? failure.failure.errorCode
                  : failure.failure instanceof OidcStateUnavailableError
                    ? `state_${failure.failure.outcome}`
                    : "unavailable",
              revocation: failure.revocation,
            },
            "OIDC exchange failure effect",
          ),
      }),
    );
  }
  router.route("/oidc", oidcRouter);
  return {
    router,
    routers: { auth: authenticationRouter, sso: ssoRouter, public: publicRouter, oidc: oidcRouter },
    operations,
    revocation,
    roots,
    customSso,
    customAccess,
    wechatQrState,
    oidc,
    oidcTokens,
    oidcLogout,
  };
}
