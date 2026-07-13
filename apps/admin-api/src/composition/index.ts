import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { UserProfileJobName, UserProfileJobPayload } from "@iam/contracts";
import env from "@admin-api/env";
import { logger } from "@admin-api/lib/logger";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
import { createUserProfileJobProducer } from "@iam/user-profile-read-model/producer";
import { createAdminApiMiddlewares } from "./middlewares";
import { createAdminApiRepositories } from "./repositories";
import { createAdminApiRoutes } from "./routes";
import { createAdminApiRuntime } from "./runtime";
import { createAdminApiServices } from "./services";
import { createAdminApiSession } from "./session";
import { createAdminApiUnitOfWork } from "./tx";
import { createAdminApiUseCases } from "./use-cases";

export interface AdminApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createAdminApiRuntime>;
  session: ReturnType<typeof createAdminApiSession>;
  repositories: ReturnType<typeof createAdminApiRepositories>;
  auditService: ReturnType<typeof createAdminAuditService>;
  userProfileQueue: ReturnType<typeof createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>>;
  userProfileJobProducer: ReturnType<typeof createUserProfileJobProducer>;
  unitOfWork: ReturnType<typeof createAdminApiUnitOfWork>;
  services: ReturnType<typeof createAdminApiServices>;
  useCases: ReturnType<typeof createAdminApiUseCases>;
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
  const session = createAdminApiSession({ runtime });
  const repositories = createAdminApiRepositories();
  const auditService = createAdminAuditService({ auditRepository: repositories.audit });
  const userProfileQueue = createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>({
    name: USER_PROFILE_QUEUE_NAME,
    redis: runtime.config.env.redis,
  });
  const userProfileJobProducer = createUserProfileJobProducer(userProfileQueue);
  const unitOfWork = createAdminApiUnitOfWork({
    logger: runtime.afterCommitLogger,
    userProfileJobProducer,
    clock: runtime.clock,
  });
  const services = createAdminApiServices({ runtime, repositories, session, unitOfWork });
  const useCases = createAdminApiUseCases({ unitOfWork });

  return {
    env: compositionEnv,
    logger: compositionLogger,
    runtime,
    session,
    repositories,
    auditService,
    userProfileQueue,
    userProfileJobProducer,
    unitOfWork,
    services,
    useCases,
    routes: await createAdminApiRoutes({ auditService, runtime, services, useCases }),
    middlewares: await createAdminApiMiddlewares({ runtime, services, sessionKernel: session.kernel }),
  };
}
