import createApp from "@api/lib/core/create-app";
import appConfig from "~api/app.config";

const app = createApp(appConfig);

export type AppType = typeof app;
export default app;
