import createApp from "@iam/api-core/core/create-app";
import appConfig from "~auth-api/app.config";
import { type CreateAuthApiCompositionOptions, createAuthApiComposition } from "./composition";
import { getWechatLoginLogPath } from "./routes/sso/wechat-login-log-path";

export async function createAuthApiApp(options: CreateAuthApiCompositionOptions = {}) {
  const composition = await createAuthApiComposition(options);
  const app = createApp(appConfig, {
    env: composition.env,
    logger: composition.logger,
    redactLogPath: getWechatLoginLogPath,
    routes: composition.routes,
    middlewares: {},
  });
  return { app, close: composition.close, port: composition.env.port, logger: composition.logger };
}

export type AppType = Awaited<ReturnType<typeof createAuthApiApp>>["app"];
