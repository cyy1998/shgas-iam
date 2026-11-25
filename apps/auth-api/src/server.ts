import process from "node:process";
import { createAuthApiApp } from "./app";
import type { CreateAuthApiCompositionOptions } from "./composition";

export async function startAuthApi(options: CreateAuthApiCompositionOptions & { hostname?: string } = {}) {
  const { app, close, port, logger } = await createAuthApiApp(options);
  const server = await Promise.resolve()
    .then(() => Bun.serve({ hostname: options.hostname, port, fetch: app.fetch }))
    .catch(async (error: unknown) => {
      try {
        await close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Auth API listen and cleanup failed");
      }
      throw error;
    });
  const signals = ["SIGINT", "SIGTERM"] as const;
  let receivedSignal!: () => void;
  const stopping = new Promise<void>((resolve) => {
    receivedSignal = resolve;
    for (const signal of signals) process.on(signal, receivedSignal);
  });
  logger.info({ event: "auth.api.started", port: server.port }, `server: http://localhost:${server.port}`);
  await stopping;
  logger.info({ event: "auth.api.stopping" }, "Auth API stopping");

  const drainDeadline = setTimeout(() => void server.stop(true), 5_000);
  try {
    try {
      await server.stop(false);
    } finally {
      clearTimeout(drainDeadline);
      await close();
    }
    logger.info({ event: "auth.api.stopped" }, "Auth API stopped");
  } finally {
    for (const signal of signals) process.off(signal, receivedSignal);
  }
}
