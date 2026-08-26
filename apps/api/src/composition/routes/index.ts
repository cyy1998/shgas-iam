import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { ApiUseCases } from "../use-cases";
import { createAuthHandlers } from "@api/routes/auth/auth.handlers";
import { createAuthRoute } from "@api/routes/auth/auth.index";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createOpenHandlers } from "@api/routes/open/open.handlers";
import { createOpenRoute } from "@api/routes/open/open.index";
import { createPublicHandlers } from "@api/routes/public/public.handlers";
import { createPublicRoute } from "@api/routes/public/public.index";
import { createSsoHandlers } from "@api/routes/sso/sso.handlers";
import { createSsoRoute } from "@api/routes/sso/sso.index";

export interface CreateApiRoutesOptions {
  auditLogWriter: ApiAuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  useCases: ApiUseCases;
}

export async function createApiRoutes(options: CreateApiRoutesOptions): Promise<CreateAppOptions["routes"]> {
  const { auditLogWriter, runtime, services, useCases } = options;

  const authHandlers = createAuthHandlers({
    authentication: useCases.authentication,
    clientService: services.client,
    localSessionAuthorizer: services.customSsoSession,
    loginCredentialParser: services.loginCredential,
    logger: runtime.logger,
    trafficGate: services.customSsoTrafficGate,
    config: {
      projectionRetryAfterSeconds:
        runtime.config.env.sso.projectionRetryAfterSeconds,
      redisExpireSeconds: runtime.config.auth.redisExpireSeconds,
    },
  });

  const openHandlers = createOpenHandlers({
    accountRecovery: useCases.accountRecovery,
    auditLogWriter,
    clientService: services.client,
    humanVerification: services.cap,
    humanRiskService: services.humanRisk,
    mobileService: services.mobile,
    userService: services.user,
  });

  const ssoHandlers = createSsoHandlers({
    logger: runtime.logger,
    sso: useCases.sso,
    config: {
      authorizationEndpoint: runtime.config.env.sso.authorizationEndpoint,
      authCodeExpireSeconds: runtime.config.auth.authCodeExpireSeconds,
      loginEndpoint: runtime.config.env.sso.loginEndpoint,
      logoutEndpoint: runtime.config.env.sso.logoutEndpoint,
      projectionRetryAfterSeconds:
        runtime.config.env.sso.projectionRetryAfterSeconds,
      redisExpireSeconds: runtime.config.auth.redisExpireSeconds,
      ssoExternalOrigin: runtime.config.env.sso.externalOrigin,
      ssoInternalOrigin: runtime.config.env.sso.internalOrigin,
      thirdPartyOAEndpoint: runtime.config.env.sso.thirdPartyOAEndpoint,
    },
  });

  const publicHandlers = createPublicHandlers({
    organizationService: services.organization,
    subjectDeliveryRequests:
      services.customSsoSubjectDeliveryRequests,
    userService: services.user,
    userProfileSearch: services.userProfileSearch,
    config: {
      projectionRetryAfterSeconds:
        runtime.config.env.sso.projectionRetryAfterSeconds,
    },
  });

  const organizationHandlers = createOrganizationHandlers({
    auditLogWriter,
    organizationService: services.organization,
  });

  const delegationHandlers = createDelegationHandlers({
    auditLogWriter,
    privilegeDelegationService: services.privilegeDelegation,
    resolvePrivilegeDelegations: useCases.resolvePrivilegeDelegations,
  });

  const userHandlers = createUserHandlers({
    registerPurveyorContact: useCases.registerPurveyorContact,
    internalUserProfileQuery: services.internalUserProfileQuery,
    userDelegationQuery: services.userDelegationQuery,
    userProfileSearch: services.userProfileSearch,
  });

  return {
    "./src/routes/auth/auth.index.ts": { default: createAuthRoute(authHandlers) },
    "./src/routes/internal/delegation/delegation.index.ts": { default: createDelegationRoute(delegationHandlers) },
    "./src/routes/internal/organization/organization.index.ts": { default: createOrganizationRoute(organizationHandlers) },
    "./src/routes/internal/user/user.index.ts": {
      default: createUserRoute(userHandlers),
    },
    "./src/routes/open/open.index.ts": { default: createOpenRoute(openHandlers) },
    "./src/routes/public/public.index.ts": { default: createPublicRoute(publicHandlers) },
    "./src/routes/sso/sso.index.ts": { default: createSsoRoute(ssoHandlers) },
  };
}
