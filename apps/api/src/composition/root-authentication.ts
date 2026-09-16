import type { CreateAuthHandlersDeps } from "@api/routes/auth/auth.handlers";
import type { CreatePublicHandlersDeps } from "@api/routes/public/public.handlers";
import type { CreateRootSsoHandlersDeps, SsoEndpointsOptions } from "@api/routes/sso/sso.handlers";

import type { ClientSnapshotReader } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation, SubjectAccessOperationBarrierPort } from "@iam/api-core/subject-access";
import type { PublicBindings } from "@iam/api-core/types";
import type {
  CustomSsoProjectionPermission,
  UnifiedCustomSsoAuthorizationOptions,
  UnifiedCustomSsoOperationsOptions,
} from "@iam/custom-sso";

import type {
  OidcAuthorizationOptions,
  OidcClientAuthRateLimiter,
  OidcHintVerificationPort,
  OidcTokenOptions,
} from "@iam/oidc";
import type { UnifiedSessionKernel } from "@iam/session-kernel";
import { createApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import {
  createInternalAuthzHandler,
  createLocalSessionAuthzHandler,
  createRootAuthHandlers,
} from "@api/routes/auth/auth.handlers";
import * as authRoutes from "@api/routes/auth/auth.routes";
import { createOidcHttpRouter } from "@api/routes/oidc/oidc.http";
import { createPublicHandlers, createRootPublicHandlers } from "@api/routes/public/public.handlers";
import * as publicRoutes from "@api/routes/public/public.routes";
import { createRootSsoHandlers, createSsoEndpointsHandler } from "@api/routes/sso/sso.handlers";
import * as ssoRoutes from "@api/routes/sso/sso.routes";
import { CUSTOM_SSO_BASIC_SECURITY_SCHEME } from "@api/routes/sso/sso.security";
import { createUnifiedAuthorizationHandlers } from "@api/routes/sso/unified-authorization.handlers";
import { createUnifiedCallbackHandler } from "@api/routes/sso/unified-callback.handler";
import { createUnifiedTokenHandler } from "@api/routes/sso/unified-token.handler";
import { createRootSessionService } from "@api/services/authentication/root-session.service";
import { createUserSessionAuthenticationAdapter } from "@api/services/authentication/user-session.adapter";
import { createCustomSsoSubjectDeliveryRequestScope } from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@api/services/sso/transport/custom-sso-delivery.security";
import { createRouter } from "@iam/api-core/core/create-router";
import {
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
  SubjectAccessPermissionRequiredError,
} from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  createSsoRedirectUrlValidator,
  createUnifiedCustomSsoAuthorization,
  createUnifiedCustomSsoOperations,
} from "@iam/custom-sso";

import {
  createOidcAuthorization,
  createOidcLogout,
  createOidcTokens,
  createOidcUserInfo,
  OidcProtocolError,
  OidcStateUnavailableError,
} from "@iam/oidc";
import { createAuthenticationUseCases } from "./use-cases/authentication";

type AuthenticationOptions = Parameters<typeof createAuthenticationUseCases>[0];
type ProjectionOptions = Parameters<
  typeof createPermittedClientSubjectProjectionService<CustomSsoProjectionPermission>
>[0];

export interface RootAuthenticationCompositionOptions {
  kernel: UnifiedSessionKernel<SubjectAccessOperation>;
  barrier: SubjectAccessOperationBarrierPort;
  authentication: Omit<AuthenticationOptions, "services"> & {
    services: Omit<AuthenticationOptions["services"], "principalSessions">;
  };
  clients: ClientSnapshotReader;
  subjectFacts: ProjectionOptions["subjectFacts"];
  loginCredentialParser: CreateAuthHandlersDeps["loginCredentialParser"];
  internalClients: CreateAuthHandlersDeps["clientService"];
  internalAuthzLogger?: CreateAuthHandlersDeps["logger"];
  logger: Parameters<typeof createSsoRedirectUrlValidator>[0]["logger"] & {
    error: (fields: Record<string, unknown>, message: string) => void;
  };
  config: CreateRootSsoHandlersDeps["config"];
  endpoints?: SsoEndpointsOptions;
  publicServices?: Pick<
    CreatePublicHandlersDeps,
    "organizationService" | "userService" | "userProfileSearch"
  >;
  customSso?: Omit<UnifiedCustomSsoAuthorizationOptions, "kernel" | "clients" | "redirectUrls">;
  oidc?: Omit<OidcAuthorizationOptions, "kernel" | "clients"> & { issuers: { internal: string; external: string }; secureCookies: boolean };
  oidcClientAuth?: OidcClientAuthRateLimiter;
  oidcTrustProxy?: boolean;
  oidcTokens?: Pick<
    OidcTokenOptions,
    "credentials" | "signing" | "tokenTtlSeconds" | "failureEffectTimeoutMs"
  >;
  oidcLogout?: { verification: OidcHintVerificationPort; confirmationTtlSeconds: number };
  customSsoAccess?: Pick<
    UnifiedCustomSsoOperationsOptions,
    "credentials" | "tokenTtlSeconds" | "failureEffectTimeoutMs" | "business"
  > & {
    managed?: Omit<NonNullable<UnifiedCustomSsoOperationsOptions["managed"]>, "callbackUrls">;
  };
}

