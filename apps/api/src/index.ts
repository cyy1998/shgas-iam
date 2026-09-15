import process from "node:process";
import app, { appLifecycle, closeAppComposition } from "./app";
import env from "./env";

const server = Bun.serve({ port: env.port, fetch: app.fetch });
appLifecycle.started(server.port!);
let shutdownStarted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (shutdownStarted)
      return;
    shutdownStarted = true;
    void (async () => {
      try {
        await server.stop(false);
        await closeAppComposition();
        appLifecycle.stopped();
        process.exit(0);
      }
      catch {
        appLifecycle.shutdownFailed();
        process.exit(1);
      }
    })();
  });
}
