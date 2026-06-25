import app from "./app";
import env from "./env";

const port = env.port;

export default {
  port,
  fetch: app.fetch,
};
