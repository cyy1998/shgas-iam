import app from "./app";
import config from "./env";

const port = config.PORT;

export default {
  port,
  fetch: app.fetch,
};
