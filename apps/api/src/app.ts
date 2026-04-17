import createApp from "./lib/core/create-app";

const app = createApp();

export type AppType = typeof app;
export default app;
