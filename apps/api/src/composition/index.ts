import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import env from "@api/env";
import { logger } from "@api/lib/logger";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createApiMiddlewares } from "./middlewares";
import { createApiRepositories } from "./repositories";
import { createApiRoutes } from "./routes";
import { createApiRuntime } from "./runtime";
import { createApiServices } from "./services";
import { createApiUnitOfWork } from "./tx";

export interface ApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createApiRuntime>;
  repositories: ReturnType<typeof createApiRepositories>;
  auditLogWriter: ReturnType<typeof createApiAuditLogWriter>;
  unitOfWork: ReturnType<typeof createApiUnitOfWork>;
  services: ReturnType<typeof createApiServices>;
  routes: CreateAppOptions["routes"];
  middlewares: CreateAppOptions["middlewares"];
}

export interface CreateApiCompositionOptions {
  env?: typeof env;
  logger?: typeof logger;
}

export async function createApiComposition(options: CreateApiCompositionOptions = {}): Promise<ApiComposition> {
  const compositionEnv = options.env ?? env;
  const compositionLogger = options.logger ?? logger;
  const runtime = createApiRuntime({ env: compositionEnv, logger: compositionLogger });
  const repositories = createApiRepositories();
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const unitOfWork = createApiUnitOfWork({
    logger: runtime.afterCommitLogger,
    rootPorts: { repositories, auditLogWriter },
  });
  const services = createApiServices({
    runtime,
    repositories,
    auditLogWriter,
    unitOfWork,
  });

  return {
    env: compositionEnv,
    logger: compositionLogger,
    runtime,
    repositories,
    auditLogWriter,
    unitOfWork,
    services,
    routes: await createApiRoutes({ auditLogWriter, repositories, runtime, services, unitOfWork }),
    middlewares: await createApiMiddlewares({ runtime, services }),
  };
}
