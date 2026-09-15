import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import env from "@api/env";
import { logger } from "@api/lib/logger";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import db, { closeDb } from "@iam/db";
import { createUserProfileJobProducer } from "@iam/user-profile-read-model/producer";
import { sql } from "drizzle-orm";
import { createInternalDelegationQueryResource } from "./internal-delegation-query";
import { createApiMiddlewares } from "./middlewares";
import { createApiRepositories } from "./repositories";
import { createApiRoutes } from "./routes";
import { createApiRuntime } from "./runtime";
import { createApiServices } from "./services";
import { createApiUnitOfWork } from "./tx";
import { createApiUseCases } from "./use-cases";
import { createApiUserProfileResources } from "./user-profile-resources";

export interface ApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createApiRuntime>;
  repositories: ReturnType<typeof createApiRepositories>;
  auditLogWriter: ReturnType<typeof createApiAuditLogWriter>;
  userProfileQueue: ReturnType<typeof createApiUserProfileResources>["queue"];
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
  const userProfileResources = createApiUserProfileResources({
    databaseUrl: compositionEnv.databaseUrl,
    redis: runtime.config.env.redis,
  });
  const delegationResolutionResource = createInternalDelegationQueryResource({
    databaseUrl: compositionEnv.databaseUrl,
  });
  const repositories = createApiRepositories(db);
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const userProfileQueue = userProfileResources.queue;
  const userProfileJobProducer = createUserProfileJobProducer(userProfileQueue);
  const unitOfWork = createApiUnitOfWork({
    db,
    logger: runtime.afterCommitLogger,
    userProfileJobProducer,
    clock: runtime.clock,
  });
  const services = createApiServices({
    runtime,
    repositories,
    auditLogWriter,
    unitOfWork,
    userProfileQueryDb: userProfileResources.query.db,
  });
  const useCases = createApiUseCases({
    auditLogWriter,
    runtime,
    services,
    unitOfWork,
    delegationResolutionDb: delegationResolutionResource.db,
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
    routes: await createApiRoutes({ auditLogWriter, runtime, services, useCases, verifyDatabase: () => db.execute(sql`SELECT 1`) }),
    middlewares: await createApiMiddlewares({ runtime, services }),
    async close() {
      const results = await Promise.allSettled([
        delegationResolutionResource.close(),
        userProfileResources.close(),
        closeDb({ timeoutSeconds: 5 }),
      ]);
      runtime.redis.disconnect();
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected")
        throw failed.reason;
    },
  };
}
