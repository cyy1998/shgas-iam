import app from "./app";
import env from "./runtime-env";

export default {
  hostname: env.hostname,
  port: env.port,
  fetch: app.fetch,
};
