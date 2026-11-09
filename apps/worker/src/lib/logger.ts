import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import loadWorkerEnv from "@worker/env";

const env = loadWorkerEnv();

export const logger = createLogger({
  nodeEnv: env.nodeEnv,
  logLevel: env.log.level,
  logFormat: env.log.format,
  sourceApp: LoggerSourceApp.Worker,
});
