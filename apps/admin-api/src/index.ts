import app from "./app";
import env from "./env";

export default {
  port: env.port,
  fetch: app.fetch,
};
