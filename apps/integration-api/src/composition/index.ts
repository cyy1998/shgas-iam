import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createGenericClientCache } from "@iam/client-snapshot/generic-cache";
import { createAuditLogWriter, createAuditRepository } from "@iam/db/audit";
import { createClientSnapshotRepository, createGenericClientRepository } from "@iam/db/client-snapshot";
import { createDelegationService } from "@iam/delegation";
import { GenericClientRuntimeDtoSchema, toGenericClientRuntimeDto } from "@iam/domain/client";
import { createOrganizationDocumentWriteResources } from "@iam/jobs/documents/organization";
import { createUserDocumentWriteResources } from "@iam/jobs/documents/user";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import { createOwnedRedisClient } from "@iam/runtime/redis/connection";
import type { SmsTransportOptions } from "@iam/sms";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";
import { type Env, parseIntegrationApiEnv } from "../env";
import { createPublicDelegationHandlers } from "../routes/delegations/delegation.handlers";
import { createPublicDelegationRoute } from "../routes/delegations/delegation.index";
import { createInternalAuthzRoute } from "../routes/internal/authz";
import { createProbeRoutes } from "../routes/probes";
import { createInternalRoutes } from "./internal-routes";
import { createPublicDelegationDependencies } from "./public-delegation";
import { createIntegrationRepositories } from "./repositories";
import { createDatabaseResource } from "./resources";
import { createIntegrationSubjectAccess } from "./subject-access";
import { createIntegrationUnitOfWork } from "./tx";

export interface CreateIntegrationApiCompositionOptions {
  env?: Env;
  logger?: Logger;
  smsFetch?: SmsTransportOptions["fetch"];
}

export async function createIntegrationApiComposition(options: CreateIntegrationApiCompositionOptions = {}) {
  const env = options.env ?? parseIntegrationApiEnv(process.env);
  const logger =
    options.logger ??
    createLogger({
      nodeEnv: env.nodeEnv,
      logLevel: env.log.level,
      logFormat: env.log.format,
      sourceApp: LoggerSourceApp.IntegrationApi,
    });
  const cleanups: Array<() => void | Promise<void>> = [];
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      const results = await Promise.allSettled(cleanups.map(async (cleanup) => cleanup()));
      const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      if (failures.length) throw new AggregateError(failures, "Integration API resource shutdown failed");
    })();
    return closing;
  }

  try {
    const primary = createDatabaseResource(env.databaseUrl, "iam-integration-api");
    cleanups.push(primary.close);
    const redis = createOwnedRedisClient(env.redis);
    cleanups.push(() => redis.disconnect());
    redis.on("error", (error) =>
      logger.warn({ event: "integration.redis.connection_failed", errorType: error.name }, "Redis connection failed"),
    );
    const userQuery = createDatabaseResource(env.databaseUrl, "iam-integration-api-internal-user", true);
    cleanups.push(userQuery.close);
    const organizationQuery = createDatabaseResource(
      env.databaseUrl,
      "iam-integration-api-internal-organization",
      true,
    );
    cleanups.push(organizationQuery.close);
    const delegationQuery = createDatabaseResource(env.databaseUrl, "iam-integration-api-internal-delegation", true);
    cleanups.push(delegationQuery.close);
    const userDocuments = createUserDocumentWriteResources({ redis: env.redis, logger });
    cleanups.push(userDocuments.close);
    const organizationDocuments = createOrganizationDocumentWriteResources({ redis: env.redis, logger });
    cleanups.push(organizationDocuments.close);

    const router = createRouter().route(
      "/",
      createProbeRoutes(
        async () => {
          if (redis.status !== "ready") throw new Error("Redis is unavailable");
          await redis.ping();
        },
        () => primary.db.execute(sql`SELECT 1`),
      ),
    );
    const repositories = createIntegrationRepositories(primary.db);
    const auditLogWriter = createAuditLogWriter({ sourceApp: "iam", auditRepository: repositories.audit });
    const unitOfWork = createIntegrationUnitOfWork({
      db: primary.db,
      logger,
      clock: { nowDate: () => new Date() },
      userDocumentJobProducer: userDocuments.jobProducer,
      organizationDocumentJobProducer: organizationDocuments.jobProducer,
    });
    const client = createGenericClientCache({
      redis,
      schema: GenericClientRuntimeDtoSchema,
      source: createGenericClientRepository(primary.db, toGenericClientRuntimeDto),
    });
    router.route("/", createInternalAuthzRoute(client.getClientBySecret, logger));
    const snapshots = createClientSnapshots({ redis, source: createClientSnapshotRepository(primary.db) });
    const subjectAccess = createIntegrationSubjectAccess(redis, env.sessionKernel, snapshots.client);
    const delegation = createDelegationService({
      db: primary.db,
      recordAudit: async (tx, event) =>
        createAuditLogWriter({ sourceApp: "iam", auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
    });
    const personal = createPublicDelegationHandlers(createPublicDelegationDependencies(primary.db, delegation));
    router.route("/", createPublicDelegationRoute(personal, subjectAccess.authenticate));

    router.route(
      "/",
      createInternalRoutes({
        env,
        logger,
        database: primary.db,
        userQueryDb: userQuery.db,
        organizationQueryDb: organizationQuery.db,
        delegationQueryDb: delegationQuery.db,
        getClientBySecret: client.getClientBySecret,
        delegation,
        auditLogWriter,
        repositories,
        unitOfWork,
        barrier: subjectAccess.barrier,
        smsFetch: options.smsFetch,
      }),
    );

    const routes: CreateAppOptions["routes"] = {
      "./src/routes/integration/integration.index.ts": { default: router },
    };
    return { env, logger, routes, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Integration API startup and cleanup failed");
    }
    throw error;
  }
}
