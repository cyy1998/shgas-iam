import { type Env, parseAuthApiEnv } from "@auth-api/env";
import { createAuditLogWriter } from "@iam/db/audit";
import { relations } from "@iam/db/relations";
import { createUserDocumentWriteResources } from "@iam/documents/user/producer";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Logger } from "pino";
import postgres from "postgres";
import { createAuthApiRepositories } from "./repositories";
import { createAuthApiRoutes } from "./routes";
import { type CreateApiRuntimeOptions, createApiRuntime } from "./runtime";
import { createAuthApiServices } from "./services";
import { createAuthApiUnitOfWork } from "./tx";
import { createApiUseCases } from "./use-cases";

export interface CreateAuthApiCompositionOptions {
  env?: Env;
  logger?: Logger;
  integrationFetch?: CreateApiRuntimeOptions["integrationFetch"];
}

export async function createAuthApiComposition(options: CreateAuthApiCompositionOptions = {}) {
  const compositionEnv = options.env ?? parseAuthApiEnv(process.env);
  const pg = postgres(compositionEnv.databaseUrl);
  const db = drizzle({ client: pg, relations });
  const runtime = createApiRuntime({
    env: compositionEnv,
    logger: options.logger,
    integrationFetch: options.integrationFetch,
  });
  const userDocuments = createUserDocumentWriteResources({ redis: compositionEnv.redis, logger: runtime.logger });
  const repositories = createAuthApiRepositories(db);
  const auditLogWriter = createAuditLogWriter({ sourceApp: "auth-api", auditRepository: repositories.audit });
  const unitOfWork = createAuthApiUnitOfWork({
    db,
    logger: runtime.afterCommitLogger,
    userDocumentJobProducer: userDocuments.jobProducer,
    clock: runtime.clock,
  });

  async function close() {
    const results = await Promise.allSettled([userDocuments.close(), pg.end({ timeout: 5 })]);
    runtime.redis.disconnect();
    const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, "Auth API resource shutdown failed");
  }

  try {
    const services = createAuthApiServices({ runtime, repositories, auditLogWriter, unitOfWork, db });
    const useCases = createApiUseCases({ auditLogWriter, services, unitOfWork });
    return {
      env: compositionEnv,
      logger: runtime.logger,
      runtime,
      repositories,
      auditLogWriter,
      services,
      useCases,
      unitOfWork,
      userDocumentQueue: userDocuments.queue,
      routes: createAuthApiRoutes({
        auditLogWriter,
        runtime,
        services,
        useCases,
        repositories,
        unitOfWork,
        verifyDatabase: () => db.execute(sql`SELECT 1`),
      }),
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Auth API startup and shutdown failed");
    }
    throw error;
  }
}
