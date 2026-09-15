/* eslint-disable antfu/no-top-level-await */
import createApp from "@iam/api-core/core/create-app";
import appConfig from "~api/app.config";
import { createApiComposition } from "./composition";
import env from "./env";
import { logger } from "./lib/logger";

const composition = await createApiComposition({ env, logger });

export async function closeAppComposition() {
  await composition.close();
}

const app = createApp(appConfig, {
  env,
  logger,
  routes: composition.routes,
  middlewares: composition.middlewares,
});

export const appLifecycle = {
  started(port: number) { composition.logger.info({ event: "api_started", port }, `server: http://localhost:${port}`); },
  stopped() { composition.logger.info({ event: "api_stopped" }, "API stopped"); },
  shutdownFailed() { composition.logger.error({ event: "api_shutdown_failed" }, "API shutdown failed"); },
};

export type AppType = typeof app;
export default app;
