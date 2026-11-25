import process from "node:process";
import { createIntegrationApiApp } from "./app";
import type { CreateIntegrationApiCompositionOptions } from "./composition";

export async function startIntegrationApi(
  options: CreateIntegrationApiCompositionOptions & { hostname?: string } = {},
) {
  const { app, close, port, logger } = await createIntegrationApiApp(options);
  const server = await Promise.resolve()
    .then(() => Bun.serve({ hostname: options.hostname, port, fetch: app.fetch }))
    .catch(async (error: unknown) => {
      try {
        await close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Integration API listen and cleanup failed");
      }
      throw error;
    });
  const signals = ["SIGINT", "SIGTERM"] as const;
  let receivedSignal!: () => void;
  const stopping = new Promise<void>((resolve) => {
    receivedSignal = resolve;
    for (const signal of signals) process.on(signal, receivedSignal);
  });
  logger.info({ event: "integration.api.started", port: server.port }, `server: http://localhost:${server.port}`);
  await stopping;
  logger.info({ event: "integration.api.stopping" }, "Integration API stopping");

  const drainDeadline = setTimeout(() => void server.stop(true), 5_000);
  try {
    try {
      await server.stop(false);
    } finally {
      clearTimeout(drainDeadline);
      await close();
    }
    logger.info({ event: "integration.api.stopped" }, "Integration API stopped");
  } finally {
    for (const signal of signals) process.off(signal, receivedSignal);
  }
}
