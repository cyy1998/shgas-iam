import createApp from "@iam/api-core/core/create-app";
import appConfig from "~sso-api/app.config";
import { createSsoApiComposition } from "./composition";
import { redactRetiredLoginPath } from "./routes/retired-login-path";

export async function createSsoApiApp(options?: Parameters<typeof createSsoApiComposition>[0]) {
  const { env, logger, routes, close } = await createSsoApiComposition(options);
  try {
    const app = createApp(appConfig, { env, logger, routes, middlewares: {}, redactLogPath: redactRetiredLoginPath });
    return { app, port: env.port, hostname: env.hostname, logger, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "SSO API startup and cleanup failed");
    }
    throw error;
  }
}
