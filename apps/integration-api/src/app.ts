import createApp from "@iam/api-core/core/create-app";
import appConfig from "~integration-api/app.config";
import { type CreateIntegrationApiCompositionOptions, createIntegrationApiComposition } from "./composition";

export async function createIntegrationApiApp(options: CreateIntegrationApiCompositionOptions = {}) {
  const { env, logger, routes, close } = await createIntegrationApiComposition(options);
  try {
    const app = createApp(appConfig, { env, logger, routes, middlewares: {} });
    return { app, close, port: env.port, logger };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Integration API app initialization and cleanup failed");
    }
    throw error;
  }
}
