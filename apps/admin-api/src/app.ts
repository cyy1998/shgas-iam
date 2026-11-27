import createApp from "@iam/api-core/core/create-app";
import appConfig from "~admin-api/app.config";
import { createAdminApiComposition } from "./composition";
import { logger } from "./lib/logger";
import env from "./runtime-env";

const composition = await createAdminApiComposition({ env, logger });

const app = createApp(appConfig, {
  env,
  logger,
  routes: composition.routes,
  middlewares: composition.middlewares,
});

export type AdminApiAppType = typeof app;
export default app;
