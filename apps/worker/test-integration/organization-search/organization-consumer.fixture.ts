import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import { createOrganizationSearchWorkerModule } from "@iam/organization-search-read-model/worker";
import { createWorkerRuntime } from "../../src/composition/runtime";
import { parseWorkerEnv } from "../../src/env";

const env = parseWorkerEnv(process.env);
const { default: db } = await import("@iam/db");
const logger = createLogger({
  nodeEnv: env.nodeEnv,
  logLevel: env.log.level,
  logFormat: env.log.format,
  sourceApp: LoggerSourceApp.Worker,
});
const runtime = createWorkerRuntime({ env, logger });
const module = createOrganizationSearchWorkerModule({
  db,
  redis: runtime.config.redis,
  logger,
  clock: runtime.clock,
  config: runtime.config.organizationSearch,
});
await module.startConsumers();
logger.info({}, "Organization crash fixture consumer started");
