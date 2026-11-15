import process from "node:process";
import { createApiApp } from "./app";
import type { CreateApiCompositionOptions } from "./composition";

export async function startApi(options: CreateApiCompositionOptions = {}) {
  const { app, close, port, logger } = await createApiApp(options);
  const server = Bun.serve({ port, fetch: app.fetch });
  logger.info({ event: "api_started", port: server.port }, `server: http://localhost:${server.port}`);
  let shutdownStarted = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      void (async () => {
        try {
          await server.stop(false);
          await close();
          logger.info({ event: "api_stopped" }, "API stopped");
          process.exit(0);
        } catch {
          logger.error({ event: "api_shutdown_failed" }, "API shutdown failed");
          process.exit(1);
        }
      })();
    });
  }
}
