import createApp from "@/lib/core/create-app";
import appConfig from "~/app.config";

const app = createApp(appConfig);

export type AppType = typeof app;
export default app;
