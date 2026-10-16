import { createLogger } from "@iam/api-core/logger";
import { parseGatewayEnv } from "./env";
import { startGatewayRuntime } from "./runtime";

const logger = createLogger({ nodeEnv: "production", logFormat: "json" }).child({ sourceApp: "iam-gateway" });

try {
  const env = parseGatewayEnv();
  const runtime = await startGatewayRuntime(env);
  logger.info({ event: "gateway_started", port: runtime.port }, "Gateway API started");
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: "gateway_stopping" }, "Gateway API stopping");
    try {
      await runtime.close();
      logger.info({ event: "gateway_stopped" }, "Gateway API stopped");
      process.exit(0);
    } catch {
      logger.error(
        { event: "gateway_shutdown_failed" },
        "Gateway shutdown failed; inspect remote configuration before restarting",
      );
      process.exit(1);
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch {
  logger.error(
    { event: "gateway_startup_failed" },
    "Gateway startup failed; check startup configuration and listener availability",
  );
  process.exit(1);
}
