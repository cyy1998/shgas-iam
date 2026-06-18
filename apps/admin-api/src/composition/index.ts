import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import env from "@admin-api/env";
import { logger } from "@admin-api/lib/logger";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createAdminApiMiddlewares } from "./middlewares";
import { createAdminApiRepositories } from "./repositories";
import { createAdminApiRoutes } from "./routes";
import { createAdminApiRuntime } from "./runtime";
import { createAdminApiServices } from "./services";
import { createAdminApiUnitOfWork } from "./tx";

export interface AdminApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createAdminApiRuntime>;
  repositories: ReturnType<typeof createAdminApiRepositories>;
  auditService: ReturnType<typeof createAdminAuditService>;
  unitOfWork: ReturnType<typeof createAdminApiUnitOfWork>;
  services: ReturnType<typeof createAdminApiServices>;
  routes: CreateAppOptions["routes"];
  middlewares: CreateAppOptions["middlewares"];
}

export interface CreateAdminApiCompositionOptions {
  env?: typeof env;
  logger?: typeof logger;
}

export async function createAdminApiComposition(
  options: CreateAdminApiCompositionOptions = {},
): Promise<AdminApiComposition> {
  const compositionEnv = options.env ?? env;
  const compositionLogger = options.logger ?? logger;
  const runtime = createAdminApiRuntime({ env: compositionEnv, logger: compositionLogger });
  const repositories = createAdminApiRepositories();
  const auditService = createAdminAuditService({ auditRepository: repositories.audit });
  const unitOfWork = createAdminApiUnitOfWork({
    logger: runtime.afterCommitLogger,
    rootPorts: { repositories, auditService },
  });
  const services = createAdminApiServices({ runtime, repositories, unitOfWork });

  return {
    env: compositionEnv,
    logger: compositionLogger,
    runtime,
    repositories,
    auditService,
    unitOfWork,
    services,
    routes: await createAdminApiRoutes({ auditService, repositories, runtime, services }),
    middlewares: await createAdminApiMiddlewares({ runtime }),
  };
}
