import { createRouter } from "@iam/api-core/core/create-router";
import type { PublicBindings } from "@iam/api-core/types";
import {
  createPermittedClientSubjectProjectionService,
  type SubjectFactsSnapshot,
} from "@iam/client-subject-projection";
import {
  createSsoRedirectUrlValidator,
  createUnifiedCustomSsoAuthorization,
  createUnifiedCustomSsoOperations,
  type UnifiedCustomSsoAuthorizationOptions,
  type UnifiedCustomSsoOperationsOptions,
} from "@iam/custom-sso";
import { createRootSessionService } from "@iam/custom-sso/root-session";
import type { createSubjectAccessOperations, SubjectAccessOperation } from "@iam/subject-access";
import { requireSubjectAccessOperation } from "@iam/subject-access";
import { createSsoPublicAuthenticationHandler } from "@sso-api/middlewares/public-authentication";
import { createLocalSessionAuthzHandler, createSubjectDeliveryHandler } from "@sso-api/routes/sso/delivery.handlers";
import {
  createLogoutHandler,
  createSsoEndpointsHandler,
  type SsoEndpointsOptions,
} from "@sso-api/routes/sso/sso.handlers";
import * as routes from "@sso-api/routes/sso/sso.routes";
import { CUSTOM_SSO_BASIC_SECURITY_SCHEME } from "@sso-api/routes/sso/sso.security";
import { createUnifiedAuthorizationHandlers } from "@sso-api/routes/sso/unified-authorization.handlers";
import { createUnifiedCallbackHandler } from "@sso-api/routes/sso/unified-callback.handler";
import { createUnifiedTokenHandler } from "@sso-api/routes/sso/unified-token.handler";
import { createCustomSsoSubjectDeliveryRequestScope } from "@sso-api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@sso-api/services/sso/transport/custom-sso-delivery.security";

export interface CustomSsoCompositionOptions {
  authorization: Omit<UnifiedCustomSsoAuthorizationOptions, "redirectUrls">;
  access: Pick<
    UnifiedCustomSsoOperationsOptions,
    "credentials" | "tokenTtlSeconds" | "failureEffectTimeoutMs" | "business" | "managed"
  >;
  subjectFacts: { read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null> };
  operations: ReturnType<typeof createSubjectAccessOperations>;
  logger: SsoEndpointsOptions["logger"];
  loginEndpoint: string;
  retryAfterSeconds: number;
  wechatQrEnabled?: boolean;
  endpoints?: SsoEndpointsOptions["config"];
}

export function createCustomSsoComposition(options: CustomSsoCompositionOptions) {
  const { kernel, clients, redis, namespace } = options.authorization;
  const { operations, retryAfterSeconds } = options;
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts: options.subjectFacts,
    assertPermission: (operation, subjectIdentifier) =>
      requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier),
  });
  const customSso = createUnifiedCustomSsoAuthorization({
    ...options.authorization,
    redirectUrls: createSsoRedirectUrlValidator({ logger: options.logger }),
  });
  const customAccess = createUnifiedCustomSsoOperations({
    ...options.access,
    redis,
    namespace,
    kernel,
    clients,
    projection,
  });
  const roots = createRootSessionService({
    logoutApplicationToken: (token, operation) => customAccess.forOperation(operation).logout(token),
    kernel,
    clients,
    projection,
  });
  const router = createRouter();
  const deliveryRouter = createRouter<PublicBindings>();
  router.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );
  router.openAPIRegistry.registerComponent("securitySchemes", CUSTOM_SSO_BASIC_SECURITY_SCHEME, {
    type: "http",
    scheme: "basic",
    description: "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
  });
  if (options.endpoints) {
    router.openapi(
      routes.endpointsConfiguration,
      createSsoEndpointsHandler({
        logger: options.logger,
        config: options.endpoints,
      }),
    );
  }
  const handlers = createUnifiedAuthorizationHandlers({
    authorization: customSso,
    operations,
    logger: options.logger,
    loginEndpoint: options.loginEndpoint,
    retryAfterSeconds,
    wechatQrEnabled: options.wechatQrEnabled,
  });
  router.openapi(routes.authorize, handlers.authorize);
  router.openapi(routes.loginGuard, handlers.loginGuard);
  router.openapi(
    routes.logout,
    createLogoutHandler({
      config: { loginEndpoint: options.loginEndpoint, projectionRetryAfterSeconds: retryAfterSeconds },
      logout: (token, allowApplicationToken) =>
        operations.run((operation) => roots.forOperation(operation).logout(token, allowApplicationToken)),
    }),
  );
  if (options.access.managed) {
    router.openapi(
      routes.callback,
      createUnifiedCallbackHandler({ custom: customAccess, operations, retryAfterSeconds }),
    );
  }
  // Protocol authentication and location precede form validation.
  router.openAPIRegistry.registerPath(routes.token);
  router.post(routes.token.path, createUnifiedTokenHandler({ custom: customAccess, operations, retryAfterSeconds }));
  deliveryRouter.openapi(
    routes.authz,
    createLocalSessionAuthzHandler({
      retryAfterSeconds,
      authorizeLocalSession: (token, client) =>
        operations.run((operation) => customAccess.forOperation(operation).authorizeLocalSession(token, client)),
    }),
  );
  const delivery = createCustomSsoSubjectDeliveryRequestScope();
  deliveryRouter.use(
    routes.userInfo.path,
    createSsoPublicAuthenticationHandler({
      runWithAuthentication: (token, clientCode, deliver) =>
        operations.run(async (operation) => {
          const session = clientCode === "iam" ? roots : customAccess;
          const resolved = await session.forOperation(operation).resolvePublicAuthentication(token, clientCode);
          await deliver(resolved);
        }),
      runWithCapability: delivery.runWithCapability,
      retryAfterSeconds,
    }),
  );
  deliveryRouter.openapi(
    routes.userInfo,
    createSubjectDeliveryHandler({
      resolveUserInfoForRequest: delivery.resolveUserInfoForRequest,
      retryAfterSeconds,
    }),
  );
  router.route("/", deliveryRouter);
  return { router, customSso, customAccess, roots };
}
