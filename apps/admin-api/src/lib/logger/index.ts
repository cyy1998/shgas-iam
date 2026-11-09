import env from "@admin-api/env";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";

export const logger = createLogger({
  nodeEnv: env.nodeEnv,
  logLevel: env.log.level,
  logFormat: env.log.format,
  sourceApp: LoggerSourceApp.AdminApi,
});
