import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { RebuildUserProfileJobPayload, UserProfileJobName } from "@iam/contracts";
import env from "@api/env";
import { logger } from "@api/lib/logger";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import db from "@iam/db";
import { createJobQueue } from "@iam/jobs";
import { createUserProfileJobProducer } from "@iam/user-profile-read-model/producer";
import { createInternalUserQueryResource } from "./internal-user-query";
import { createApiMiddlewares } from "./middlewares";
import { createApiRepositories } from "./repositories";
import { createApiRoutes } from "./routes";
import { createApiRuntime } from "./runtime";
import { createApiServices } from "./services";
import { createApiUnitOfWork } from "./tx";
import { createApiUseCases } from "./use-cases";

export interface ApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createApiRuntime>;
  repositories: ReturnType<typeof createApiRepositories>;
  auditLogWriter: ReturnType<typeof createApiAuditLogWriter>;
  userProfileQueue: ReturnType<typeof createJobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>>;
  userProfileJobProducer: ReturnType<typeof createUserProfileJobProducer>;
  unitOfWork: ReturnType<typeof createApiUnitOfWork>;
  services: ReturnType<typeof createApiServices>;
  useCases: ReturnType<typeof createApiUseCases>;
  routes: CreateAppOptions["routes"];
  middlewares: CreateAppOptions["middlewares"];
  close: () => Promise<void>;
}

export interface CreateApiCompositionOptions {
  env?: typeof env;
  logger?: typeof logger;
}

export async function createApiComposition(options: CreateApiCompositionOptions = {}): Promise<ApiComposition> {
  const compositionEnv = options.env ?? env;
  const compositionLogger = options.logger ?? logger;
  const runtime = createApiRuntime({ env: compositionEnv, logger: compositionLogger });
  const userProfileQuery = createInternalUserQueryResource({
    databaseUrl: compositionEnv.databaseUrl,
  });
  const repositories = createApiRepositories(db);
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const userProfileQueue = createJobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>({
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
    userProfileQueryDb: userProfileQuery.db,
  });
  const useCases = createApiUseCases({
    auditLogWriter,
    runtime,
    services,
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
    useCases,
    routes: await createApiRoutes({ auditLogWriter, runtime, services, useCases }),
    middlewares: await createApiMiddlewares({ runtime, services }),
    async close() {
      await userProfileQuery.close();
    },
  };
}
