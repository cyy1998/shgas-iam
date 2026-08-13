import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
import type { AdminApiUseCases } from "../use-cases";
import { createAuditAdapter } from "@admin-api/routes/admin/audit/audit.adapter";
import { createAuditRoute } from "@admin-api/routes/admin/audit/audit.index";
import { createAuditAdminRouter } from "@admin-api/routes/admin/audit/audit.trpc";
import { createClientAdapter } from "@admin-api/routes/admin/client/client.adapter";
import { createClientRoute } from "@admin-api/routes/admin/client/client.index";
import { createClientAdminRouter } from "@admin-api/routes/admin/client/client.trpc";
import { createEmploymentAdapter } from "@admin-api/routes/admin/employment/employment.adapter";
import { createEmploymentRoute } from "@admin-api/routes/admin/employment/employment.index";
import { createEmploymentAdminRouter } from "@admin-api/routes/admin/employment/employment.trpc";
import { createOrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import { createOrganizationRoute } from "@admin-api/routes/admin/organization/organization.index";
import { createOrganizationAdminRouter } from "@admin-api/routes/admin/organization/organization.trpc";
import { createPositionAdapter } from "@admin-api/routes/admin/position/position.adapter";
import { createPositionRoute } from "@admin-api/routes/admin/position/position.index";
import { createPositionAdminRouter } from "@admin-api/routes/admin/position/position.trpc";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { createRoleRoute } from "@admin-api/routes/admin/role/role.index";
import { createRoleAdminRouter } from "@admin-api/routes/admin/role/role.trpc";
import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import { createSessionManagementRoute } from "@admin-api/routes/admin/session-management/session-management.index";
import { createSessionManagementAdminRouter } from "@admin-api/routes/admin/session-management/session-management.trpc";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { createUserAdminRouter } from "@admin-api/routes/admin/user/user.trpc";
import { createTrpcRoute } from "@admin-api/routes/trpc/trpc.index";
import { createAdminRouter } from "@admin-api/trpc/routers/admin";
import { createAppRouter } from "@admin-api/trpc/trpc.router";

export interface CreateAdminApiRoutesOptions {
  auditService: AdminAuditService;
  runtime: AdminApiRuntimePorts;
  services: AdminApiServices;
  useCases: AdminApiUseCases;
}

export async function createAdminApiRoutes(
  options: CreateAdminApiRoutesOptions,
): Promise<CreateAppOptions["routes"]> {
  const { auditService, runtime, services, useCases } = options;

  const auditAdapter = createAuditAdapter({ auditService });
  const clientAdapter = createClientAdapter({ clientService: services.client });
  const employmentAdapter = createEmploymentAdapter({
    changeEmploymentAvailability: useCases.employment.changeEmploymentAvailability,
    createEmployment: useCases.employment.createEmployment,
    endEmployment: useCases.employment.endEmployment,
    employmentService: services.employment,
    managePrimaryEmployment: useCases.employment.managePrimaryEmployment,
    resignUser: useCases.employment.resignUser,
    transferEmployment: useCases.employment.transferEmployment,
  });
  const organizationAdapter = createOrganizationAdapter({ organizationService: services.organization });
  const positionAdapter = createPositionAdapter({ positionService: services.position });
  const roleAdapter = createRoleAdapter({ roleService: services.role });
  const sessionManagementAdapter = createSessionManagementAdapter({
    sessionManagementService: services.sessionManagement,
  });
  const userAdapter = createUserAdapter({
    random: runtime.random,
    userService: services.user,
  });

  const adminRouter = createAdminRouter({
    audit: createAuditAdminRouter(auditAdapter),
    client: createClientAdminRouter(clientAdapter),
    employment: createEmploymentAdminRouter(employmentAdapter),
    organization: createOrganizationAdminRouter(organizationAdapter),
    position: createPositionAdminRouter(positionAdapter),
    role: createRoleAdminRouter(roleAdapter),
    sessionManagement: createSessionManagementAdminRouter(sessionManagementAdapter),
    user: createUserAdminRouter(userAdapter),
  });
  const appRouter = createAppRouter(adminRouter);

  return {
    "./src/routes/admin/audit/audit.index.ts": { default: createAuditRoute(auditAdapter) },
    "./src/routes/admin/client/client.index.ts": { default: createClientRoute(clientAdapter) },
    "./src/routes/admin/employment/employment.index.ts": { default: createEmploymentRoute(employmentAdapter) },
    "./src/routes/admin/organization/organization.index.ts": { default: createOrganizationRoute(organizationAdapter) },
    "./src/routes/admin/position/position.index.ts": { default: createPositionRoute(positionAdapter) },
    "./src/routes/admin/role/role.index.ts": { default: createRoleRoute(roleAdapter) },
    "./src/routes/admin/session-management/session-management.index.ts": {
      default: createSessionManagementRoute(sessionManagementAdapter),
    },
    "./src/routes/admin/user/user.index.ts": { default: createUserRoute(userAdapter) },
    "./src/routes/trpc/trpc.index.ts": { default: createTrpcRoute(appRouter) },
  };
}
