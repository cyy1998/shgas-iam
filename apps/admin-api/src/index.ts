import app from "./app";
import env from "./env";

export default {
  hostname: env.hostname,
  port: env.port,
  fetch: app.fetch,
};
