import process from "node:process";
import app, { closeAppComposition } from "./app";
import env from "./env";

const port = env.port;

let shutdownStarted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shutdownStarted)
      return;
    shutdownStarted = true;
    void closeAppComposition().finally(() => process.exit(0));
  });
}

export default {
  port,
  fetch: app.fetch,
};
