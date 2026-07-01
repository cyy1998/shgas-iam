import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { UserProfileJobName, UserProfileJobPayload } from "@iam/contracts";
import env from "@api/env";
import { logger } from "@api/lib/logger";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { createJobQueue, createUserProfileJobProducer } from "@iam/jobs";
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
  userProfileQueue: ReturnType<typeof createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>>;
  userProfileJobProducer: ReturnType<typeof createUserProfileJobProducer>;
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
  const userProfileQueue = createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>({
    name: USER_PROFILE_QUEUE_NAME,
    redis: runtime.config.env.redis,
  });
  const userProfileJobProducer = createUserProfileJobProducer(userProfileQueue);
  const unitOfWork = createApiUnitOfWork({
    logger: runtime.afterCommitLogger,
    userProfileJobProducer,
    clock: runtime.clock,
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
    userProfileQueue,
    userProfileJobProducer,
    unitOfWork,
    services,
    routes: await createApiRoutes({ auditLogWriter, repositories, runtime, services, unitOfWork }),
    middlewares: await createApiMiddlewares({ runtime, services }),
  };
}
