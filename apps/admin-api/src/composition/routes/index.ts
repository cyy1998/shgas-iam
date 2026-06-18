import type { AdminAuditService } from "@admin-api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { AdminApiRepositories } from "../repositories";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
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
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { createUserAdminRouter } from "@admin-api/routes/admin/user/user.trpc";
import { createTrpcRoute } from "@admin-api/routes/trpc/trpc.index";
import { createAdminRouter } from "@admin-api/trpc/routers/admin";
import { createAppRouter } from "@admin-api/trpc/trpc.router";

export interface CreateAdminApiRoutesOptions {
  auditService: AdminAuditService;
  repositories: AdminApiRepositories;
  runtime: AdminApiRuntimePorts;
  services: AdminApiServices;
}

export async function createAdminApiRoutes(
  options: CreateAdminApiRoutesOptions,
): Promise<CreateAppOptions["routes"]> {
  const { auditService, repositories, runtime, services } = options;

  const auditAdapter = createAuditAdapter({ auditService });
  const clientAdapter = createClientAdapter({ clientService: services.client });
  const employmentAdapter = createEmploymentAdapter({ employmentService: services.employment });
  const organizationAdapter = createOrganizationAdapter({ organizationService: services.organization });
  const positionAdapter = createPositionAdapter({
    positionRepository: repositories.position,
    positionService: services.position,
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
    user: createUserAdminRouter(userAdapter),
  });
  const appRouter = createAppRouter(adminRouter);

  return {
    "./src/routes/admin/audit/audit.index.ts": { default: createAuditRoute(auditAdapter) },
    "./src/routes/admin/client/client.index.ts": { default: createClientRoute(clientAdapter) },
    "./src/routes/admin/employment/employment.index.ts": { default: createEmploymentRoute(employmentAdapter) },
    "./src/routes/admin/organization/organization.index.ts": { default: createOrganizationRoute(organizationAdapter) },
    "./src/routes/admin/position/position.index.ts": { default: createPositionRoute(positionAdapter) },
    "./src/routes/admin/user/user.index.ts": { default: createUserRoute(userAdapter) },
    "./src/routes/trpc/trpc.index.ts": { default: createTrpcRoute(appRouter) },
  };
}
