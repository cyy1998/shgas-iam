import createApp from "@iam/api-core/core/create-app";
import appConfig from "~api/app.config";
import { type CreateApiCompositionOptions, createApiComposition } from "./composition";
import { getWechatLoginLogPath } from "./routes/sso/wechat-login-log-path";

export async function createApiApp(options: CreateApiCompositionOptions = {}) {
  const composition = await createApiComposition(options);
  const app = createApp(appConfig, {
    env: composition.env,
    logger: composition.logger,
    redactLogPath: getWechatLoginLogPath,
    routes: composition.routes,
    middlewares: composition.middlewares,
  });
  return { app, close: composition.close, port: composition.env.port, logger: composition.logger };
}

export type AppType = Awaited<ReturnType<typeof createApiApp>>["app"];