/** One generation owns root authentication and both online protocols. */
export function createRootAuthenticationComposition(options: RootAuthenticationCompositionOptions) {
  let operations: ReturnType<typeof createSubjectAccessOperations>;
  const revocation = createUnifiedSubjectAccessSessionRevocation(options.kernel, {
    run: callback => operations.run(callback),
  });
  operations = createSubjectAccessOperations({ barrier: options.barrier, revocation });
  const authentication = createAuthenticationUseCases({
    ...options.authentication,
    services: {
      ...options.authentication.services,
      principalSessions: createUserSessionAuthenticationAdapter(options.kernel, operations),
    },
  });
  const projection = createPermittedClientSubjectProjectionService<CustomSsoProjectionPermission>({
    subjectFacts: options.subjectFacts,
    assertPermission(proof, subjectIdentifier) {
      const operation = requireSubjectAccessOperation(proof?.operation);
      if (operation.requirePermission(subjectIdentifier) !== proof.permission)
        throw new SubjectAccessPermissionRequiredError();
    },
  });
  const customAccess
    = options.customSso
      && options.customSsoAccess
      && createUnifiedCustomSsoOperations({
        ...options.customSsoAccess,
        managed: options.customSsoAccess.managed && {
          ...options.customSsoAccess.managed,
          callbackUrls: options.customSso.managedCallbackUrls,
        },
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
        execute: input =>
          operations.run(
            async operation =>
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
  const customSso
    = options.customSso
      && createUnifiedCustomSsoAuthorization({
        ...options.customSso,
        kernel: options.kernel,
        clients: options.clients,
        redirectUrls: createSsoRedirectUrlValidator({ logger: options.logger }),
      });
  if (customAccess) {
    ssoRouter.openAPIRegistry.registerComponent("securitySchemes", CUSTOM_SSO_BASIC_SECURITY_SCHEME, {
      type: "http",
      scheme: "basic",
      description:
        "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
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
            operations.run(operation =>
              customAccess.forOperation(operation).authorizeLocalSession(token, client),
            ),
        },
      }),
    );
  }
  if (customSso) {
    const handlers = createUnifiedAuthorizationHandlers({
      authorization: customSso,
      operations,
      loginEndpoint: options.config.loginEndpoint,
      retryAfterSeconds: options.config.projectionRetryAfterSeconds,
    });
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
    async (context, next) =>
      await operations.run(async (operation) => {
        const handlers = createApiAuthenticationHandlers({
          clientService: options.internalClients,
          customSsoSession: {
            resolvePublicAuthentication: (token, client) =>
              client === "iam" || !customAccess
                ? roots.forOperation(operation).resolvePublicAuthentication(token, client)
                : customAccess.forOperation(operation).resolvePublicAuthentication(token, client),
          },
          subjectDeliveryRequests: delivery,
          config: options.config,
        });
        await handlers.publicAuthenticationHandler(context, next);
      }),
  );
  publicRouter.openapi(publicRoutes.userInfo, publicHandlers.userInfo);
  if (options.publicServices) {
    const handlers = createPublicHandlers({
      ...options.publicServices,
      subjectDeliveryRequests: delivery,
      config: options.config,
    });
    publicRouter.openapi(publicRoutes.orcasId, handlers.orcasId);
    publicRouter.openapi(publicRoutes.passwordChange, handlers.passwordChange);
    publicRouter.openapi(publicRoutes.mobileSet, handlers.mobileSet);
    publicRouter.openapi(publicRoutes.organizationsSearch, handlers.organizationsSearch);
    publicRouter.openapi(publicRoutes.usersSearch, handlers.usersSearch);
  }
  router.route("/auth", authenticationRouter);
  router.route("/sso", ssoRouter);
  router.route("/public", publicRouter);
  const oidc
    = options.oidc
      && createOidcAuthorization({ ...options.oidc, kernel: options.kernel, clients: options.clients });
  const oidcTokens
    = options.oidc
      && options.oidcTokens
      && createOidcTokens({
        ...options.oidc,
        ...options.oidcTokens,
        kernel: options.kernel,
        clients: options.clients,
        subjectFacts: options.subjectFacts,
      });
  const oidcLogout
    = options.oidc
      && options.oidcLogout
      && createOidcLogout({
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
        reportProtocolFailure: failure =>
          options.logger[failure.outcome === "unavailable" ? "error" : "warn"](
            {
              event: failure.outcome === "unavailable" ? "oidc_server_error" : "oidc_protocol_error",
              ...failure,
            },
            "OIDC request failed",
          ),
        authorization: oidc,
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
        userInfo:
          oidcTokens && createOidcUserInfo({ tokens: oidcTokens, subjectFacts: options.subjectFacts }),
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
    oidc,
    oidcTokens,
    oidcLogout,
  };
}
