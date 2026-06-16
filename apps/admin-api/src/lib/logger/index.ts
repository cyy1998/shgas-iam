import env from "@admin-api/env";
import { createLogger } from "@iam/api-core/logger";

export const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  sourceApp: "iam-admin-api",
});
