import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createApiUnitOfWork } from "../tx";
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
import { mapUnitOfWork } from "@iam/api-core/uow";

type ApiUnitOfWork = ReturnType<typeof createApiUnitOfWork>;

export interface CreateApiRoutesOptions {
  auditLogWriter: ApiAuditLogWriter;
  repositories: ApiRepositories;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  unitOfWork: ApiUnitOfWork;
}

export async function createApiRoutes(options: CreateApiRoutesOptions): Promise<CreateAppOptions["routes"]> {
  const { auditLogWriter, runtime, services, unitOfWork } = options;

  const authHandlers = createAuthHandlers({
    authService: services.auth,
    clientService: services.client,
    loginCredentialParser: services.loginCredential,
    logger: runtime.logger,
    config: {
      redisExpireSeconds: runtime.config.auth.redisExpireSeconds,
    },
  });

  const openHandlers = createOpenHandlers({
    auditLogWriter,
    clientService: services.client,
    humanVerification: services.cap,
    humanRiskService: services.humanRisk,
    mobileService: services.mobile,
    openService: services.open,
    userService: services.user,
  });

  const ssoHandlers = createSsoHandlers({
    clientService: services.client,
    logger: runtime.logger,
    sessionService: services.session,
    ssoService: services.sso,
    config: {
      authorizationEndpoint: runtime.config.env.AUTHORIZATION_ENDPOINT,
      authCodeExpireSeconds: runtime.config.auth.authCodeExpireSeconds,
      loginEndpoint: runtime.config.env.LOGIN_ENDPOINT,
      logoutEndpoint: runtime.config.env.LOGOUT_ENDPOINT,
      redisExpireSeconds: runtime.config.auth.redisExpireSeconds,
      ssoExternalOrigin: runtime.config.env.SSO_EXTERNAL_ORIGIN,
      ssoInternalOrigin: runtime.config.env.SSO_INTERNAL_ORIGIN,
      thirdPartyOAEndpoint: runtime.config.env.THIRDPARTY_OA_ENDPOINT,
    },
  });

  const publicHandlers = createPublicHandlers({
    organizationService: services.organization,
    sessionService: services.session,
    userService: services.user,
  });

  const organizationHandlers = createOrganizationHandlers({
    auditLogWriter,
    organizationService: services.organization,
  });

  const delegationHandlers = createDelegationHandlers({
    auditLogWriter,
    privilegeDelegationService: services.privilegeDelegation,
  });

  const userHandlers = createUserHandlers({
    auditLogWriter,
    config: {
      nodeEnv: runtime.config.env.NODE_ENV,
    },
    mobileService: services.mobile,
    userService: services.user,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      userRepository: tx.repositories.user,
    })),
  });

  return {
    "./src/routes/auth/auth.index.ts": { default: createAuthRoute(authHandlers) },
    "./src/routes/internal/delegation/delegation.index.ts": { default: createDelegationRoute(delegationHandlers) },
    "./src/routes/internal/organization/organization.index.ts": { default: createOrganizationRoute(organizationHandlers) },
    "./src/routes/internal/user/user.index.ts": { default: createUserRoute(userHandlers) },
    "./src/routes/open/open.index.ts": { default: createOpenRoute(openHandlers) },
    "./src/routes/public/public.index.ts": { default: createPublicRoute(publicHandlers) },
    "./src/routes/sso/sso.index.ts": { default: createSsoRoute(ssoHandlers) },
  };
}
