/* eslint-disable antfu/no-top-level-await */
import createApp from "@iam/api-core/core/create-app";
import { createLogger } from "@iam/api-core/logger";
import { globImport } from "@iam/api-core/utils";
import appConfig from "~admin-api/app.config";
import env from "./env";

const logger = createLogger({
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
});

const routes = await globImport<{ default: any }>("./src/routes/**/*.index.ts");
const middlewares = await globImport<{ default: any[] }>("./src/routes/*/_middleware.ts");

const app = createApp(appConfig, {
  env,
  logger,
  routes,
  middlewares,
});

export type AdminApiAppType = typeof app;
export default app;
