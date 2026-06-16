import env from "@api/env";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";

export const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  logFormat: env.LOG_FORMAT,
  sourceApp: LoggerSourceApp.Api,
});
