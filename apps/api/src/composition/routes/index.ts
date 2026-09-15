import type { ApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { ApiUseCases } from "../use-cases";
import { createDelegationHandlers } from "@api/routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "@api/routes/internal/delegation/delegation.index";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createOpenHandlers } from "@api/routes/open/open.handlers";
import { createOpenRoute } from "@api/routes/open/open.index";
import { createRouter } from "@iam/api-core/core/create-router";

export interface CreateApiRoutesOptions {
  verifyDatabase: () => Promise<unknown>;
  auditLogWriter: ApiAuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  useCases: ApiUseCases;
}

export async function createApiRoutes(options: CreateApiRoutesOptions): Promise<CreateAppOptions["routes"]> {
  const { auditLogWriter, runtime, services, useCases } = options;

  const openHandlers = createOpenHandlers({
    accountRecovery: useCases.accountRecovery,
    auditLogWriter,
    clientService: services.client,
    humanVerification: services.cap,
    humanRiskService: services.humanRisk,
    mobileService: services.mobile,
    userService: services.user,
  });

  const organizationHandlers = createOrganizationHandlers({
    auditLogWriter,
    organizationService: services.organization,
  });

  const delegationHandlers = createDelegationHandlers({
    privilegeDelegationService: services.privilegeDelegation,
    resolvePrivilegeDelegations: useCases.resolvePrivilegeDelegations,
  });

  const userHandlers = createUserHandlers({
    registerPurveyorContact: useCases.registerPurveyorContact,
    internalUserProfileQuery: services.internalUserProfileQuery,
    userDelegationQuery: services.userDelegationQuery,
    userProfileSearch: services.userProfileSearch,
  });

  const health = createRouter();
  health.get("/health", async (c) => {
    try {
      await runtime.redis.ping();
      return c.json({ status: "ok" });
    }
    catch { return c.json({ status: "unavailable" }, 503); }
  });
  health.get("/oidc/health", async (c) => {
    try {
      await runtime.redis.ping();
      return c.json({ status: "ok" });
    }
    catch { return c.json({ status: "unavailable" }, 503); }
  });
  health.get("/ready", async (c) => {
    try {
      await Promise.all([runtime.redis.ping(), options.verifyDatabase()]);
      return c.json({ status: "ok" });
    }
    catch { return c.json({ status: "unavailable" }, 503); }
  });
  return {
    "./src/routes/health/health.index.ts": { default: health },
    "./src/routes/oidc/oidc.index.ts": { default: services.authentication.routers.oidc },
    "./src/routes/auth/auth.index.ts": { default: services.authentication.routers.auth },
    "./src/routes/internal/delegation/delegation.index.ts": { default: createDelegationRoute(delegationHandlers) },
    "./src/routes/internal/organization/organization.index.ts": { default: createOrganizationRoute(organizationHandlers) },
    "./src/routes/internal/user/user.index.ts": {
      default: createUserRoute(userHandlers),
    },
    "./src/routes/open/open.index.ts": { default: createOpenRoute(openHandlers) },
    "./src/routes/public/public.index.ts": { default: services.authentication.routers.public },
    "./src/routes/sso/sso.index.ts": { default: services.authentication.routers.sso },
  };
}
