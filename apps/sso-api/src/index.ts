import process from "node:process";
import { createSsoApiApp } from "./app";

const { app, close, logger, port, hostname } = await createSsoApiApp();
const server = await bind();

async function bind() {
  try {
    return Bun.serve({ hostname, port, fetch: app.fetch });
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "SSO API listen and cleanup failed");
    }
    throw error;
  }
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  void (async () => {
    try {
      await server.stop(false);
    } finally {
      await close();
    }
  })().then(
    () => {
      logger.info({ event: "sso.api.stopped" }, "SSO API stopped");
      process.exit(0);
    },
    () => {
      logger.error({ event: "sso.api.shutdown_failed" }, "SSO API shutdown failed");
      process.exit(1);
    },
  );
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
logger.info({ event: "sso.api.started", port: server.port }, `server: http://localhost:${server.port}`);
