import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import env from "@worker/env";

export const logger = createLogger({
  nodeEnv: env.nodeEnv,
  logLevel: env.log.level,
  logFormat: env.log.format,
  sourceApp: LoggerSourceApp.Worker,
});
