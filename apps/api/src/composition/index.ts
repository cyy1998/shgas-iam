import env from "@api/env";
import { logger } from "@api/lib/logger";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import db, { closeDb } from "@iam/db";
import { createOrganizationDocumentWriteResources } from "@iam/organization-document/producer";
import { createUserDocumentJobProducer } from "@iam/user-document/producer";
import { sql } from "drizzle-orm";
import { createInternalDelegationQueryResource } from "./internal-delegation-query";
import { createInternalOrganizationQueryResource } from "./internal-organization-query";
import { createApiMiddlewares } from "./middlewares";
import { createApiRepositories } from "./repositories";
import { createApiRoutes } from "./routes";
import { createApiRuntime } from "./runtime";
import { createApiServices } from "./services";
import { createApiUnitOfWork } from "./tx";
import { createApiUseCases } from "./use-cases";
import { createApiUserDocumentResources } from "./user-document-resources";

export interface ApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createApiRuntime>;
  repositories: ReturnType<typeof createApiRepositories>;
  auditLogWriter: ReturnType<typeof createApiAuditLogWriter>;
  userDocumentQueue: ReturnType<typeof createApiUserDocumentResources>["queue"];
  userDocumentJobProducer: ReturnType<typeof createUserDocumentJobProducer>;
  organizationDocumentWrites: ReturnType<typeof createOrganizationDocumentWriteResources>;
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
  const userDocumentResources = createApiUserDocumentResources({
    databaseUrl: compositionEnv.databaseUrl,
    redis: runtime.config.env.redis,
  });
  const delegationResolutionResource = createInternalDelegationQueryResource({
    databaseUrl: compositionEnv.databaseUrl,
  });
  const repositories = createApiRepositories(db);
  const organizationQueryResource = createInternalOrganizationQueryResource({
    databaseUrl: compositionEnv.databaseUrl,
  });
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const userDocumentQueue = userDocumentResources.queue;
  const userDocumentJobProducer = createUserDocumentJobProducer(userDocumentQueue);
  const organizationDocumentWrites = createOrganizationDocumentWriteResources({
    redis: runtime.config.env.redis,
    logger: runtime.logger,
  });
  const unitOfWork = createApiUnitOfWork({
    db,
    logger: runtime.afterCommitLogger,
    userDocumentJobProducer,
    organizationDocumentJobProducer: organizationDocumentWrites.jobProducer,
    clock: runtime.clock,
  });
  const services = createApiServices({
    runtime,
    repositories,
    auditLogWriter,
    unitOfWork,
    userDocumentQueryDb: userDocumentResources.query.db,
    organizationQueryDb: organizationQueryResource.db,
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
    userDocumentQueue,
    userDocumentJobProducer,
    organizationDocumentWrites,
    unitOfWork,
    services,
    useCases,
    routes: await createApiRoutes({
      auditLogWriter,
      runtime,
      services,
      useCases,
      verifyDatabase: () => db.execute(sql`SELECT 1`),
    }),
    middlewares: await createApiMiddlewares({ runtime, services }),
    async close() {
      const results = await Promise.allSettled([
        delegationResolutionResource.close(),
        organizationQueryResource.close(),
        organizationDocumentWrites.close(),
        userDocumentResources.close(),
        closeDb({ timeoutSeconds: 5 }),
      ]);
      runtime.redis.disconnect();
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    },
  };
}
