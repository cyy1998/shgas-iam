import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createOrganizationDocumentWorkerModule } from "@iam/organization-document/worker";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import { parseOrganizationDocumentBackfillCommandEnv } from "../../src/env";
import { createOrganizationFixtureRuntime } from "./organization-worker-runtime";

const env = parseOrganizationDocumentBackfillCommandEnv(process.env);
const { db } = createMaintenancePostgresResources({ databaseUrl: env.databaseUrl, deadlineMs: 0 });
const logger = createLogger({
  nodeEnv: env.nodeEnv,
  logLevel: env.log.level,
  logFormat: env.log.format,
  sourceApp: LoggerSourceApp.Ops,
});
const runtime = createOrganizationFixtureRuntime(process.env, logger);
const module = createOrganizationDocumentWorkerModule({
  db,
  redis: runtime.config.redis,
  logger,
  clock: runtime.clock,
  config: runtime.config.organizationDocument,
});
await module.startConsumers();
logger.info({}, "Organization crash fixture consumer started");
